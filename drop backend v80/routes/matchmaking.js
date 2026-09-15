const express = require("express");
const app = express.Router();
const config = require("../Config/config.json");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const matchmaker = require("../matchmaker/matchmaker.js");
const MMCode = require("../model/mmcodes.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const qs = require("qs");
const error = require("../structs/error.js");

const GAME_SERVER_PLAYLIST_STATUS = {
    playlist_defaultsolo: "ASIA LateGame Solo",
    playlist_defaultduo: "ASIA FullMap Solo",
    playlist_arena: "ASIA FullMap Arena",
    playlist_showdownalt_solo: "ASIA Showdown Solo",
    playlist_50v50: "ASIA 50v50"
};

function normalizeRegion(region) {
    if (!region) return null;
    const normalized = String(region).trim().toUpperCase();
    if (["US", "USA", "NA", "NAE", "NAW", "NORTHAMERICA", "NORTH AMERICA"].includes(normalized)) return "NAE";
    if (["ASIA", "APAC", "AP", "OCE", "OCEANIA"].includes(normalized)) return "ASIA";
    return normalized;
}

function normalizeSubregion(subregion) {
    if (!subregion) return null;
    return String(subregion).trim().toUpperCase();
}

function isDropQueueJoinable(queueState) {
    return Boolean(queueState?.active && !queueState?.started);
}

function normalizeGameServerConfigEntry(entry) {
    if (typeof entry === "string") {
        const parts = entry.split(":");
        if (parts.length < 3) return null;
        const [host, portText, playlist, region, subregion] = parts;
        const port = Number(portText);
        if (!host || Number.isNaN(port) || !playlist) return null;
        return {
            name: "",
            host,
            port,
            playlist: String(playlist),
            region: normalizeRegion(region),
            subregion: normalizeSubregion(subregion)
        };
    }

    if (entry && typeof entry !== "object") return null;
    const host = String(entry.host || entry.ip || "");
    const port = Number(entry.port || entry.serverPort || 0);
    const playlist = String(entry.playlist || entry.playlistName || "");
    const region = normalizeRegion(entry.region || entry.regionName || entry.REGION_s || entry.region_s);
    const subregion = normalizeSubregion(entry.subregion || entry.SUBREGION_s || entry.subregion_s);
    if (!host || Number.isNaN(port) || !playlist) return null;
    return {
        name: String(entry.name || entry.serverName || entry.label || ""),
        host,
        port,
        playlist,
        region,
        subregion
    };
}

function getLateGameArenaSourceServer(playlist, requestedRegion = null) {
    const playlistName = String(playlist || "").toLowerCase();
    if (!playlistName.includes("playlist_showdownalt_solo")) return null;

    const status = matchmaker.getMatchmakerStatus();
    const dropMatches = status?.dropMatches || {};
    const regions = [];
    const normalizedRequestedRegion = requestedRegion ? normalizeRegion(requestedRegion) : null;
    if (normalizedRequestedRegion) regions.push(normalizedRequestedRegion);
    else regions.push("ASIA", "NAE");

    for (const region of regions) {
        const queueMap = dropMatches?.[region]?.queues || {};
        const primaryQueueState = queueMap["droplategamearenasolo"] || queueMap["DropLateGameArenaSolo"] || null;
        const secondaryQueueState = queueMap["droplategamearenasolo2"] || queueMap["DropLateGameArenaSolo2"] || null;

        const primaryQueueOpen = isDropQueueJoinable(primaryQueueState);
        const secondaryQueueOpen = isDropQueueJoinable(secondaryQueueState);

        const arena1Server = gameServers.find((server) => {
            return server.playlist.toLowerCase() === playlistName
                && server.region === region
                && server.name === "Arena1";
        });

        const arena2Server = gameServers.find((server) => {
            return server.playlist.toLowerCase() === playlistName
                && server.region === region
                && server.name === "Arena2";
        });

        if (primaryQueueOpen) {
            if (arena1Server) return arena1Server;
            return {
                host: "127.0.0.1",
                port: 7777,
                playlist: playlistName,
                region,
                subregion: region,
                name: "Arena1"
            };
        }

        if (!primaryQueueOpen && secondaryQueueOpen) {
            if (arena2Server) return arena2Server;
            return {
                host: "127.0.0.1",
                port: 7776,
                playlist: playlistName,
                region,
                subregion: region,
                name: "Arena2"
            };
        }

        if (primaryQueueState && !primaryQueueState.started && primaryQueueState.active) {
            if (arena1Server) return arena1Server;
            return {
                host: "127.0.0.1",
                port: 7777,
                playlist: playlistName,
                region,
                subregion: region,
                name: "Arena1"
            };
        }
    }

    return null;
}

function getRequestedRegion(req) {
    const bucketId = req.query?.bucketId || req.body?.bucketId;
    const bucketRegion = typeof bucketId === "string" && bucketId.split(":").length === 4
        ? bucketId.split(":")[2]
        : null;

    return normalizeRegion(
        req.query?.region ||
        req.body?.region ||
        bucketRegion ||
        req.headers["x-epic-region"] ||
        req.headers["x-epic-country"] ||
        req.headers["x-epic-country-code"] ||
        req.headers.region ||
        req.headers["x-region"]
    );
}

function selectGameServerForPlaylist(playlist, requestedRegion = null, hostRegion = null) {
    const matchingServers = gameServers.filter(server => server.playlist.toLowerCase() === String(playlist).toLowerCase());
    if (!matchingServers.length) return null;

    const lateGameArenaSource = getLateGameArenaSourceServer(playlist, requestedRegion);
    if (lateGameArenaSource) {
        return lateGameArenaSource;
    }

    if (requestedRegion) {
        const explicitRegionMatch = matchingServers.find(server => server.region === requestedRegion);
        if (explicitRegionMatch) return explicitRegionMatch;
    }

    return matchingServers[0] || null;
}

const gameServers = (Array.isArray(config.gameServerIP) ? config.gameServerIP : [])
    .map(normalizeGameServerConfigEntry)
    .filter(Boolean);

let buildUniqueId = {};

app.get("/fortnite/api/matchmaking/session/findPlayer/*", (req, res) => {
    log.debug("GET /fortnite/api/matchmaking/session/findPlayer/* called");
    res.status(200);
    res.end();
});

app.get("/fortnite/api/game/v2/matchmakingservice/ticket/player/*", verifyToken, async (req, res) => {
     log.debug("GET /fortnite/api/game/v2/matchmakingservice/ticket/player/* called");
    if (req.user.isServer == true) return res.status(403).end();
    if (req.user.matchmakingId == null) return res.status(400).end();

    const playerCustomKey = qs.parse(req.url.split("?")[1], { ignoreQueryPrefix: true })['player.option.customKey'];
    const bucketId = qs.parse(req.url.split("?")[1], { ignoreQueryPrefix: true })['bucketId'];
    if (typeof bucketId !== "string" || bucketId.split(":").length !== 4) {
        return res.status(400).end();
    }
    const rawPlaylist = bucketId.split(":")[3];
    let playlist = rawPlaylist.toLowerCase();
    if (playlist === "2") {
        playlist = "playlist_defaultsolo";
    } else if (playlist === "10") {
        playlist = "playlist_defaultduo";
    } else if (playlist === "9") {
        playlist = "playlist_defaultsquad";
    } else if (playlist === "50") {
        playlist = "playlist_50v50";
    } else if (playlist === "11") {
        playlist = "playlist_50v50";
    } else if (playlist === "13") {
        playlist = "playlist_highexplosives_squads";
    } else if (playlist === "22") {
        playlist = "playlist_5x20";
    } else if (playlist === "36") {
        playlist = "playlist_blitz_solo";
    } else if (playlist === "37") {
        playlist = "playlist_blitz_duos";
    } else if (playlist === "19") {
        playlist = "playlist_blitz_squad";
    } else if (playlist === "33") {
        playlist = "playlist_carmine";
    } else if (playlist === "32") {
        playlist = "playlist_fortnite";
    } else if (playlist === "playlist_arena") {
        playlist = "playlist_arena";
    } else if (playlist === "playlist_showdownalt_solo") {
        playlist = "playlist_showdownalt_solo";
    } else if (playlist === "47") {
        playlist = "playlist_showdownalt_solo";
    } else if (playlist === "23") {
        playlist = "playlist_highexplosives_solo";
    } else if (playlist === "24") {
        playlist = "playlist_highexplosives_squads";
    } else if (playlist === "44") {
        playlist = "playlist_impact_solo";
    } else if (playlist === "45") {
        playlist = "playlist_impact_duos";
    } else if (playlist === "46") {
        playlist = "playlist_impact_squads";
    } else if (playlist === "35") {
        playlist = "playlist_playground";
    } else if (playlist === "30") {
        playlist = "playlist_skysupply";
    } else if (playlist === "42") {
        playlist = "playlist_skysupply_duos";
    } else if (playlist === "43") {
        playlist = "playlist_skysupply_squads";
    } else if (playlist === "41") {
        playlist = "playlist_snipers";
    } else if (playlist === "39") {
        playlist = "playlist_snipers_solo";
    } else if (playlist === "40") {
        playlist = "playlist_snipers_duos";
    } else if (playlist === "26") {
        playlist = "playlist_solidgold_solo";
    } else if (playlist === "27") {
        playlist = "playlist_solidgold_squads";
    } else if (playlist === "28") {
        playlist = "playlist_showdownalt_solo";
    } 

    const requestedRegion = getRequestedRegion(req);
    const activeHostRegion = matchmaker.getMatchmakerStatus().hostRegion;
    const temporaryPlaylistOverrides = config.bTemporaryHostPlaylistOverrides || {};
    if (requestedRegion && activeHostRegion === requestedRegion && temporaryPlaylistOverrides[requestedRegion]) {
        playlist = String(temporaryPlaylistOverrides[requestedRegion]).toLowerCase();
        log.debug(`[Matchmaking] Temporary host override active for ${requestedRegion}: ${playlist}`);
    }
    const selectedServer = selectGameServerForPlaylist(playlist, requestedRegion, activeHostRegion);
    const statusName = GAME_SERVER_PLAYLIST_STATUS[playlist];
    if (!selectedServer) {
        if (statusName && global.setServerStatus) {
            global.setServerStatus(statusName, "Offline").catch(() => {});
        }
        log.debug("No server found for playlist", playlist, "region", requestedRegion);
        return error.createError("errors.com.epicgames.common.matchmaking.playlist.not_found", `No server found for playlist ${playlist}`, [], 1013, "invalid_playlist", 404, res);
    }
    if (statusName && global.setServerStatus) {
        global.setServerStatus(statusName, "Online").catch(() => {});
    }
    log.debug(`[Matchmaking][${selectedServer.region || requestedRegion || 'GLOBAL'}] Selected server for playlist ${playlist}: ${selectedServer.host}:${selectedServer.port}`);
    await global.kv.set(`playerPlaylist:${req.user.accountId}`, playlist);
    await global.kv.set(`playerPlaylistRegion:${req.user.accountId}`, selectedServer.region || "");
    if (typeof playerCustomKey == "string") {
        let codeDocument = await MMCode.findOne({ code_lower: playerCustomKey?.toLowerCase() });
        if (!codeDocument) {
            return error.createError("errors.com.epicgames.common.matchmaking.code.not_found", `The matchmaking code "${playerCustomKey}" was not found`, [], 1013, "invalid_code", 404, res);
        }
        const kvDocument = JSON.stringify({
            ip: codeDocument.ip,
            port: codeDocument.port,
            playlist: playlist,
            region: normalizeRegion(codeDocument.region || selectedServer.region || requestedRegion)
        });
        await global.kv.set(`playerCustomKey:${req.user.accountId}`, kvDocument);
    }
    if (typeof req.query.bucketId !== "string" || req.query.bucketId.split(":").length !== 4) {
        return res.status(400).end();
    }

    buildUniqueId[req.user.accountId] = req.query.bucketId.split(":")[0];

    const matchmakerIP = config.matchmakerIP;
    let serviceUrl = matchmakerIP.includes("ws") || matchmakerIP.includes("wss") ? matchmakerIP : `ws://${matchmakerIP}`;
    const playlistLower = playlist.toLowerCase();
    const isLowSoloMode = playlistLower === "playlist_low_solo" || playlistLower.includes("low_solo") || playlistLower.includes("low solo");
    const isSoloMode = playlistLower === "playlist_defaultsolo" || (playlistLower.includes("_solo") && !isLowSoloMode);
    const isDuoMode = playlistLower === "playlist_defaultduo" || playlistLower.includes("_duo") || playlistLower.includes("_duos");
    const isCreativeMode = playlistLower.includes("playground") || playlistLower.includes("creative");
    const isArenaMode = playlistLower === "playlist_arena" || playlistLower.includes("arena");
    // Pass mode as path segment (more reliable than query params in WebSocket upgrade)
    if (isLowSoloMode) {
        serviceUrl += "/low_solo";
    } else if (isArenaMode) {
        serviceUrl += "/arena";
    } else if (isSoloMode) {
        serviceUrl += "/solo";
    } else if (isDuoMode) {
        serviceUrl += "/duo";
    } else if (isCreativeMode) {
        serviceUrl += "/creative";
    }
    return res.json({
        "serviceUrl": serviceUrl,
        "ticketType": "mms-player",
        "payload": `${req.user.matchmakingId}`,
        "signature": "account"
    });
});

app.get("/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId", async (req, res) => {
    log.debug(`GET /fortnite/api/game/v2/matchmaking/account/${req.params.accountId}/session/${req.params.sessionId} called`);

    const playlist = await global.kv?.get?.(`playerPlaylist:${req.params.accountId}`);
    const playlistRegion = await global.kv?.get?.(`playerPlaylistRegion:${req.params.accountId}`);
    const requestedRegion = normalizeRegion(playlistRegion);
    const selectedServer = selectGameServerForPlaylist(playlist, requestedRegion, null);

    const sessionKey = functions.MakeID().replace(/-/ig, "").toUpperCase();
    const sessionResponse = {
        "accountId": req.params.accountId,
        "sessionId": req.params.sessionId,
        "key": sessionKey,
        "sessionKey": sessionKey,
        "sessionEncryptionKey": sessionKey,
        "encryptionKey": sessionKey,
        "serverAddress": selectedServer ? selectedServer.host : (req.headers.host ? req.headers.host.split(':')[0] : "127.0.0.1"),
        "serverPort": selectedServer ? Number(selectedServer.port) : 7777,
        "allowJoinInProgress": true
    };

    log.debug('[Matchmaking] account-session response:', JSON.stringify(sessionResponse));
    res.json(sessionResponse);
});

app.get("/fortnite/api/matchmaking/session/:sessionId", verifyToken, async (req, res) => {
    log.debug(`GET /fortnite/api/matchmaking/session/${req.params.sessionId} called`);
    const playlist = await global.kv.get(`playerPlaylist:${req.user.accountId}`);
    const playlistRegion = await global.kv.get(`playerPlaylistRegion:${req.user.accountId}`);
    let kvDocument = await global.kv.get(`playerCustomKey:${req.user.accountId}`);
    let selectedServer = null;
    if (!kvDocument) {
        const requestedRegion = normalizeRegion(playlistRegion);
        selectedServer = selectGameServerForPlaylist(playlist, requestedRegion, null);
        if (!selectedServer) {
            log.debug("No server found for playlist", playlist, "region", requestedRegion);
            return error.createError("errors.com.epicgames.common.matchmaking.playlist.not_found", `No server found for playlist ${playlist}`, [], 1013, "invalid_playlist", 404, res);
        }
        kvDocument = JSON.stringify({
            ip: selectedServer.host,
            port: selectedServer.port,
            playlist: selectedServer.playlist,
            region: selectedServer.region,
            subregion: selectedServer.subregion
        });
    }
    let codeKV = JSON.parse(kvDocument);
    const sessionKey = functions.MakeID().replace(/-/ig, "").toUpperCase();
    const sessionRegion = normalizeRegion(codeKV.region || playlistRegion) || "EU";
    const sessionSubregion = normalizeRegion(codeKV.subregion) || sessionRegion;

    const sessionResp = {
        "id": req.params.sessionId,
        "ownerId": functions.MakeID().replace(/-/ig, "").toUpperCase(),
        "ownerName": "[DS]fortnite-liveeugcec1c2e30ubrcore0a-z8hj-1968",
        "serverName": "[DS]fortnite-liveeugcec1c2e30ubrcore0a-z8hj-1968",
        "serverAddress": codeKV.ip,
        "serverPort": Number(codeKV.port),
        "maxPublicPlayers": 220,
        "openPublicPlayers": 175,
        "maxPrivatePlayers": 0,
        "openPrivatePlayers": 0,
        "attributes": {
          "REGION_s": sessionRegion,
          "GAMEMODE_s": "FORTATHENA",
          "ALLOWBROADCASTING_b": true,
          "SUBREGION_s": sessionSubregion,
          "DCID_s": "FORTNITE-LIVEEUGCEC1C2E30UBRCORE0A-14840880",
          "tenant_s": "Fortnite",
          "MATCHMAKINGPOOL_s": "Any",
          "STORMSHIELDDEFENSETYPE_i": 0,
          "HOTFIXVERSION_i": 0,
          "PLAYLISTNAME_s": codeKV.playlist,
          "SESSIONKEY_s": sessionKey,
          "TENANT_s": "Fortnite",
          "BEACONPORT_i": 15009
        },
        "publicPlayers": [],
        "privatePlayers": [],
        "totalPlayers": 45,
                // allowJoinInProgress true to permit join-in-progress behaviour
                "allowJoinInProgress": true,
        "shouldAdvertise": false,
        "isDedicated": false,
        "usesStats": false,
        "allowInvites": false,
        "usesPresence": false,
        "allowJoinViaPresence": true,
        "allowJoinViaPresenceFriendsOnly": false,
        "buildUniqueId": buildUniqueId[req.user.accountId] || "0",
        "lastUpdated": new Date().toISOString(),
        "started": false
            };

        // Log full session response for debugging client join issues
        log.debug('[Matchmaking] session response:', JSON.stringify(sessionResp));
        res.json(sessionResp);
});

app.post("/fortnite/api/matchmaking/session/*/join", (req, res) => {
    log.debug("POST /fortnite/api/matchmaking/session/*/join called");
    res.status(204);
    res.end();
});

app.post("/fortnite/api/matchmaking/session/matchMakingRequest", (req, res) => {
    log.debug("POST /fortnite/api/matchmaking/session/matchMakingRequest called");
    res.json([]);
});

module.exports = app;
module.exports.selectGameServerForPlaylist = selectGameServerForPlaylist;
module.exports.getRequestedRegion = getRequestedRegion;
