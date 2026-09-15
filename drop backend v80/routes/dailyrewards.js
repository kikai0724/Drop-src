const express = require("express");
const app = express.Router();
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const Profiles = require("../model/profiles.js");
const mongoose = require("mongoose");

// Daily rewards tracking schema
const DailyRewardsSchema = new mongoose.Schema({
    accountId: { type: String, required: true, unique: true },
    lastClaimDate: { type: Date },
    consecutiveDays: { type: Number, default: 0 },
    totalClaims: { type: Number, default: 0 }
}, { collection: "dailyrewards" });

const DailyRewards = mongoose.models.DailyRewards || mongoose.model('DailyRewards', DailyRewardsSchema);

// Daily reward tiers
const REWARD_TIERS = [
    { day: 1, vbucks: 50, xp: 100 },
    { day: 2, vbucks: 75, xp: 150 },
    { day: 3, vbucks: 100, xp: 200 },
    { day: 4, vbucks: 125, xp: 250 },
    { day: 5, vbucks: 150, xp: 300 },
    { day: 6, vbucks: 200, xp: 400 },
    { day: 7, vbucks: 300, xp: 600, bonus: "Rare cosmetic" }
];

// Check daily reward eligibility
app.get("/fortnite/api/dailyrewards/:accountId/status", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/dailyrewards/${req.params.accountId}/status`);
    
    try {
        const rewards = await DailyRewards.findOne({ accountId: req.params.accountId }).lean();
        
        if (!rewards) {
            // First time setup
            const newRewards = new DailyRewards({
                accountId: req.params.accountId,
                lastClaimDate: null,
                consecutiveDays: 0,
                totalClaims: 0
            });
            await newRewards.save();
            
            res.json({
                canClaim: true,
                consecutiveDays: 0,
                nextClaimDay: 1,
                currentReward: REWARD_TIERS[0]
            });
            return;
        }
        
        const now = new Date();
        const lastClaimDate = rewards.lastClaimDate ? new Date(rewards.lastClaimDate) : null;
        
        // Check if eligible to claim
        const canClaim = !lastClaimDate || isNewDay(lastClaimDate, now);
        
        const nextClaimDay = canClaim ? 
            Math.min(rewards.consecutiveDays + 1, REWARD_TIERS.length) : 
            rewards.consecutiveDays;
        
        res.json({
            canClaim,
            consecutiveDays: rewards.consecutiveDays,
            nextClaimDay,
            currentReward: REWARD_TIERS[nextClaimDay - 1] || REWARD_TIERS[0],
            lastClaimDate: rewards.lastClaimDate
        });
    } catch (err) {
        log.error(`Error checking daily reward status: ${err.message}`);
        res.json({
            canClaim: false,
            consecutiveDays: 0,
            nextClaimDay: 1,
            currentReward: REWARD_TIERS[0]
        });
    }
});

// Claim daily reward
app.post("/fortnite/api/dailyrewards/:accountId/claim", verifyToken, async (req, res) => {
    log.debug(`POST /fortnite/api/dailyrewards/${req.params.accountId}/claim`);
    
    try {
        let rewards = await DailyRewards.findOne({ accountId: req.params.accountId });
        
        if (!rewards) {
            rewards = new DailyRewards({
                accountId: req.params.accountId,
                consecutiveDays: 0,
                totalClaims: 0
            });
        }
        
        const now = new Date();
        const lastClaimDate = rewards.lastClaimDate ? new Date(rewards.lastClaimDate) : null;
        
        // Check eligibility
        const canClaim = !lastClaimDate || isNewDay(lastClaimDate, now);
        
        if (!canClaim) {
            return error.createError(
                "errors.com.epicgames.dailyrewards.already_claimed",
                "Daily reward already claimed",
                undefined, 1040, undefined, 400, res
            );
        }
        
        // Reset consecutive days if more than 1 day passed
        if (lastClaimDate && getDaysDifference(lastClaimDate, now) > 1) {
            rewards.consecutiveDays = 1;
        } else {
            rewards.consecutiveDays = Math.min(rewards.consecutiveDays + 1, REWARD_TIERS.length);
        }
        
        rewards.lastClaimDate = now;
        rewards.totalClaims += 1;
        await rewards.save();
        
        // Grant rewards
        const rewardTier = REWARD_TIERS[rewards.consecutiveDays - 1] || REWARD_TIERS[0];
        
        const profiles = await Profiles.findOne({ accountId: req.params.accountId });
        
        if (profiles) {
            // Grant V-Bucks
            if (rewardTier.vbucks > 0) {
                profiles.profiles.athena.items.Currency.MtxCurrency += rewardTier.vbucks;
            }
            
            // Grant XP (stored in stats)
            await profiles.save();
        }
        
        res.json({
            success: true,
            consecutiveDays: rewards.consecutiveDays,
            reward: {
                vbucks: rewardTier.vbucks,
                xp: rewardTier.xp,
                bonus: rewardTier.bonus
            },
            nextClaim: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
    } catch (err) {
        log.error(`Error claiming daily reward: ${err.message}`);
        error.createError(
            "errors.com.epicgames.dailyrewards.claim_failed",
            "Failed to claim daily reward",
            undefined, 12815, undefined, 500, res
        );
    }
});

// Get weekly rewards
app.get("/fortnite/api/weeklyrewards/:accountId/status", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/weeklyrewards/${req.params.accountId}/status`);
    
    try {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);
        
        res.json({
            weekStartDate: startOfWeek.toISOString(),
            weekEndDate: new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            rewardsAvailable: [
                { day: 1, vbucks: 100, xp: 500 },
                { day: 2, vbucks: 150, xp: 750 },
                { day: 3, vbucks: 200, xp: 1000 },
                { day: 4, vbucks: 250, xp: 1250 },
                { day: 5, vbucks: 300, xp: 1500 },
                { day: 6, vbucks: 400, xp: 2000 },
                { day: 7, vbucks: 500, xp: 3000, bonus: "Legendary cosmetic" }
            ]
        });
    } catch (err) {
        log.error(`Error fetching weekly rewards: ${err.message}`);
        res.json({ rewardsAvailable: [] });
    }
});

// Helper functions
function isNewDay(lastDate, currentDate) {
    return lastDate.getDate() !== currentDate.getDate() ||
           lastDate.getMonth() !== currentDate.getMonth() ||
           lastDate.getFullYear() !== currentDate.getFullYear();
}

function getDaysDifference(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1 - date2) / oneDay));
}

module.exports = app;

