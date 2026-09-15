const express = require("express");
const app = express.Router();
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const User = require("../model/user.js");
const UserStats = require("../model/userstats.js");
const mongoose = require("mongoose");

// Analytics events schema
const AnalyticsSchema = new mongoose.Schema({
    eventType: { type: String, required: true },
    accountId: { type: String },
    data: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed }
}, { collection: "analytics", timeseries: { timeField: "timestamp", granularity: "hours" } });

const Analytics = mongoose.models.Analytics || mongoose.model('Analytics', AnalyticsSchema);

// Track event
app.post("/fortnite/api/analytics/event", verifyToken, async (req, res) => {
    try {
        const { eventType, data } = req.body;
        
        if (!eventType) {
            return res.status(400).json({ error: "eventType is required" });
        }
        
        const event = new Analytics({
            eventType,
            accountId: req.user.accountId,
            data,
            metadata: {
                ip: req.ip,
                userAgent: req.headers["user-agent"]
            }
        });
        
        await event.save();
        
        res.json({ success: true });
    } catch (err) {
        log.error(`Error tracking event: ${err.message}`);
        res.json({ success: false });
    }
});

// Get player analytics
app.get("/fortnite/api/analytics/:accountId/summary", verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        // Get session data
        const recentActivity = await Analytics.find({
            accountId,
            timestamp: { $gte: last24Hours }
        }).lean();
        
        // Get stats
        const stats = await UserStats.findOne({ accountId }).lean();
        
        // Get playtime
        const sessionEvents = recentActivity.filter(e => e.eventType === "session_start" || e.eventType === "session_end");
        const playtimeMinutes = calculatePlaytime(sessionEvents);
        
        res.json({
            last24Hours: {
                playtimeMinutes,
                eventsLogged: recentActivity.length,
                matchesPlayed: stats?.stats?.matchesplayed || 0
            },
            overall: {
                totalMatches: stats?.stats?.matchesplayed || 0,
                totalEliminations: stats?.stats?.eliminations || 0,
                totalWins: stats?.stats?.placetop1 || 0,
                winRate: stats?.stats?.matchesplayed > 0 ? 
                    ((stats?.stats?.placetop1 || 0) / stats?.stats?.matchesplayed * 100).toFixed(2) : 0
            }
        });
    } catch (err) {
        log.error(`Error fetching analytics: ${err.message}`);
        res.json({
            last24Hours: { playtimeMinutes: 0, eventsLogged: 0, matchesPlayed: 0 },
            overall: { totalMatches: 0, totalEliminations: 0, totalWins: 0, winRate: 0 }
        });
    }
});

// Get server-wide analytics
app.get("/fortnite/api/analytics/server/summary", verifyToken, async (req, res) => {
    try {
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Total registered users
        const totalUsers = await User.countDocuments();
        
        // Active users in last 24 hours
        const activeUsers = await Analytics.distinct("accountId", {
            timestamp: { $gte: last24Hours }
        });
        
        // Total matches played
        const allStats = await UserStats.find({}).lean();
        const totalMatches = allStats.reduce((sum, stat) => sum + (stat.stats?.matchesplayed || 0), 0);
        
        // Online players (from XMPP connections)
        const onlinePlayers = global.Clients ? global.Clients.length : 0;
        
        res.json({
            totalUsers,
            activeUsers24h: activeUsers.length,
            onlinePlayers,
            totalMatches,
            averageMatchesPerUser: totalUsers > 0 ? (totalMatches / totalUsers).toFixed(2) : 0
        });
    } catch (err) {
        log.error(`Error fetching server analytics: ${err.message}`);
        res.json({
            totalUsers: 0,
            activeUsers24h: 0,
            onlinePlayers: 0,
            totalMatches: 0,
            averageMatchesPerUser: 0
        });
    }
});

// Get event breakdown
app.get("/fortnite/api/analytics/events/breakdown", verifyToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const query = {};
        if (startDate && endDate) {
            query.timestamp = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        
        const events = await Analytics.aggregate([
            { $match: query },
            { $group: { _id: "$eventType", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        res.json({ events });
    } catch (err) {
        log.error(`Error fetching event breakdown: ${err.message}`);
        res.json({ events: [] });
    }
});

// Helper functions
function calculatePlaytime(events) {
    let totalMinutes = 0;
    let sessionStart = null;
    
    for (const event of events) {
        if (event.eventType === "session_start") {
            sessionStart = event.timestamp;
        } else if (event.eventType === "session_end" && sessionStart) {
            const duration = new Date(event.timestamp) - new Date(sessionStart);
            totalMinutes += duration / (1000 * 60);
            sessionStart = null;
        }
    }
    
    return Math.round(totalMinutes);
}

module.exports = app;

