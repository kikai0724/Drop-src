const express = require("express");
const app = express.Router();
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const error = require("../structs/error.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const User = require("../model/user.js");
const Profiles = require("../model/profiles.js");
const UserStats = require("../model/userstats.js");
const matchmaker = require("../matchmaker/matchmaker.js");
const configPath = path.join(__dirname, "..", "Config", "config.json");
const catalogConfigPath = path.join(__dirname, "..", "Config", "catalog_config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

function requireLocalAdmin(req, res, next) {
    next();
}

function readConfig() {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function writeConfig(data) {
    fs.writeFileSync(configPath, JSON.stringify(data, null, 4));
}

function readCatalogConfig() {
    return JSON.parse(fs.readFileSync(catalogConfigPath, "utf8"));
}

function writeCatalogConfig(data) {
    fs.writeFileSync(catalogConfigPath, JSON.stringify(data, null, 2));
}

function getNestedValue(obj, key) {
    return key.split('.').reduce((current, part) => current?.[part], obj);
}

function setNestedValue(obj, key, value) {
    const parts = key.split('.');
    let current = obj;

    parts.slice(0, -1).forEach((part) => {
        if (current[part] === undefined || typeof current[part] !== "object" || Array.isArray(current[part])) {
            current[part] = {};
        }
        current = current[part];
    });

    current[parts[parts.length - 1]] = value;
}

function coerceValue(value) {
    if (typeof value !== "string") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^-?\d+$/.test(value)) return Number(value);
    if (value === "null") return null;
    return value;
}

function getAllowedSettingKeys() {
    return [
        "port",
        "bEnableDebugLogs",
        "bEnableFormattedLogs",
        "bEnableRebootUser",
        "bEnableCrossBans",
        "bEnableBattlepass",
        "bBattlePassSeason",
        "bEnableLoginGrantSkin",
        "bLoginGrantSkinTemplateId",
        "bLoginGrantSkinStartAt",
        "bLoginGrantSkinEndAt",
        "bLoginGrantSkinDurationDays",
        "bEnableOnlyOneVersionJoinable",
        "bVersionJoinable",
        "bUseAutoRotate",
        "bEnableAutoRotateDebugLogs",
        "bEnableDiscordWebhook",
        "bEnableReports",
        "bReportChannelId",
        "bEnableHTTPS",
        "bEnableCalderaService",
        "bCalderaServicePort",
        "bGameVersion",
        "bEnableSACRewards",
        "bPercentageSACRewards",
        "bEnableAutoBackendRestart",
        "bRestartTime",
        "discord.bUseDiscordBot",
        "discord.bEnableInGamePlayerCount",
        "chat.EnableGlobalChat",
        "Api.bApiKey",
        "Website.bUseWebsite",
        "Website.websiteport"
    ];
}

// Verify admin privileges
function verifyAdmin(req, res, next) {
    // Check if user is in moderators list
    const isModerator = config.moderators.includes(req.user.accountId);
    
    if (!isModerator) {
        return error.createError(
            "errors.com.epicgames.common.missing_permission",
            "You do not have permission to access this resource",
            undefined, 403, undefined, 403, res
        );
    }
    
    next();
}

function disconnectBannedUser(accountId) {
    matchmaker.kickPlayer(accountId);
    if (typeof global.kickUserFromGame === "function") {
        global.kickUserFromGame(accountId);
    }

    if (Array.isArray(global.refreshTokens)) {
        global.refreshTokens = global.refreshTokens.filter((token) => token.accountId !== accountId);
    }
    if (Array.isArray(global.accessTokens)) {
        global.accessTokens = global.accessTokens.filter((token) => token.accountId !== accountId);
    }
    if (typeof functions.UpdateTokens === "function") functions.UpdateTokens();

    if (Array.isArray(global.Clients)) {
        global.Clients.filter((client) => client.accountId === accountId).forEach((client) => {
            if (client.client && typeof client.client.close === "function") client.client.close();
        });
    }
}

app.post("/createhostacc", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const requestedUsername = String(req.body?.username || req.body?.name || "ArenaHost").trim();
        const requestedEmail = String(req.body?.email || `${requestedUsername.toLowerCase().replace(/\s+/g, "_")}_${functions.MakeID().replace(/-/g, "").slice(0, 8)}@host.local`).trim();
        const requestedPassword = String(req.body?.password || `Host${functions.MakeID().replace(/-/g, "").slice(0, 12)}`);
        const normalizedUsername = requestedUsername || "ArenaHost";
        const normalizedEmail = requestedEmail.toLowerCase();

        const created = await functions.registerUser(null, normalizedUsername, normalizedEmail, requestedPassword, true);
        if (created?.status && created.status !== 200) {
            return res.status(created.status || 400).json({ success: false, message: created.message || "Unable to create host account" });
        }

        return res.status(200).json({
            success: true,
            message: created?.message || "Successfully created host account",
            username: normalizedUsername,
            email: normalizedEmail,
            password: requestedPassword,
            isServer: true
        });
    } catch (error) {
        log.error(`createhostacc route failed: ${error?.message || String(error)}`);
        return res.status(500).json({ success: false, message: "Unable to create host account" });
    }
});

// Get server statistics
app.get("/fortnite/api/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
    log.debug("GET /fortnite/api/admin/stats");
    
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ banned: false });
        const bannedUsers = await User.countDocuments({ banned: true });
        
        const totalProfiles = await Profiles.countDocuments();
        
        const onlineUsers = global.Clients ? global.Clients.length : 0;
        
        // Get top players by stats
        const topPlayers = await UserStats.find({})
            .sort({ "stats.eliminations": -1 })
            .limit(10)
            .lean();
        
        res.json({
            totalUsers,
            activeUsers,
            bannedUsers,
            totalProfiles,
            onlineUsers,
            topPlayers: topPlayers.map(p => ({
                accountId: p.accountId,
                eliminations: p.stats?.eliminations || 0
            }))
        });
    } catch (err) {
        log.error(`Error fetching admin stats: ${err.message}`);
        res.json({
            totalUsers: 0,
            activeUsers: 0,
            bannedUsers: 0,
            totalProfiles: 0,
            onlineUsers: 0,
            topPlayers: []
        });
    }
});

// Get user list with pagination
app.get("/fortnite/api/admin/users", verifyToken, verifyAdmin, async (req, res) => {
    log.debug("GET /fortnite/api/admin/users");
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        
        const searchQuery = req.query.search || "";
        const query = searchQuery ? { 
            $or: [
                { username: { $regex: searchQuery, $options: "i" } },
                { accountId: { $regex: searchQuery, $options: "i" } },
                { email: { $regex: searchQuery, $options: "i" } }
            ]
        } : {};
        
        const users = await User.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ created: -1 })
            .lean();
        
        const total = await User.countDocuments(query);
        
        res.json({
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        log.error(`Error fetching users: ${err.message}`);
        res.json({ users: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } });
    }
});

// Ban/unban user
app.post("/fortnite/api/admin/users/:accountId/ban", verifyToken, verifyAdmin, async (req, res) => {
    log.debug(`POST /fortnite/api/admin/users/${req.params.accountId}/ban`);
    
    try {
        const { reason } = req.body;
        
        const user = await User.findOne({ accountId: req.params.accountId });
        
        if (!user) {
            return error.createError(
                "errors.com.epicgames.account.account_not_found",
                "User not found",
                [req.params.accountId], 18007, undefined, 404, res
            );
        }
        
        user.banned = true;
        await user.save();
        disconnectBannedUser(user.accountId);
        
        log.admin(`User ${req.params.accountId} banned by ${req.user.accountId}. Reason: ${reason || "No reason provided"}`);
        
        res.json({ success: true, message: "User banned successfully" });
    } catch (err) {
        log.error(`Error banning user: ${err.message}`);
        error.createError(
            "errors.com.epicgames.admin.ban_failed",
            "Failed to ban user",
            undefined, 12816, undefined, 500, res
        );
    }
});

app.post("/fortnite/api/admin/users/:accountId/unban", verifyToken, verifyAdmin, async (req, res) => {
    log.debug(`POST /fortnite/api/admin/users/${req.params.accountId}/unban`);
    
    try {
        const user = await User.findOne({ accountId: req.params.accountId });
        
        if (!user) {
            return error.createError(
                "errors.com.epicgames.account.account_not_found",
                "User not found",
                [req.params.accountId], 18007, undefined, 404, res
            );
        }
        
        user.banned = false;
        await user.save();
        
        log.admin(`User ${req.params.accountId} unbanned by ${req.user.accountId}`);
        
        res.json({ success: true, message: "User unbanned successfully" });
    } catch (err) {
        log.error(`Error unbanning user: ${err.message}`);
        error.createError(
            "errors.com.epicgames.admin.unban_failed",
            "Failed to unban user",
            undefined, 12817, undefined, 500, res
        );
    }
});

// Grant/remove items
app.post("/fortnite/api/admin/users/:accountId/items/grant", verifyToken, verifyAdmin, async (req, res) => {
    log.debug(`POST /fortnite/api/admin/users/${req.params.accountId}/items/grant`);
    
    try {
        const { items } = req.body;
        
        if (!items || !Array.isArray(items)) {
            return error.createError(
                "errors.com.epicgames.validation.validation_failed",
                "Items array required",
                ["items"], 1040, undefined, 400, res
            );
        }
        
        const profiles = await Profiles.findOne({ accountId: req.params.accountId });
        
        if (!profiles) {
            return error.createError(
                "errors.com.epicgames.modules.profile.profile_not_found",
                "Profile not found",
                [req.params.accountId], 12806, undefined, 404, res
            );
        }
        
        // Grant items
        for (const item of items) {
            if (item.templateId) {
                profiles.profiles.athena.items[item.templateId] = {
                    templateId: item.templateId,
                    attributes: {
                        item_seen: false
                    }
                };
            }
        }
        
        await profiles.save();
        
        log.admin(`Items granted to ${req.params.accountId} by ${req.user.accountId}`);
        
        res.json({ success: true, message: "Items granted successfully" });
    } catch (err) {
        log.error(`Error granting items: ${err.message}`);
        error.createError(
            "errors.com.epicgames.admin.items_grant_failed",
            "Failed to grant items",
            undefined, 12818, undefined, 500, res
        );
    }
});

// Broadcast message to all players
app.post("/fortnite/api/admin/broadcast", verifyToken, verifyAdmin, async (req, res) => {
    log.debug("POST /fortnite/api/admin/broadcast");
    
    try {
        const { message, title, type } = req.body;
        
        if (!message) {
            return error.createError(
                "errors.com.epicgames.validation.validation_failed",
                "Message is required",
                ["message"], 1040, undefined, 400, res
            );
        }
        
        // Send broadcast to all connected clients
        if (global.Clients && global.Clients.length > 0) {
            global.Clients.forEach(client => {
                functions.sendXmppMessageToId(client.accountId, {
                    type: "broadcast",
                    title: title || "Admin Broadcast",
                    message: message,
                    broadcastType: type || "info"
                });
            });
        }
        
        log.admin(`Broadcast sent by ${req.user.accountId}: ${message}`);
        
        res.json({ success: true, message: "Broadcast sent successfully" });
    } catch (err) {
        log.error(`Error sending broadcast: ${err.message}`);
        error.createError(
            "errors.com.epicgames.admin.broadcast_failed",
            "Failed to send broadcast",
            undefined, 12819, undefined, 500, res
        );
    }
});

// Serve admin panel HTML
app.get("/admin", requireLocalAdmin, (req, res) => {
    const adminPanelPath = path.join(__dirname, "../AdminPanel/index.html");
    res.sendFile(adminPanelPath);
});

// Serve admin panel static files (CSS, JS)
app.get("/admin/:file", requireLocalAdmin, (req, res) => {
    const file = req.params.file;
    const allowedFiles = ["styles.css", "admin.js"];
    
    if (!allowedFiles.includes(file)) {
        return error.createError(
            "errors.com.epicgames.common.not_found",
            "File not found",
            undefined, 1004, undefined, 404, res
        );
    }
    
    const filePath = path.join(__dirname, "../AdminPanel", file);
    res.sendFile(filePath);
});

app.get("/api/admin/settings", requireLocalAdmin, (req, res) => {
    try {
        const settings = readConfig();
        res.json({
            success: true,
            settings: {
                port: settings.port,
                bEnableDebugLogs: settings.bEnableDebugLogs,
                bEnableFormattedLogs: settings.bEnableFormattedLogs,
                bEnableRebootUser: settings.bEnableRebootUser,
                bEnableCrossBans: settings.bEnableCrossBans,
                bEnableBattlepass: settings.bEnableBattlepass,
                bBattlePassSeason: settings.bBattlePassSeason,
                bEnableLoginGrantSkin: settings.bEnableLoginGrantSkin,
                bLoginGrantSkinTemplateId: settings.bLoginGrantSkinTemplateId,
                bLoginGrantSkinStartAt: settings.bLoginGrantSkinStartAt,
                bLoginGrantSkinEndAt: settings.bLoginGrantSkinEndAt,
                bLoginGrantSkinDurationDays: settings.bLoginGrantSkinDurationDays,
                bEnableOnlyOneVersionJoinable: settings.bEnableOnlyOneVersionJoinable,
                bVersionJoinable: settings.bVersionJoinable,
                bUseAutoRotate: settings.bUseAutoRotate,
                bEnableAutoRotateDebugLogs: settings.bEnableAutoRotateDebugLogs,
                bEnableDiscordWebhook: settings.bEnableDiscordWebhook,
                bEnableReports: settings.bEnableReports,
                bReportChannelId: settings.bReportChannelId,
                bEnableHTTPS: settings.bEnableHTTPS,
                bEnableCalderaService: settings.bEnableCalderaService,
                bCalderaServicePort: settings.bCalderaServicePort,
                bGameVersion: settings.bGameVersion,
                bEnableSACRewards: settings.bEnableSACRewards,
                bPercentageSACRewards: settings.bPercentageSACRewards,
                bEnableAutoBackendRestart: settings.bEnableAutoBackendRestart,
                bRestartTime: settings.bRestartTime,
                bChapterlimit: settings.bChapterlimit,
                bSeasonlimit: settings.bSeasonlimit,
                bRotateTime: settings.bRotateTime,
                bDailyItemsAmount: settings.bDailyItemsAmount,
                bFeaturedItemsAmount: settings.bFeaturedItemsAmount,
                bExcludedItems: settings.bExcludedItems || [],
                bItemShopWebhook: settings.bItemShopWebhook,
                discord: {
                    bUseDiscordBot: settings.discord?.bUseDiscordBot,
                    bEnableInGamePlayerCount: settings.discord?.bEnableInGamePlayerCount
                },
                chat: {
                    EnableGlobalChat: settings.chat?.EnableGlobalChat
                },
                Api: {
                    bApiKey: settings.Api?.bApiKey
                },
                Website: {
                    bUseWebsite: settings.Website?.bUseWebsite,
                    websiteport: settings.Website?.websiteport
                }
            }
        });
    } catch (err) {
        log.error(`Error reading admin settings: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to load settings" });
    }
});

app.get("/api/admin/users", requireLocalAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const search = (req.query.search || "").trim();
        const skip = (page - 1) * limit;

        const filter = search ? {
            $or: [
                { username: { $regex: search, $options: "i" } },
                { accountId: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { discordId: { $regex: search, $options: "i" } }
            ]
        } : {};

        const users = await User.find(filter)
            .select("accountId username email banned discordId created avatarUrl")
            .sort({ created: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await User.countDocuments(filter);

        // Fetch avatars from Discord bot if available, fallback to stored avatar URL
        const usersWithAvatars = await Promise.all(
            users.map(async (user) => {
                let avatarUrl = user.avatarUrl || null;
                if (!avatarUrl && user.discordId && global.getDiscordUserAvatarUrl) {
                    try {
                        avatarUrl = await global.getDiscordUserAvatarUrl(user.discordId);
                    } catch (err) {
                        log.debug(`Failed to fetch avatar for ${user.discordId}: ${err.message}`);
                    }
                }
                return { ...user, avatarUrl };
            })
        );

        res.json({
            success: true,
            users: usersWithAvatars,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        log.error(`Error fetching admin users: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to load users" });
    }
});

app.post("/api/admin/users/:accountId/ban", requireLocalAdmin, async (req, res) => {
    try {
        const user = await User.findOne({ accountId: req.params.accountId });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.banned = true;
        await user.save();
        log.admin(`User ${req.params.accountId} (${user.username}) banned via admin panel`);
        res.json({ success: true, message: "User banned" });
    } catch (err) {
        log.error(`Error banning user: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to ban user" });
    }
});

app.post("/api/admin/users/:accountId/unban", requireLocalAdmin, async (req, res) => {
    try {
        const user = await User.findOne({ accountId: req.params.accountId });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.banned = false;
        await user.save();
        log.admin(`User ${req.params.accountId} (${user.username}) unbanned via admin panel`);
        res.json({ success: true, message: "User unbanned" });
    } catch (err) {
        log.error(`Error unbanning user: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to unban user" });
    }
});

app.put("/api/admin/settings", requireLocalAdmin, (req, res) => {
    try {
        const payload = req.body || {};
        const updates = payload.updates || payload;

        if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
            return res.status(400).json({ success: false, message: "Invalid settings payload" });
        }

        const currentConfig = readConfig();
        const allowedKeys = getAllowedSettingKeys();

        Object.entries(updates).forEach(([key, value]) => {
            if (!allowedKeys.includes(key)) {
                return;
            }

            setNestedValue(currentConfig, key, coerceValue(value));
        });

        writeConfig(currentConfig);
        res.json({ success: true, message: "Settings updated successfully" });
    } catch (err) {
        log.error(`Error updating admin settings: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to update settings" });
    }
});

app.get("/api/admin/shop-catalog", requireLocalAdmin, (req, res) => {
    try {
        res.json({ success: true, catalog: readCatalogConfig() });
    } catch (err) {
        log.error(`Error reading catalog config: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to load shop catalog" });
    }
});

app.put("/api/admin/shop-catalog", requireLocalAdmin, (req, res) => {
    try {
        const payload = req.body || {};
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return res.status(400).json({ success: false, message: "Invalid catalog payload" });
        }

        writeCatalogConfig(payload);
        res.json({ success: true, message: "Shop catalog updated successfully" });
    } catch (err) {
        log.error(`Error updating catalog config: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to update shop catalog" });
    }
});

app.post("/api/admin/restart", requireLocalAdmin, (req, res) => {
    try {
        res.json({ success: true, message: "Restarting backend..." });
        const backendPath = path.join(__dirname, "..", "index.js");
        const child = spawn(process.execPath, [backendPath], {
            cwd: path.join(__dirname, ".."),
            detached: true,
            stdio: "inherit"
        });
        child.unref();
        setTimeout(() => process.exit(0), 1000);
    } catch (err) {
        log.error(`Error restarting backend: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to restart backend" });
    }
});

app.get("/api/online-users", (req, res) => {
    try {
        const onlineUsers = Array.isArray(global.Clients) ? global.Clients.length : 0;
        res.json({ success: true, onlineUsers });
    } catch (err) {
        log.error(`Error fetching online users: ${err.message}`);
        res.status(500).json({ success: false, onlineUsers: 0, message: "Failed to fetch online users" });
    }
});

app.get("/api/admin/status", requireLocalAdmin, (req, res) => {
    try {
        const onlineUsers = Array.isArray(global.Clients) ? global.Clients.length : 0;
        const parties = global.parties ? Object.values(global.parties) : [];
        const matchmakerStatus = matchmaker && typeof matchmaker.getMatchmakerStatus === "function"
            ? matchmaker.getMatchmakerStatus()
            : null;

        res.json({
            success: true,
            onlineUsers,
            partyCount: parties.length,
            parties: parties.map(p => ({ id: p.id, members: p.members.length, created_at: p.created_at, joinability: p.config?.joinability })),
            matchmakerStatus
        });
    } catch (err) {
        log.error(`Error fetching admin status: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to fetch status" });
    }
});

app.get("/api/admin/parties", requireLocalAdmin, (req, res) => {
    try {
        const parties = global.parties ? Object.values(global.parties) : [];
        res.json({ success: true, parties });
    } catch (err) {
        log.error(`Error fetching parties: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to load parties" });
    }
});

app.get("/api/admin/matchmaker", requireLocalAdmin, (req, res) => {
    try {
        if (!matchmaker || typeof matchmaker.getMatchmakerStatus !== "function") {
            return res.status(404).json({ success: false, message: "Matchmaker status not available" });
        }
        res.json({ success: true, matchmaker: matchmaker.getMatchmakerStatus() });
    } catch (err) {
        log.error(`Error fetching matchmaker status: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to load matchmaker status" });
    }
});

app.post("/api/admin/matchmaker/:mode/:action", requireLocalAdmin, (req, res) => {
    try {
        if (!matchmaker || typeof matchmaker.setMatchmakerOpen !== "function") {
            return res.status(404).json({ success: false, message: "Matchmaker control unavailable" });
        }

        const mode = req.params.mode;
        const action = req.params.action;
        const open = action === "open";

        if (!["solo", "duo", "low_solo", "creative", "all"].includes(mode)) {
            return res.status(400).json({ success: false, message: "Invalid matchmaker mode" });
        }

        const status = matchmaker.setMatchmakerOpen(mode, open);
        res.json({ success: true, message: `Matchmaker ${mode} set to ${open ? "open" : "closed"}`, status });
    } catch (err) {
        log.error(`Error updating matchmaker status: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to update matchmaker status" });
    }
});

app.post("/api/admin/users/:accountId/xp", requireLocalAdmin, async (req, res) => {
    try {
        const accountId = req.params.accountId;
        const amount = Number(req.body.amount);
        if (Number.isNaN(amount)) {
            return res.status(400).json({ success: false, message: "XP amount must be a number" });
        }

        const user = await User.findOne({ accountId });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const currentXp = user.xp || 0;
        const currentLevel = user.level || 1;
        const xpUpdate = functions.updateLvlAndXp(currentLevel, currentXp, amount);
        const newXp = Math.max(0, xpUpdate.xp);
        const newLevel = xpUpdate.level;

        await User.updateOne({ accountId }, { xp: newXp, level: newLevel, lastXpUpdate: new Date() });

        res.json({
            success: true,
            message: `XP updated by ${amount}`,
            previous: { xp: currentXp, level: currentLevel },
            current: { xp: newXp, level: newLevel }
        });
    } catch (err) {
        log.error(`Error updating XP: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to update XP" });
    }
});

app.post("/api/admin/users/:accountId/vbucks", requireLocalAdmin, async (req, res) => {
    try {
        const accountId = req.params.accountId;
        const amount = Number(req.body.amount);
        if (Number.isNaN(amount) || amount === 0) {
            return res.status(400).json({ success: false, message: "V-Bucks amount must be a non-zero number" });
        }

        const filter = { accountId };
        const updateCommonCore = { $inc: { 'profiles.common_core.items.Currency:MtxPurchased.quantity': amount } };
        const updateProfile0 = { $inc: { 'profiles.profile0.items.Currency:MtxPurchased.quantity': amount } };
        const options = { new: true };

        const updatedProfile = await Profiles.findOneAndUpdate(filter, updateCommonCore, options);
        if (!updatedProfile) {
            return res.status(404).json({ success: false, message: "Profile not found or V-Bucks item missing" });
        }

        await Profiles.updateOne(filter, updateProfile0);

        const common_core = updatedProfile.profiles.common_core;
        const newQuantityCommonCore = common_core.items['Currency:MtxPurchased'].quantity;
        const newQuantityProfile0 = updatedProfile.profiles.profile0.items['Currency:MtxPurchased']?.quantity ?? null;

        res.json({
            success: true,
            message: `V-Bucks updated by ${amount}`,
            commonCore: newQuantityCommonCore,
            profile0: newQuantityProfile0
        });
    } catch (err) {
        log.error(`Error updating V-Bucks: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to update V-Bucks" });
    }
});

app.post("/api/admin/users/:accountId/items/grant", requireLocalAdmin, async (req, res) => {
    try {
        const accountId = req.params.accountId;
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ success: false, message: "Items array required" });
        }

        const profiles = await Profiles.findOne({ accountId });
        if (!profiles) {
            return res.status(404).json({ success: false, message: "Profile not found" });
        }

        if (!profiles.profiles.athena) {
            profiles.profiles.athena = { items: {} };
        }
        if (!profiles.profiles.athena.items) {
            profiles.profiles.athena.items = {};
        }

        for (const item of items) {
            if (item.templateId) {
                const quantity = Number(item.quantity) || 1;
                profiles.profiles.athena.items[item.templateId] = {
                    templateId: item.templateId,
                    attributes: {
                        item_seen: false
                    },
                    quantity
                };
            }
        }

        await profiles.save();
        log.admin(`Items granted to ${accountId} via admin panel`);

        res.json({ success: true, message: "Items granted successfully" });
    } catch (err) {
        log.error(`Error granting items: ${err.message}`);
        res.status(500).json({ success: false, message: "Failed to grant items" });
    }
});

// Get MOTD configuration - reads directly from responses/motdTarget.json
app.get("/api/admin/motd", (req, res) => {
    try {
        // Reads directly from the file in the responses folder
        const motdPath = path.join(__dirname, "../responses/motdTarget.json");
        const motdData = JSON.parse(fs.readFileSync(motdPath, "utf8"));
        
        // Return all content items
        res.json({
            items: motdData.contentItems || []
        });
    } catch (err) {
        log.error(`Error reading MOTD: ${err.message}`);
        error.createError(
            "errors.com.epicgames.admin.motd_read_failed",
            "Failed to read MOTD configuration",
            undefined, 12820, undefined, 500, res
        );
    }
});

// Update MOTD configuration - writes directly to responses/motdTarget.json
app.put("/api/admin/motd", (req, res) => {
    try {
        const { items } = req.body;
        
        if (!Array.isArray(items)) {
            return error.createError(
                "errors.com.epicgames.validation.validation_failed",
                "Items must be an array",
                ["items"], 1040, undefined, 400, res
            );
        }
        
        // Reads directly from the file in the responses folder
        const motdPath = path.join(__dirname, "../responses/motdTarget.json");
        const motdData = JSON.parse(fs.readFileSync(motdPath, "utf8"));
        
        // Replace all content items with the new ones
        motdData.contentItems = items;
        
        // Writes directly to the file in the responses folder
        fs.writeFileSync(motdPath, JSON.stringify(motdData, null, 4));
        
        log.admin(`MOTD configuration updated: ${items.length} news page(s) saved`);
        
        res.json({ success: true, message: `MOTD configuration updated successfully with ${items.length} news page(s)` });
    } catch (err) {
        log.error(`Error updating MOTD: ${err.message}`);
        error.createError(
            "errors.com.epicgames.admin.motd_update_failed",
            "Failed to update MOTD configuration",
            undefined, 12821, undefined, 500, res
        );
    }
});

module.exports = app;

