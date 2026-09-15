const express = require("express");
const app = express.Router();
const bcrypt = require("bcrypt");

const error = require("../structs/error.js");
const log = require("../structs/log.js");
const User = require("../model/user.js");
const matchmaker = require("../matchmaker/matchmaker.js");

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
    if (Array.isArray(global.Clients)) {
        global.Clients.filter((client) => client.accountId === accountId).forEach((client) => {
            if (client.client && typeof client.client.close === "function") client.client.close();
        });
    }
}

async function getDiscordAvatarUrl(user, req) {
    if (!user || !user.discordId) {
        return "https://cdn.discordapp.com/embed/avatars/0.png";
    }

    if (user.avatarUrl) {
        return user.avatarUrl;
    }

    if (typeof global.getDiscordUserAvatarUrl === "function") {
        try {
            return await global.getDiscordUserAvatarUrl(user.discordId);
        } catch (err) {
            log.debug(`Could not fetch Discord avatar for account ${user.accountId}: ${err.message}`);
        }
    }

    const discordClient = req.client || global.discordClient || global.client;
    if (discordClient && discordClient.users && typeof discordClient.users.fetch === "function") {
        try {
            const discordUser = await discordClient.users.fetch(user.discordId);
            if (discordUser && typeof discordUser.displayAvatarURL === "function") {
                return discordUser.displayAvatarURL({ format: "png", size: 512 });
            }
        } catch (err) {
            log.debug(`Could not fetch Discord avatar for account ${user.accountId}: ${err.message}`);
        }
    }

    return "https://cdn.discordapp.com/embed/avatars/0.png";
}

app.get(["/api/account/useravater", "/api/account/useravatar", "/account/useravater", "/account/useravatar"], async (req, res) => {
    const { email, password } = req.query;

    if (typeof email != "string" || !email || typeof password != "string" || !password) {
        return res.status(400).json({
            success: false,
            error: "email and password are required"
        });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() }).lean();
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "user not found"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: "invalid password"
            });
        }

        const avatarUrl = await getDiscordAvatarUrl(user, req);
        return res.json({
            success: true,
            avatarUrl
        });
    } catch (err) {
        log.error(`Error resolving user avatar: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: "internal server error"
        });
    }
});

app.get(["/api/account/friendavater", "/api/account/friendavatar"], async (req, res) => {
    const { username } = req.query;

    if (typeof username != "string" || !username) {
        return res.status(400).json({
            success: false,
            error: "username is required"
        });
    }

    try {
        const user = await User.findOne({
            $or: [
                { username: username },
                { username_lower: username.toLowerCase() }
            ]
        }).lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "user not found"
            });
        }

        const avatarUrl = await getDiscordAvatarUrl(user, req);
        return res.json({
            success: true,
            username: user.username,
            accountId: user.accountId,
            avatarUrl
        });
    } catch (err) {
        log.error(`Error resolving friend avatar: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: "internal server error"
        });
    }
});

app.get("/api/account/banned", async (req, res) => {
    const { email, password } = req.query;

    if (typeof email != "string" || !email || typeof password != "string" || !password) {
        return res.status(400).json({
            success: false,
            error: "email and password are required"
        });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() }).lean();
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "user not found"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: "invalid password"
            });
        }

        return res.json({
            success: true,
            accountId: user.accountId,
            banned: Boolean(user.banned),
            isBanned: Boolean(user.banned),
            status: user.banned ? "banned" : "active"
        });
    } catch (err) {
        log.error(`Error checking ban status: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: "internal server error"
        });
    }
});

app.get("/api/account/ban", async (req, res) => {
    const { email, password } = req.query;

    if (typeof email != "string" || !email || typeof password != "string" || !password) {
        return res.status(400).json({
            success: false,
            error: "email and password are required"
        });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "user not found"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: "invalid password"
            });
        }

        if (user.banned) {
            return res.json({
                success: true,
                accountId: user.accountId,
                banned: true,
                isBanned: true,
                status: "banned",
                message: "account already banned"
            });
        }

        user.banned = true;
        await user.save();
        disconnectBannedUser(user.accountId);

        return res.json({
            success: true,
            accountId: user.accountId,
            banned: true,
            isBanned: true,
            status: "banned"
        });
    } catch (err) {
        log.error(`Error banning account: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: "internal server error"
        });
    }
});

app.get("/account/api/public/account/:accountId/status", async (req, res) => {
    log.debug(`GET /account/api/public/account/${req.params.accountId}/status called`);

    const accountId = req.params.accountId || req.query.accountId;
    if (typeof accountId != "string" || !accountId) return error.createError(
        "errors.com.epicgames.bad_request",
        "Required String parameter 'accountId' is invalid or not present",
        undefined, 1001, undefined, 400, res
    );

    const user = await User.findOne({ accountId }).lean();
    if (!user) return error.createError(
        "errors.com.epicgames.account.account_not_found",
        `Sorry, we couldn't find an account for ${accountId}`,
        [accountId], 18007, undefined, 404, res
    );

    res.json({
        accountId: user.accountId,
        banned: Boolean(user.banned),
        isBanned: Boolean(user.banned),
        status: user.banned ? "banned" : "active"
    });
});

module.exports = app;
