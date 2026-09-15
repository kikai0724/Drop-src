const express = require("express");
const app = express.Router();
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");
const Profiles = require("../model/profiles.js");
const UserStats = require("../model/userstats.js");

// Get player statistics
app.get("/fortnite/api/stats/accountId/:accountId/survivor/:statId", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/stats/accountId/${req.params.accountId}/survivor/${req.params.statId}`);
    
    try {
        let stats = await UserStats.findOne({ accountId: req.params.accountId }).lean();
        
        if (!stats) {
            // Create default stats if they don't exist
            stats = {
                accountId: req.params.accountId,
                stats: {
                    "eliminations": 0,
                    "matchesplayed": 0,
                    "lastmodified": 0,
                    "minutesplayed": 0,
                    "placetop1": 0,
                    "placetop3": 0,
                    "placetop6": 0,
                    "placetop10": 0,
                    "placetop25": 0,
                    "score": 0,
                    "playersoutlived": 0
                }
            };
        }
        
        res.json(stats.stats);
    } catch (err) {
        log.error(`Error fetching stats: ${err.message}`);
        error.createError("errors.com.epicgames.modules.stats.stats_not_found", "Stats not found", undefined, 12001, undefined, 404, res);
    }
});

// Update player statistics
app.post("/fortnite/api/stats/accountId/:accountId/stats/bulk", verifyToken, async (req, res) => {
    log.debug(`POST /fortnite/api/stats/accountId/${req.params.accountId}/stats/bulk`);
    
    try {
        let stats = await UserStats.findOne({ accountId: req.params.accountId });
        
        if (!stats) {
            stats = new UserStats({
                accountId: req.params.accountId,
                stats: {}
            });
        }
        
        // Merge new stats with existing
        if (req.body.stats) {
            stats.stats = { ...stats.stats, ...req.body.stats };
        }
        
        stats.stats.lastmodified = Date.now();
        await stats.save();
        
        res.json(stats.stats);
    } catch (err) {
        log.error(`Error updating stats: ${err.message}`);
        error.createError("errors.com.epicgames.modules.stats.stats_update_failed", "Failed to update stats", undefined, 12002, undefined, 500, res);
    }
});

// Get leaderboard
app.get("/fortnite/api/leaderboards/type/:statType/range/:range", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/leaderboards/type/${req.params.statType}/range/${req.params.range}`);
    
    try {
        const statType = req.params.statType;
        const range = req.params.range; // "alltime", "monthly", "weekly", "daily"
        
        let stats = await UserStats.find({}).lean();
        
        // Sort by the specified stat
        stats.sort((a, b) => {
            const aValue = a.stats && a.stats[statType] ? a.stats[statType] : 0;
            const bValue = b.stats && b.stats[statType] ? b.stats[statType] : 0;
            return bValue - aValue;
        });
        
        // Return top players
        const limit = 100;
        const leaderboard = stats.slice(0, limit).map((stat, index) => ({
            accountId: stat.accountId,
            rank: index + 1,
            value: stat.stats[statType] || 0
        }));
        
        res.json({
            entries: leaderboard,
            nextKey: stats.length > limit ? limit : undefined
        });
    } catch (err) {
        log.error(`Error fetching leaderboard: ${err.message}`);
        res.json({ entries: [], nextKey: undefined });
    }
});

module.exports = app;

