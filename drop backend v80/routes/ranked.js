const express = require("express");
const app = express.Router();
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const Profiles = require("../model/profiles.js");
const UserStats = require("../model/userstats.js");

// Ranked tiers
const RANKED_TIERS = {
    "BRONZE": { minMMR: 0, maxMMR: 999 },
    "SILVER": { minMMR: 1000, maxMMR: 1999 },
    "GOLD": { minMMR: 2000, maxMMR: 2999 },
    "PLATINUM": { minMMR: 3000, maxMMR: 3999 },
    "DIAMOND": { minMMR: 4000, maxMMR: 4999 },
    "MASTER": { minMMR: 5000, maxMMR: 6999 },
    "GRANDMASTER": { minMMR: 7000, maxMMR: 999999 }
};

// Get player's ranked stats
app.get("/fortnite/api/ranked/:accountId", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/ranked/${req.params.accountId}`);
    
    try {
        const stats = await UserStats.findOne({ accountId: req.params.accountId }).lean();
        
        const mmr = stats?.rankedMMR || 0;
        const tier = getTierForMMR(mmr);
        
        res.json({
            accountId: req.params.accountId,
            tier: tier.name,
            mmr: mmr,
            division: tier.division,
            rankProgress: calculateRankProgress(mmr, tier),
            seasonRank: stats?.seasonRank || 0,
            matchesPlayed: stats?.rankedMatches || 0,
            wins: stats?.rankedWins || 0
        });
    } catch (err) {
        log.error(`Error fetching ranked stats: ${err.message}`);
        res.json({
            accountId: req.params.accountId,
            tier: "BRONZE",
            mmr: 0,
            division: 1,
            rankProgress: 0,
            seasonRank: 0,
            matchesPlayed: 0,
            wins: 0
        });
    }
});

// Get ranked leaderboard
app.get("/fortnite/api/ranked/leaderboard/:tier", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/ranked/leaderboard/${req.params.tier}`);
    
    try {
        const tier = req.params.tier.toUpperCase();
        const tierRange = RANKED_TIERS[tier];
        
        if (!tierRange) {
            return error.createError(
                "errors.com.epicgames.validation.validation_failed",
                "Invalid tier",
                [tier], 1040, undefined, 400, res
            );
        }
        
        const stats = await UserStats.find({
            rankedMMR: { $gte: tierRange.minMMR, $lte: tierRange.maxMMR }
        })
        .sort({ rankedMMR: -1 })
        .limit(100)
        .lean();
        
        const leaderboard = stats.map((stat, index) => ({
            rank: index + 1,
            accountId: stat.accountId,
            mmr: stat.rankedMMR,
            tier: tier,
            wins: stat.rankedWins || 0,
            matchesPlayed: stat.rankedMatches || 0
        }));
        
        res.json({ entries: leaderboard });
    } catch (err) {
        log.error(`Error fetching ranked leaderboard: ${err.message}`);
        res.json({ entries: [] });
    }
});

// Update ranked stats after match
app.post("/fortnite/api/ranked/:accountId/update", verifyToken, async (req, res) => {
    log.debug(`POST /fortnite/api/ranked/${req.params.accountId}/update`);
    
    try {
        const { placement, eliminations, isWin } = req.body;
        
        let stats = await UserStats.findOne({ accountId: req.params.accountId });
        
        if (!stats) {
            stats = new UserStats({
                accountId: req.params.accountId,
                rankedMMR: 1000, // Starting MMR
                rankedMatches: 0,
                rankedWins: 0
            });
        }
        
        // Calculate MMR change based on performance
        const mmrChange = calculateMMRChange(placement, eliminations, isWin);
        stats.rankedMMR += mmrChange;
        stats.rankedMMR = Math.max(0, stats.rankedMMR); // Prevent negative MMR
        stats.rankedMatches = (stats.rankedMatches || 0) + 1;
        
        if (isWin) {
            stats.rankedWins = (stats.rankedWins || 0) + 1;
        }
        
        await stats.save();
        
        const newTier = getTierForMMR(stats.rankedMMR);
        
        res.json({
            success: true,
            newMMR: stats.rankedMMR,
            mmrChange: mmrChange,
            newTier: newTier.name,
            division: newTier.division
        });
    } catch (err) {
        log.error(`Error updating ranked stats: ${err.message}`);
        error.createError(
            "errors.com.epicgames.ranked.update_failed",
            "Failed to update ranked stats",
            undefined, 12814, undefined, 500, res
        );
    }
});

// Helper functions
function getTierForMMR(mmr) {
    for (const [tierName, tierRange] of Object.entries(RANKED_TIERS)) {
        if (mmr >= tierRange.minMMR && mmr <= tierRange.maxMMR) {
            const rangeSize = tierRange.maxMMR - tierRange.minMMR;
            const progress = mmr - tierRange.minMMR;
            const division = Math.floor((progress / rangeSize) * 3) + 1; // 1-3 divisions per tier
            
            return { name: tierName, division };
        }
    }
    return { name: "BRONZE", division: 1 };
}

function calculateMMRChange(placement, eliminations, isWin) {
    let change = 0;
    
    // Placement bonus/penalty
    if (isWin) {
        change += 50;
    } else if (placement <= 10) {
        change += 25;
    } else if (placement <= 25) {
        change += 10;
    } else {
        change -= 10;
    }
    
    // Eliminations bonus
    change += eliminations * 5;
    
    // Cap the changes
    return Math.max(-100, Math.min(100, change));
}

function calculateRankProgress(mmr, tier) {
    const tierRange = RANKED_TIERS[tier.name];
    const progress = ((mmr - tierRange.minMMR) / (tierRange.maxMMR - tierRange.minMMR)) * 100;
    return Math.round(progress);
}

module.exports = app;

