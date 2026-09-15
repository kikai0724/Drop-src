const express = require("express");
const app = express.Router();
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const Profiles = require("../model/profiles.js");
const User = require("../model/user.js");

// Get available achievements
app.get("/fortnite/api/achievements/:accountId", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/achievements/${req.params.accountId}`);
    
    try {
        const profiles = await Profiles.findOne({ accountId: req.params.accountId }).lean();
        
        if (!profiles) {
            return error.createError(
                "errors.com.epicgames.modules.profile.profile_not_found",
                "Profile not found",
                [req.params.accountId], 12806, undefined, 404, res
            );
        }
        
        // Get achievements from profile metadata
        const achievements = profiles.achievements || [];
        
        res.json({
            items: achievements,
            pagination: {
                count: achievements.length,
                sortField: "timestamp",
                sortDir: "desc"
            }
        });
    } catch (err) {
        log.error(`Error fetching achievements: ${err.message}`);
        res.json({ items: [], pagination: { count: 0 } });
    }
});

// Grant achievement to player
app.post("/fortnite/api/achievements/:accountId/grant", verifyToken, async (req, res) => {
    log.debug(`POST /fortnite/api/achievements/${req.params.accountId}/grant`);
    
    try {
        const { achievementId, achievementName, rewardVbucks } = req.body;
        
        const profiles = await Profiles.findOne({ accountId: req.params.accountId });
        
        if (!profiles) {
            return error.createError(
                "errors.com.epicgames.modules.profile.profile_not_found",
                "Profile not found",
                [req.params.accountId], 12806, undefined, 404, res
            );
        }
        
        // Initialize achievements array if it doesn't exist
        if (!profiles.achievements) {
            profiles.achievements = [];
        }
        
        // Check if achievement already exists
        const existingAchievement = profiles.achievements.find(a => a.achievementId === achievementId);
        
        if (!existingAchievement) {
            const newAchievement = {
                achievementId,
                achievementName,
                unlockedAt: new Date().toISOString(),
                vbucksReward: rewardVbucks || 0
            };
            
            profiles.achievements.push(newAchievement);
            
            // Grant vbucks reward if specified
            if (rewardVbucks > 0) {
                profiles.profiles.athena.items.Currency.MtxCurrency += rewardVbucks;
            }
            
            await profiles.save();
            
            res.json({ success: true, achievement: newAchievement });
        } else {
            res.json({ success: true, achievement: existingAchievement, alreadyUnlocked: true });
        }
    } catch (err) {
        log.error(`Error granting achievement: ${err.message}`);
        error.createError(
            "errors.com.epicgames.modules.achievements.grant_failed",
            "Failed to grant achievement",
            undefined, 12807, undefined, 500, res
        );
    }
});

// Get achievement rewards
app.get("/fortnite/api/achievements/rewards", verifyToken, async (req, res) => {
    log.debug("GET /fortnite/api/achievements/rewards");
    
    const achievementRewards = [
        {
            achievementId: "win_first_match",
            achievementName: "First Victory",
            description: "Win your first match",
            vbucksReward: 100,
            xpReward: 500
        },
        {
            achievementId: "elim_100_players",
            achievementName: "Slayer",
            description: "Eliminate 100 players",
            vbucksReward: 200,
            xpReward: 1000
        },
        {
            achievementId: "play_100_matches",
            achievementName: "Veteran",
            description: "Play 100 matches",
            vbucksReward: 300,
            xpReward: 1500
        },
        {
            achievementId: "win_10_matches",
            achievementName: "Champion",
            description: "Win 10 matches",
            vbucksReward: 500,
            xpReward: 2000
        },
        {
            achievementId: "elim_500_players",
            achievementName: "Elite Slayer",
            description: "Eliminate 500 players",
            vbucksReward: 1000,
            xpReward: 5000
        }
    ];
    
    res.json({ rewards: achievementRewards });
});

module.exports = app;

