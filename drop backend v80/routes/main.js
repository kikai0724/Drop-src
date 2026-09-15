const express = require("express");
const functions = require("../structs/functions.js");
const fs = require("fs");
const axios = require("axios");
const bcrypt = require("bcrypt");
const app = express.Router();
const log = require("../structs/log.js");
const path = require("path");
const { getAccountIdData, addEliminationHypePoints, addVictoryHypePoints, deductBusFareHypePoints, SeasonXp, updateUserLevel } = require("./../structs/functions.js");
const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");
const User = require("../model/user.js");
const Arena = require("../model/arena.js");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const DISCORD_INVITE_URL = "https://discord.gg/dropfn";
const DISCORD_OAUTH_SCOPES = "identify guilds email";
const DISCORD_REDIRECT_URI = config.Website?.redirectUri || "http://localhost:3551/drop/server/api/v1/discord/callback";

function encodeOAuthState(stateObj) {
    return Buffer.from(JSON.stringify(stateObj)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeOAuthState(state) {
    const base64 = state.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

async function getDiscordAccessToken(code) {
    const params = new URLSearchParams({
        client_id: config.Website.clientId,
        client_secret: config.Website.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
        scope: DISCORD_OAUTH_SCOPES
    });

    const response = await axios.post("https://discord.com/api/oauth2/token", params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    return response.data;
}

async function getDiscordUserInfo(accessToken) {
    const response = await axios.get("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
}

async function isDiscordUserInServer(discordId, accessToken) {
    if (!discordId) return false;

    const botClient = global.discordClient;
    if (botClient && botClient.guilds && botClient.guilds.cache.size > 0) {
        for (const guild of botClient.guilds.cache.values()) {
            const member = await guild.members.fetch(discordId).catch(() => null);
            if (member) return true;
        }
    }

    if (accessToken) {
        try {
            const response = await axios.get("https://discord.com/api/users/@me/guilds", {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const guilds = Array.isArray(response.data) ? response.data : [];
            if (guilds.length > 0) {
                if (config.discord?.guildId) {
                    return guilds.some((guild) => guild.id === config.discord.guildId);
                }
                return guilds.length > 0;
            }
        } catch (err) {
            log.error("Discord guild membership check failed:", err.message || err);
        }
    }

    return false;
}

function resolveDiscordAvatarUrl(discordUser) {
    if (!discordUser || !discordUser.id) {
        return null;
    }

    if (discordUser.avatar) {
        return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`;
    }

    const discriminator = String(discordUser.discriminator || "");
    const defaultAvatarIndex = parseInt(discriminator, 10);
    if (!Number.isNaN(defaultAvatarIndex)) {
        return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex % 5}.png`;
    }

    return "https://cdn.discordapp.com/embed/avatars/0.png";
}

async function makeUniqueDiscordUsername(discordUser) {
    let username = String(discordUser.username || "discord").replace(/[^a-zA-Z0-9_]/g, "");
    if (!username) username = "discord";
    if (username.length > 12) username = username.substring(0, 12);

    let uniqueUsername = username;
    let suffix = 0;
    while (await User.findOne({ username: uniqueUsername })) {
        suffix += 1;
        const base = username.substring(0, Math.max(0, 12 - String(suffix).length));
        uniqueUsername = `${base}${suffix}`;
    }
    return uniqueUsername;
}

app.get("/drop/server/api/v1/discord/login", (req, res) => {
    log.debug(`Discord OAuth login requested path=${req.path} query=${JSON.stringify(req.query)}`);
    if (!config.Website?.clientId || !config.Website?.clientSecret || !DISCORD_REDIRECT_URI) {
        return res.status(500).send("Discord login is not configured.");
    }

    const params = new URLSearchParams({
        client_id: config.Website.clientId,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: "code",
        scope: DISCORD_OAUTH_SCOPES
    });

    const returnUrl = String(req.query.returnUrl || "").trim();
    const originalState = String(req.query.state || "").trim();
    if (returnUrl) {
        params.set("state", encodeOAuthState({ returnUrl, originalState: originalState || undefined }));
    } else if (originalState) {
        params.set("state", originalState);
    }
    res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get("/drop/server/api/v1/discord/auth", (req, res) => {
    log.debug(`Discord OAuth auth requested path=${req.path} query=${JSON.stringify(req.query)}`);
    if (!config.Website?.clientId || !config.Website?.clientSecret || !DISCORD_REDIRECT_URI) {
        return res.status(500).send("Discord login is not configured.");
    }

    const params = new URLSearchParams({
        client_id: config.Website.clientId,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: "code",
        scope: DISCORD_OAUTH_SCOPES
    });

    const returnUrl = String(req.query.returnUrl || "").trim();
    const originalState = String(req.query.state || "").trim();
    if (returnUrl) {
        params.set("state", encodeOAuthState({ returnUrl, originalState: originalState || undefined }));
    } else if (originalState) {
        params.set("state", originalState);
    }

    const redirectUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    log.debug(`Discord OAuth auth redirecting to ${redirectUrl}`);
    res.redirect(redirectUrl);
});

app.get("/drop/server/api/v1/discord/callback", async (req, res) => {
    log.debug(`Discord OAuth callback received path=${req.path} query=${JSON.stringify(req.query)}`);
    try {
        const code = String(req.query.code || "").trim();
        if (!code) {
            return res.status(400).send("Discord callback requires a code.");
        }
        if (!config.Website?.clientId || !config.Website?.clientSecret || !DISCORD_REDIRECT_URI) {
            return res.status(500).send("Discord integration is not configured.");
        }

        let returnUrl = null;
        const rawState = String(req.query.state || "").trim();
        if (rawState) {
            try {
                const decodedState = decodeOAuthState(rawState);
                if (decodedState && decodedState.returnUrl) {
                    returnUrl = String(decodedState.returnUrl);
                }
            } catch {
                // ignore invalid encoded state
            }
        }

        const tokenData = await getDiscordAccessToken(code);
        log.debug(`Discord OAuth token response: ${JSON.stringify(tokenData)}`);
        const discordUser = await getDiscordUserInfo(tokenData.access_token);
        log.debug(`Discord OAuth user info: ${JSON.stringify(discordUser)}`);
        if (!discordUser || !discordUser.id) {
            return res.status(400).send("Unable to verify Discord user.");
        }

        const memberInServer = await isDiscordUserInServer(discordUser.id, tokenData.access_token);
        if (!memberInServer) {
            return res.redirect(DISCORD_INVITE_URL);
        }

        let user = await User.findOne({ discordId: discordUser.id }).lean();
        const discordAvatarUrl = resolveDiscordAvatarUrl(discordUser);
        let oauthGeneratedPassword = "";
        if (!user) {
            log.debug(`Discord OAuth: no user for discordId=${discordUser.id}, creating new account`);
            const username = await makeUniqueDiscordUsername(discordUser);
            const email = `${discordUser.id}@dropfn.com`;
            const password = functions.MakeID().replace(/-/g, "").substring(0, 16);
            oauthGeneratedPassword = password;
            const registerResult = await functions.registerUser(discordUser.id, username, email, password);
            if (registerResult.status !== 200) {
                log.error(`Discord OAuth: failed to create account for discordId=${discordUser.id}: ${registerResult.message}`);
                return res.status(registerResult.status).send(`Unable to create account: ${registerResult.message}`);
            }
            user = await User.findOne({ discordId: discordUser.id }).lean();
            log.debug(`Discord OAuth: created account accountId=${user?.accountId} username=${user?.username}`);
        } else {
            log.debug(`Discord OAuth: found existing account accountId=${user.accountId} username=${user.username}`);
            oauthGeneratedPassword = functions.MakeID().replace(/-/g, "").substring(0, 16);
            try {
                const hashedPassword = await bcrypt.hash(oauthGeneratedPassword, 10);
                await User.updateOne({ discordId: discordUser.id }, { $set: { password: hashedPassword } });
                log.debug(`Discord OAuth: reset password for existing account accountId=${user.accountId}`);
            } catch (err) {
                log.error(`Discord OAuth: failed to reset password for discordId=${discordUser.id}: ${err?.message || err}`);
                return res.status(500).send("Unable to update existing account password.");
            }
        }

        if (discordAvatarUrl) {
            await User.updateOne({ discordId: discordUser.id }, { $set: { avatarUrl: discordAvatarUrl } }).catch((err) => {
                log.error(`Discord OAuth: failed to save avatarUrl for discordId=${discordUser.id}: ${err?.message || err}`);
            });
        }

        if (returnUrl) {
            const redirectUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}status=success&username=${encodeURIComponent(user.username)}&email=${encodeURIComponent(user.email || '')}&password=${encodeURIComponent(oauthGeneratedPassword)}&avatarIcon=${encodeURIComponent(discordAvatarUrl || user.avatarUrl || '')}&accountId=${encodeURIComponent(user.accountId || '')}&discordId=${encodeURIComponent(user.discordId || '')}`;
            log.debug(`Discord OAuth callback redirecting to ${redirectUrl}`);
            return res.redirect(redirectUrl);
        }

        return res.send("");
    } catch (error) {
        log.error("Discord callback error:", error.message || error);
        res.status(500).send("Discord authentication failed.");
    }
});

app.get("/fortnite/api/game/v2/leaderboards/cohort/*", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/chat/*/*/*/pc called");
    let resp = config.chat.EnableGlobalChat ? { "GlobalChatRooms": [{ "roomName": "reloadbackendglobal" }] } : {};

    res.json(resp);
});

app.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/*", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/tryPlayOnPlatform/account/* called");
    res.setHeader("Content-Type", "text/plain");
    res.send(true);
});

app.get("/launcher/api/public/distributionpoints/", (req, res) => {
    log.debug("GET /launcher/api/public/distributionpoints/ called");
    res.json({
        "distributions": [
            "https://download.epicgames.com/",
            "https://download2.epicgames.com/",
            "https://download3.epicgames.com/",
            "https://download4.epicgames.com/",
            "https://epicgames-download1.akamaized.net/"
        ]
    });
});

app.get("/launcher/api/public/assets/*", async (req, res) => {
    res.json({
        "appName": "FortniteContentBuilds",
        "labelName": "ReloadBackend",
        "buildVersion": "++Fortnite+Release-20.00-CL-19458861-Windows",
        "catalogItemId": "5cb97847cee34581afdbc445400e2f77",
        "expires": "9999-12-31T23:59:59.999Z",
        "items": {
            "MANIFEST": {
                "signature": "ReloadBackend",
                "distribution": "https://reloadbackend.ol.epicgames.com/",
                "path": "Builds/Fortnite/Content/CloudDir/ReloadBackend.manifest",
                "hash": "55bb954f5596cadbe03693e1c06ca73368d427f3",
                "additionalDistributions": []
            },
            "CHUNKS": {
                "signature": "ReloadBackend",
                "distribution": "https://reloadbackend.ol.epicgames.com/",
                "path": "Builds/Fortnite/Content/CloudDir/ReloadBackend.manifest",
                "additionalDistributions": []
            }
        },
        "assetId": "FortniteContentBuilds"
    });
})

app.get("/Builds/Fortnite/Content/CloudDir/*.manifest", async (req, res) => {
    res.set("Content-Type", "application/octet-stream")

    const manifest = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "ReloadBackend.manifest"));

    res.status(200).send(manifest).end();
})

app.get("/Builds/Fortnite/Content/CloudDir/*.chunk", async (req, res) => {
    res.set("Content-Type", "application/octet-stream")

    const chunk = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "ReloadBackend.chunk"));

    res.status(200).send(chunk).end();
})

app.post("/fortnite/api/game/v2/grant_access/*", async (req, res) => {
    log.debug("POST /fortnite/api/game/v2/grant_access/* called");
    res.json({});
    res.status(204);
})

app.post("/api/v1/user/setting", async (req, res) => {
    log.debug("POST /api/v1/user/setting called");
    res.json([]);
})

app.get("/Builds/Fortnite/Content/CloudDir/*.ini", async (req, res) => {
    const ini = fs.readFileSync(path.join(__dirname, "..", "responses", "CloudDir", "Full.ini"));

    res.status(200).send(ini).end();
})

app.get("/waitingroom/api/waitingroom", (req, res) => {
    log.debug("GET /waitingroom/api/waitingroom called");
    res.status(204);
    res.end();
}); 

app.get("/socialban/api/public/v1/*", (req, res) => {
    log.debug("GET /socialban/api/public/v1/* called");
    res.json({
        "bans": [],
        "warnings": []
    });
});

app.get("/fortnite/api/game/v2/events/tournamentandhistory/*/EU/WindowsClient", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/events/tournamentandhistory/*/EU/WindowsClient called");
    res.json({});
});

app.get("/fortnite/api/statsv2/account/:accountId", (req, res) => {
    log.debug(`GET /fortnite/api/statsv2/account/${req.params.accountId} called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/statsproxy/api/statsv2/account/:accountId", (req, res) => {
    log.debug(`GET /statsproxy/api/statsv2/account/${req.params.accountId} called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/fortnite/api/stats/accountId/:accountId/bulk/window/alltime", (req, res) => {
    log.debug(`GET /fortnite/api/stats/accountId/${req.params.accountId}/bulk/window/alltime called`);
    res.json({
        "startTime": 0,
        "endTime": 0,
        "stats": {},
        "accountId": req.params.accountId
    });
});

app.get("/d98eeaac-2bfa-4bf4-8a59-bdc95469c693", async (req, res) => {
    res.json({
        "playlist": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPE1QRCB4bWxucz0idXJuOm1wZWc6ZGFzaDpzY2hlbWE6bXBkOjIwMTEiIHhtbG5zOnhzaT0iaHR0cDovL3d3dy53My5vcmcvMjAwMS9YTUxTY2hlbWEtaW5zdGFuY2UiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4c2k6c2NoZW1hTG9jYXRpb249InVybjptcGVnOkRBU0g6c2NoZW1hOk1QRDoyMDExIGh0dHA6Ly9zdGFuZGFyZHMuaXNvLm9yZy9pdHRmL1B1YmxpY2x5QXZhaWxhYmxlU3RhbmRhcmRzL01QRUctREFTSF9zY2hlbWFfZmlsZXMvREFTSC1NUEQueHNkIiBwcm9maWxlcz0idXJuOm1wZWc6ZGFzaDpwcm9maWxlOmlzb2ZmLWxpdmU6MjAxMSIgdHlwZT0ic3RhdGljIiBtZWRpYVByZXNlbnRhdGlvbkR1cmF0aW9uPSJQVDMwLjIxM1MiIG1heFNlZ21lbnREdXJhdGlvbj0iUFQyLjAwMFMiIG1pbkJ1ZmZlclRpbWU9IlBUNC4xMDZTIj4KICA8QmFzZVVSTD5odHRwczovL2ZvcnRuaXRlLXB1YmxpYy1zZXJ2aWNlLXByb2QxMS5vbC5lcGljZ2FtZXMuY29tL2F1ZGlvL0phbVRyYWNrcy9PR1JlbWl4LzwvQmFzZVVSTD4KICA8UHJvZ3JhbUluZm9ybWF0aW9uPjwvUHJvZ3JhbUluZm9ybWF0aW9uPgogIDxQZXJpb2QgaWQ9IjAiIHN0YXJ0PSJQVDBTIj4KICAgIDxBZGFwdGF0aW9uU2V0IGlkPSIwIiBjb250ZW50VHlwZT0iYXVkaW8iIHN0YXJ0V2l0aFNBUD0iMSIgc2VnbWVudEFsaWdubWVudD0idHJ1ZSIgYml0c3RyZWFtU3dpdGNoaW5nPSJ0cnVlIj4KICAgICAgPFJlcHJlc2VudGF0aW9uIGlkPSIwIiBhdWRpb1NhbXBsaW5nUmF0ZT0iNDgwMDAiIGJhbmR3aWR0aD0iMTI4MDAwIiBtaW1lVHlwZT0iYXVkaW8vbXA0IiBjb2RlY3M9Im1wNGEuNDAuMiI+CiAgICAgICAgPFNlZ21lbnRUZW1wbGF0ZSBkdXJhdGlvbj0iMjAwMDAwMCIgdGltZXNjYWxlPSIxMDAwMDAwIiBpbml0aWFsaXphdGlvbj0iaW5pdF8kUmVwcmVzZW50YXRpb25JRCQubXA0IiBtZWRpYT0ic2VnbWVudF8kUmVwcmVzZW50YXRpb25JRCRfJE51bWJlciQubTRzIiBzdGFydE51bWJlcj0iMSI+PC9TZWdtZW50VGVtcGxhdGU+CiAgICAgICAgPEF1ZGlvQ2hhbm5lbENvbmZpZ3VyYXRpb24gc2NoZW1lSWRVcmk9InVybjptcGVnOmRhc2g6MjMwMDM6MzphdWRpb19jaGFubmVsX2NvbmZpZ3VyYXRpb246MjAxMSIgdmFsdWU9IjIiPjwvQXVkaW9DaGFubmVsQ29uZmlndXJhdGlvbj4KICAgICAgPC9SZXByZXNlbnRhdGlvbj4KICAgIDwvQWRhcHRhdGlvblNldD4KICA8L1BlcmlvZD4KPC9NUEQ+",
        "playlistType": "application/dash+xml",
        "metadata": {
            "assetId": "",
            "baseUrls": [
                "https://fortnite-public-service-prod11.ol.epicgames.com/audio/JamTracks/OGRemix/"
            ],
            "supportsCaching": true,
            "ucp": "a",
            "version": "f2528fa1-5f30-42ff-8ae5-a03e3b023a0a"
        }
    })
})

app.post("/fortnite/api/feedback/*", (req, res) => {
    log.debug("POST /fortnite/api/feedback/* called");
    res.status(200);
    res.end();
});

app.post("/fortnite/api/statsv2/query", (req, res) => {
    log.debug("POST /fortnite/api/statsv2/query called");
    res.json([]);
});

app.post("/statsproxy/api/statsv2/query", (req, res) => {
    log.debug("POST /statsproxy/api/statsv2/query called");
    res.json([]);
});

app.post("/fortnite/api/game/v2/events/v2/setSubgroup/*", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/events/v2/setSubgroup/* called");
    res.status(204);
    res.end();
});

app.get("/fortnite/api/game/v2/enabled_features", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/enabled_features called");
    res.json(["LiveEvents", "BattleRoyale", "Creative", "SaveTheWorld"]);
});

app.get("/api/v1/events/Fortnite/download/*", async (req, res) => {
    const accountId = req.params.account_id || req.params[0];

    if (!accountId) {
        return res.status(400).json({ message: "Missing account ID" });
    }

    try {
        const playerData = await Arena.findOne({ accountId });
        const hypePoints = playerData ? playerData.hype : 0;
        const division = playerData ? playerData.division : 0;
        const reloadPoints = playerData ? (playerData.reloadPoints || 0) : 0;

        const eventsDataPath = path.join(__dirname, "./../responses/eventlistactive.json");
        const events = JSON.parse(fs.readFileSync(eventsDataPath, 'utf-8'));

        events.player = {
            accountId: accountId,
            gameId: "Fortnite",
            persistentScores: {
                Hype: hypePoints,
                ReloadPoints: reloadPoints
            },
            tokens: [`ARENA_S24_Division${division + 1}`]
        };

        res.json(events);

    } catch (error) {
        console.error("Error fetching Arena data:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

app.get("/api/v1/events/Fortnite/:eventId/history/:accountId", (req, res) => {
    log.debug(`GET /api/v1/events/Fortnite/${req.params.eventId}/history/${req.params.accountId} called`);
    res.json({
        "events": [],
        "paging": {
            "count": 0,
            "total": 0
        }
    });
});

app.get("/fortnite/api/game/v2/twitch/*", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/twitch/* called");
    res.status(200);
    res.end();
});

app.get("/fortnite/api/game/v2/world/info", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/world/info called");
    res.json({});
});

app.post("/fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/chat/*/recommendGeneralChatRooms/pc called");
    res.json({});
});

app.get("/presence/api/v1/_/*/last-online", async (req, res) => {
    log.debug("GET /presence/api/v1/_/*/last-online called");
    res.json({})
})

app.get("/fortnite/api/receipts/v1/account/*/receipts", (req, res) => {
    log.debug("GET /fortnite/api/receipts/v1/account/*/receipts called");
    res.json([]);
});

app.get("/fortnite/api/game/v2/leaderboards/cohort/*", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/leaderboards/cohort/* called");
    res.json([]);
});

app.post("/api/v1/assets/Fortnite/*/*", async (req, res) => {
    log.debug("POST /api/v1/assets/Fortnite/*/* called");
    if (req.body.hasOwnProperty("FortCreativeDiscoverySurface") && req.body.FortCreativeDiscoverySurface == 0) {
        const discovery_api_assets = require("./../responses/Discovery/discovery_api_assets.json");
        res.json(discovery_api_assets)
    } else {
        res.json({
            "FortCreativeDiscoverySurface": {
                "meta": {
                    "promotion": req.body.FortCreativeDiscoverySurface || 0
                },
                "assets": {}
            }
        })
    }
})

app.get("/region", async (req, res) => {
    log.debug("GET /region called");
    res.json({
        "continent": {
            "code": "EU",
            "geoname_id": 6255148,
            "names": {
                "de": "Europa",
                "en": "Europe",
                "es": "Europa",
                "it": "Europa",
                "fr": "Europe",
                "ja": "Europe",
                "pt-BR": "Europa",
                "ru": "Европа",
                "zh-CN": "欧洲"
            }
        },
        "country": {
            "geoname_id": 2635167,
            "is_in_european_union": false,
            "iso_code": "GB",
            "names": {
                "de": "UK",
                "en": "United Kingdom",
                "es": "RU",
                "it": "Stati Uniti",
                "fr": "Royaume Uni",
                "ja": "United Kingdom",
                "pt-BR": "Reino Unido",
                "ru": "Британия",
                "zh-CN": "英国"
            }
        },
        "subdivisions": [
            {
                "geoname_id": 6269131,
                "iso_code": "ENG",
                "names": {
                    "de": "England",
                    "en": "England",
                    "es": "Inglaterra",
                    "it": "Inghilterra",
                    "fr": "Angleterre",
                    "ja": "England",
                    "pt-BR": "Inglaterra",
                    "ru": "Англия",
                    "zh-CN": "英格兰"
                }
            },
            {
                "geoname_id": 3333157,
                "iso_code": "KEC",
                "names": {
                    "en": "Royal Kensington and Chelsea"
                }
            }
        ]
    })
})

app.all("/v1/epic-settings/public/users/*/values", async (req, res) => {
    const epicsettings = require("./../responses/epic-settings.json");
    res.json(epicsettings)
})

app.get("/fortnite/api/game/v2/br-inventory/account/*", async (req, res) => {
    log.debug(`GET /fortnite/api/game/v2/br-inventory/account/${req.params.accountId} called`);
    res.json({
        "stash": {
            "globalcash": 0
        }
    })
})

app.post("/datarouter/api/v1/public/data", async (req, res) => {
    try {
        log.debug(`[DataRouter] HIT | content-type: ${req.headers["content-type"]} | UserID: ${req.query.UserID} | body type: ${typeof req.body} | body keys: ${Object.keys(req.body || {}).join(",")}`);

        let accountId = getAccountIdData(req.query.UserID);
        if (!accountId && req.query.UserID) {
            accountId = req.query.UserID.replace(/-/g, "");
        }

        const data = req.body.Events || (Array.isArray(req.body) ? req.body : (req.body ? [req.body] : []));

        const firstPart = (req.query.UserID || "").split("||")[0].split("|")[0];
        log.debug(`[DataRouter] firstPart: ${firstPart} | events count: ${Array.isArray(data) ? data.length : 0}`);

        if (Array.isArray(data) && data.length > 0) {
            const clientIp = req.socket ? req.socket.remoteAddress : null;
            if (!global.epicToAccount) global.epicToAccount = {};
            if (!global.ipToAccountId) global.ipToAccountId = {};

            let findUser = await User.findOne({ accountId: firstPart });
            if (!findUser && accountId !== firstPart) {
                findUser = await User.findOne({ accountId });
            }

            if (!findUser && firstPart && global.epicToAccount[firstPart]) {
                findUser = await User.findOne({ accountId: global.epicToAccount[firstPart] });
                if (findUser) log.debug(`[DataRouter] Matched via epicToAccount: ${findUser.accountId}`);
            }

            if (!findUser && clientIp && global.ipToAccountId[clientIp]) {
                findUser = await User.findOne({ accountId: global.ipToAccountId[clientIp].accountId });
                if (findUser) {
                    if (firstPart) global.epicToAccount[firstPart] = findUser.accountId;
                    log.debug(`[DataRouter] Matched via IP ${clientIp}: ${findUser.accountId} (learned epic mapping)`);
                }
            }

            let matchAccountId = null;
            if (!findUser) {
                const entries = Object.entries(global.activeMatches || {});
                const active = entries.filter(([, m]) => !m.leftAt);
                const recent = entries.filter(([, m]) => m.leftAt).sort((a, b) => b[1].leftAt - a[1].leftAt);
                const pick = active[0] || recent[0];

                if (pick) {
                    matchAccountId = pick[0];
                    findUser = await User.findOne({ accountId: matchAccountId });
                    if (findUser) {
                        log.debug(`[DataRouter] Matched via activeMatches: ${matchAccountId} (${pick[1].leftAt ? "recently left" : "in match"})`);
                    }
                }
            } else {
                matchAccountId = findUser.accountId;
            }

            if (!findUser) {
                log.debug(`[DataRouter] User NOT FOUND for firstPart=${firstPart} ip=${clientIp}`);
            }

            if (findUser) {
                let totalXpGranted = 0;
                let totalVbucksGranted = 0;

                for (const event of data) {
                    const eventName = event.EventName || event.eventName || "";
                    if (!eventName) continue;

                    const lowerName = eventName.toLowerCase();

                    // Log the full contents of gameplay events to identify kill-count fields.
                    if (/kill|elim|engagement|won|victory|death|placement|eom/i.test(eventName)) {
                        log.debug(`[DataRouter] GAMEPLAY Event: ${JSON.stringify(event).substring(0, 600)}`);
                    }

                    switch (eventName) {
                        case "Athena.ClientWonMatch":
                            await addVictoryHypePoints(findUser);
                            totalXpGranted += 30000;
                            {
                                const rewardAmount = functions.calculateVbucksReward('victory');
                                if (rewardAmount > 0) {
                                    const vbucksResult = await functions.addEliminationVbucks(findUser, 0);
                                    if (vbucksResult?.success) {
                                        totalVbucksGranted += rewardAmount;
                                        try {
                                            const notificationPayload = functions.buildVbucksNotificationPayload({
                                                amount: rewardAmount,
                                                reason: 'Victory Royale',
                                                killCount: 0,
                                                message: `${rewardAmount} V-Bucks を受け取りました。（Victory Royale）`
                                            });
                                            functions.sendXmppMessageToId(notificationPayload, findUser.accountId);
                                        } catch (notifyErr) {
                                            log.error(`Failed to send victory V-Bucks notification: ${notifyErr.message}`);
                                        }
                                    }
                                }
                            }
                            break;

                        case "Combat.AthenaClientEngagement": {
                            const playerKills = Number(event.PlayerKilledPlayerEventCount) || 0;
                            for (let i = 0; i < playerKills; i++) {
                                await addEliminationHypePoints(findUser);
                            }
                            if (playerKills > 0) {
                                totalXpGranted += 10000 * playerKills;
                                const vbucksResult = await functions.addEliminationVbucks(findUser, playerKills);
                                totalVbucksGranted += vbucksResult?.amount || 0;
                            }
                            break;
                        }

                        case "Combat.ClientPlayerDeath": {
                            // Respawn modes fire this on every death — only charge bus fare once per match.
                            const matchEntry = matchAccountId ? global.activeMatches[matchAccountId] : null;
                            if (!matchEntry || !matchEntry.busFareCharged) {
                                await deductBusFareHypePoints(findUser);
                                if (matchEntry) matchEntry.busFareCharged = true;
                            }
                            break;
                        }

                        case "Core.ClientStartMatch":
                            totalXpGranted += 5000;
                            break;

                        default: {
                            // Restrict event-name pattern matching to in-match events whose GameState is Athena.
                            // Example: "InstallBundleManager.CacheStats" contains "chest" (ca**chest**ats),
                            // so matching it unconditionally would incorrectly grant XP on startup events.
                            const gameState = String(event.GameState || "").toLowerCase();
                            if (!gameState.includes("athena")) break;

                            if (lowerName.includes("won") || lowerName.includes("victory")) {
                                await addVictoryHypePoints(findUser);
                                totalXpGranted += 30000;
                                const rewardAmount = functions.calculateVbucksReward('victory');
                                if (rewardAmount > 0) {
                                    const vbucksResult = await functions.addEliminationVbucks(findUser, 0);
                                    if (vbucksResult?.success) {
                                        totalVbucksGranted += rewardAmount;
                                        try {
                                            const notificationPayload = functions.buildVbucksNotificationPayload({
                                                amount: rewardAmount,
                                                reason: 'Victory Royale',
                                                killCount: 0,
                                                message: `${rewardAmount} V-Bucks を受け取りました。（Victory Royale）`
                                            });
                                            functions.sendXmppMessageToId(notificationPayload, findUser.accountId);
                                        } catch (notifyErr) {
                                            log.error(`Failed to send victory V-Bucks notification: ${notifyErr.message}`);
                                        }
                                    }
                                }
                            } else if (lowerName.includes("elim") || lowerName.includes("engagement")) {
                                const kills = Number(event.PlayerKilledPlayerEventCount ?? event.Eliminations ?? event.Kills ?? 1) || 1;
                                for (let i = 0; i < kills; i++) {
                                    await addEliminationHypePoints(findUser);
                                }
                                totalXpGranted += 10000 * kills;
                                const rewardAmount = functions.calculateVbucksReward('elimination', kills);
                                const vbucksResult = await functions.addEliminationVbucks(findUser, kills);
                                totalVbucksGranted += rewardAmount || vbucksResult?.amount || 0;
                                if ((rewardAmount || vbucksResult?.amount || 0) > 0) {
                                    try {
                                        const notificationPayload = functions.buildVbucksNotificationPayload({
                                            amount: rewardAmount || vbucksResult?.amount || 0,
                                            reason: 'Kill',
                                            killCount: kills,
                                            message: `You received ${rewardAmount || vbucksResult?.amount || 0} V-Bucks. (Kill count: ${kills})`
                                        });
                                        functions.sendXmppMessageToId(notificationPayload, findUser.accountId);
                                    } catch (notifyErr) {
                                        log.error(`Failed to send elimination V-Bucks notification: ${notifyErr.message}`);
                                    }
                                }
                            } else if (lowerName.includes("chest") ||
                                lowerName.includes("loot") ||
                                lowerName.includes("supply")) {
                                totalXpGranted += 3000;
                            } else if (lowerName.includes("forage") ||
                                lowerName.includes("ammo")) {
                                totalXpGranted += 1000;
                            }
                            break;
                        }
                    }
                }

                if (totalXpGranted > 0) {
                    log.debug(`[DataRouter] Granting ${totalXpGranted} XP to ${matchAccountId || findUser.accountId}`);
                    await functions.SeasonXp(findUser, totalXpGranted);
                    await functions.updateUserLevel(findUser);

                    if (matchAccountId && global.activeMatches[matchAccountId]) {
                        global.activeMatches[matchAccountId].xpGranted = (global.activeMatches[matchAccountId].xpGranted || 0) + totalXpGranted;
                    }
                }
            }
        }

        res.status(204).end();
    } catch (error) {
        log.error("Error processing data:", error);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = app;