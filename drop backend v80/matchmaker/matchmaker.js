const { createHash } = require("crypto");
const express = require("express");

const app = express();

let waitingPlayersPool = [];

let matchmakerState = {
    connectedClients: 0,
    gameOpen: false,
    hostReady: false,
    hostLoggedIn: false,
    hostRegion: null,
    firstReleaseAt: null
};

let regionalMatchmakerState = {
    NAE: {
        hostLoggedIn: false,
        hostReady: false,
        gameOpen: false,
        joinOpen: false,
        joinLocked: false,
        firstReleaseAt: null,
        hostRegion: "NAE"
    },
    ASIA: {
        hostLoggedIn: false,
        hostReady: false,
        gameOpen: false,
        joinOpen: false,
        joinLocked: false,
        firstReleaseAt: null,
        hostRegion: "ASIA"
    }
};

const dropMatchState = {
    NAE: { active: false, started: false, details: null, queues: {} },
    ASIA: { active: false, started: false, details: null, queues: {} }
};

function getDropState(region, queue = null) {
    const normalizedRegion = normalizeDropRegion(region);
    const regionState = dropMatchState[normalizedRegion] || null;
    if (!regionState) return null;

    if (!queue) {
        const queueStates = Object.values(regionState.queues || {});
        if (queueStates.length === 0) return regionState;
        const activeQueue = queueStates.find((entry) => entry?.active && !entry?.started)
            || queueStates.find((entry) => entry?.active)
            || queueStates[0];
        return activeQueue || regionState;
    }

    const normalizedQueue = String(queue).trim().toLowerCase();
    if (!regionState.queues[normalizedQueue]) {
        regionState.queues[normalizedQueue] = {
            active: false,
            started: false,
            details: null
        };
    }

    return regionState.queues[normalizedQueue];
}

function refreshRegionDropAggregate(region) {
    const normalizedRegion = normalizeDropRegion(region);
    const regionState = dropMatchState[normalizedRegion];
    if (!regionState) return;

    const queues = Object.values(regionState.queues || {});
    regionState.active = queues.some((queueState) => queueState?.active);
    regionState.started = queues.some((queueState) => queueState?.started);
    const activeDetail = queues.find((queueState) => queueState?.active)?.details;
    const fallbackDetail = queues.find((queueState) => queueState?.details)?.details;
    regionState.details = activeDetail || fallbackDetail || null;
}

function getHostRegion(displayName) {
    if (!displayName) return null;
    const normalizedName = String(displayName).trim().toLowerCase();
    if (normalizedName === 'arenahostnae') return 'NAE';
    return null;
}

function getMatchmakerLogPrefix(region = null) {
    const resolvedRegion = String(region || matchmakerState.hostRegion || 'GLOBAL').trim().toUpperCase();
    return `[Matchmaker][${resolvedRegion}]`;
}

function getRegionState(region) {
    if (!region) return null;
    const normalizedRegion = String(region).trim().toUpperCase();
    if (normalizedRegion === "NAE" || normalizedRegion === "ASIA") {
        return regionalMatchmakerState[normalizedRegion];
    }
    return null;
}

function normalizeDropRegion(region) {
    const normalized = String(region || '').trim().toUpperCase();
    if (normalized === 'US' || normalized === 'USA' || normalized === 'NA' || normalized === 'NAE') return 'NAE';
    if (normalized === 'ASIA' || normalized === 'APAC' || normalized === 'AP') return 'ASIA';
    return normalized;
}

function getDropRegionFromRequest(req) {
    let requestedRegion = null;
    try {
        const requestUrl = new URL(req.url || '/', 'http://localhost');
        const bucketId = requestUrl.searchParams.get('bucketId') || '';
        const bucketParts = bucketId.split(':');
        if (bucketParts.length === 4) requestedRegion = normalizeDropRegion(bucketParts[2]);
        if (!requestedRegion) requestedRegion = normalizeDropRegion(requestUrl.searchParams.get('region'));
    } catch {
        requestedRegion = null;
    }

    if (requestedRegion && getDropState(requestedRegion)?.active) return requestedRegion;
    const activeRegions = Object.keys(dropMatchState).filter((region) => dropMatchState[region].active);
    return activeRegions.length === 1 ? activeRegions[0] : requestedRegion;
}

function normalizePlaylistName(playlist) {
    return String(playlist || '').trim().toLowerCase();
}

function playerMatchesDropQueue(player, queueState) {
    const dropPlaylist = normalizePlaylistName(queueState?.details?.playlist);
    if (!dropPlaylist) return true;

    const playerPlaylist = normalizePlaylistName(player?.playlist);
    if (!playerPlaylist) return true;

    return playerPlaylist === dropPlaylist;
}

function logMatchmaker(message, region = null) {
    console.log(`${getMatchmakerLogPrefix(region)} ${message}`);
}

function logMatchmakerError(message, error, region = null) {
    console.error(`${getMatchmakerLogPrefix(region)} ${message}`, error);
}

function notifyGSStatsChanged() {
    if (typeof global.emitGSStatsUpdate === "function") {
        global.emitGSStatsUpdate();
    }
}

function getOnlineMatchmakerPlayers() {
    return waitingPlayersPool.map((player) => ({
        playerKey: player.playerKey || "Unknown",
        displayName: player.playerKey || "Unknown"
    }));
}

let countdownTimer = null;
let timeLeft = 60;
let joinOpenTimer = null;
let joinOpen = false;
const JOIN_OPEN_DELAY_SECONDS = 60;
const JOIN_WINDOW_SECONDS = 50;
const HOST_READY_BUFFER_SECONDS = 10;
const activeHostSessions = {
    GLOBAL: 0,
    NAE: 0,
    ASIA: 0
};
let modeState = {
    solo: false,
    duo: false,
    low_solo: false,
    creative: false,
    all: false
};

function isHostUser(displayName, isServer = false) {
    const normalizedName = String(displayName || "").trim().toLowerCase();
    if (normalizedName === "arenahostasia") return false;
    if (isServer) return true;

    return [
        "reloadbackendhostaccount",
        "reloadbacken",
        "hoster2",
        "hoster3",
        "arenahost",
        "arenahostnae",
        "arenahostasia"
    ].includes(normalizedName);
}

app.post("/fortnite/api/matchmaking/session/*/join", (req, res) => {
    res.status(204).send();
});

function sendDropLifecycleResponse(res, action, params, state) {
    res.status(200).json({
        success: true,
        action,
        queue: params.queue,
        region: params.region,
        port: Number(params.port),
        playlist: params.playlist,
        maxPlayers: Number(params.maxPlayers),
        mode: params.mode,
        queueOpen: state.active && !state.started,
        matchStarted: state.started
    });
}

function getReportedPlayerCount(req) {
    const value = req.query?.players ?? req.body?.players;
    if (value === undefined || value === null || value === "") return null;
    return Math.max(0, Number.parseInt(value, 10) || 0);
}

app.all('/fortnite/api/drop/add/:queue/:region/:port/:playlist/:maxPlayers/:mode', (req, res) => {
    const region = normalizeDropRegion(req.params.region);
    const queue = String(req.params.queue || "");
    const state = getDropState(region, queue);
    if (!state) return res.status(400).json({ success: false, error: 'Unsupported region' });

    state.active = true;
    state.started = false;
    const reportedPlayers = getReportedPlayerCount(req);
    state.details = { ...req.params, region, players: reportedPlayers ?? 0 };

    refreshRegionDropAggregate(region);

    const regionState = getRegionState(region);
    if (regionState) {
        regionState.hostReady = false;
        regionState.joinOpen = false;
        regionState.joinLocked = false;
    }
    if (matchmakerState.hostRegion === region) {
        matchmakerState.gameOpen = false;
    }
    joinOpen = false;
    clearJoinOpenTimer();
    clearCountdownTimer();
    logMatchmaker(`Drop queue opened: ${JSON.stringify(state.details)}`, region);
    releaseWaitingPlayersImmediately(region, queue);
    notifyGSStatsChanged();
    updateAllPoolPlayers();
    sendDropLifecycleResponse(res, 'add', req.params, state);
});

app.all('/fortnite/api/drop/players/:queue/:region/:port/:playlist/:maxPlayers/:mode/:players', (req, res) => {
    const region = normalizeDropRegion(req.params.region);
    const queue = String(req.params.queue || "");
    const state = getDropState(region, queue);
    if (!state || !state.active) return res.status(404).json({ success: false, error: 'Drop queue is not active' });

    state.details = {
        ...(state.details || req.params),
        region,
        players: Math.max(0, Number.parseInt(req.params.players, 10) || 0)
    };
    refreshRegionDropAggregate(region);
    notifyGSStatsChanged();
    res.status(200).json({ success: true, action: 'players', region, queue, port: Number(req.params.port), players: state.details.players });
});

app.all('/fortnite/api/drop/started/:queue/:region/:port/:playlist/:maxPlayers/:mode', (req, res) => {
    const region = normalizeDropRegion(req.params.region);
    const queue = String(req.params.queue || "");
    const state = getDropState(region, queue);
    if (!state) return res.status(400).json({ success: false, error: 'Unsupported region' });

    state.active = true;
    state.started = true;
    const reportedPlayers = getReportedPlayerCount(req);
    state.details = {
        ...(state.details || {}),
        ...req.params,
        region,
        players: reportedPlayers ?? Number(state.details?.players || 0)
    };
    refreshRegionDropAggregate(region);

    const regionState = getRegionState(region);
    regionState.gameOpen = true;
    regionState.joinOpen = false;
    regionState.hostReady = false;
    regionState.joinLocked = true;
    matchmakerState.gameOpen = true;
    logMatchmaker(`Drop match started: ${JSON.stringify(state.details)}`, region);
    notifyGSStatsChanged();
    sendDropLifecycleResponse(res, 'started', req.params, state);
});

app.all('/fortnite/api/drop/ended/:queue/:region/:port/:playlist/:maxPlayers/:mode', (req, res) => {
    const region = normalizeDropRegion(req.params.region);
    const queue = String(req.params.queue || "");
    const state = getDropState(region, queue);
    if (!state) return res.status(400).json({ success: false, error: 'Unsupported region' });

    state.active = false;
    state.started = false;
    state.details = { ...req.params, region };
    refreshRegionDropAggregate(region);

    const regionState = getRegionState(region);
    regionState.gameOpen = false;
    regionState.joinOpen = false;
    regionState.hostReady = false;
    regionState.joinLocked = true;
    if (matchmakerState.hostRegion === region) {
        matchmakerState.gameOpen = false;
        joinOpen = false;
    }
    logMatchmaker(`Drop match ended: ${JSON.stringify(state.details)}`, region);
    notifyGSStatsChanged();
    updateAllPoolPlayers();
    sendDropLifecycleResponse(res, 'ended', req.params, state);
});

function clearCountdownTimer() {
    if (countdownTimer !== null) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
}

function clearJoinOpenTimer() {
    if (joinOpenTimer !== null) {
        clearTimeout(joinOpenTimer);
        joinOpenTimer = null;
    }
}

function releaseWaitingPlayersImmediately(region = null, queue = null) {
    const resolvedRegion = normalizeDropRegion(region || matchmakerState.hostRegion || "ASIA");
    const regionState = dropMatchState[resolvedRegion] || null;
    if (!regionState) {
        logMatchmaker(`Keeping players queued because no drop state exists for ${resolvedRegion}.`, resolvedRegion);
        return;
    }

    const queuesToRelease = queue
        ? [{ queue, state: getDropState(resolvedRegion, queue) }]
        : Object.entries(regionState.queues || {})
            .filter(([, state]) => state?.active && !state?.started)
            .map(([queueName, state]) => ({ queue: queueName, state }));

    if (queuesToRelease.length === 0) {
        logMatchmaker(`Keeping players queued because no open drop server was received for ${queue || resolvedRegion || 'GLOBAL'}.`, resolvedRegion);
        return;
    }

    if (waitingPlayersPool.length === 0) return;

    const playersToRelease = [];
    const matchedPlayers = new Set();

    for (const { queue, state } of queuesToRelease) {
        for (const player of waitingPlayersPool) {
            if (matchedPlayers.has(player)) continue;
            if (playerMatchesDropQueue(player, state)) {
                matchedPlayers.add(player);
                playersToRelease.push(player);
            }
        }
    }

    if (playersToRelease.length === 0) {
        const queueNames = queuesToRelease.map(({ queue }) => queue).join(", ");
        logMatchmaker(`No queued players matched any active drop queues (${queueNames}) for region ${resolvedRegion}.`, resolvedRegion);
        return;
    }

    const regionMatcherState = getRegionState(resolvedRegion);
    if (regionMatcherState && regionMatcherState.firstReleaseAt === null) {
        regionMatcherState.firstReleaseAt = Date.now();
        logMatchmaker(`Recorded first release time: ${regionMatcherState.firstReleaseAt}`, regionMatcherState.hostRegion);
    }

    waitingPlayersPool = waitingPlayersPool.filter((player) => !matchedPlayers.has(player));

    logMatchmaker(`Immediately sending ${playersToRelease.length} queued players to the active drop queues (${queuesToRelease.map(({ queue }) => queue).join(', ')}).`, resolvedRegion);

    playersToRelease.forEach((player) => {
        try {
            player.release();
        } catch (error) {
            logMatchmakerError("release error", error, resolvedRegion);
        }
    });
}

function setRegionJoinLock(region = null, locked = true) {
    const regionState = getRegionState(region || matchmakerState.hostRegion);
    if (regionState) {
        regionState.joinLocked = locked;
        if (locked) {
            regionState.joinOpen = false;
        }
        return;
    }
    joinOpen = !locked;
}

function startJoinAcceptanceOpen(region = null) {
    clearJoinOpenTimer();
    const regionState = getRegionState(region || matchmakerState.hostRegion);
    if (regionState && regionState.joinLocked) {
        logMatchmaker(`Join acceptance is locked until the next host login for ${regionState.hostRegion}.`, regionState.hostRegion);
        return;
    }
    if (regionState) {
        regionState.joinOpen = true;
        regionState.hostReady = false;
        joinOpen = true;
    } else {
        joinOpen = true;
        matchmakerState.hostReady = false;
    }
    logMatchmaker(`Join acceptance has started. It will close after ${JOIN_WINDOW_SECONDS} seconds from the first join.`, regionState ? regionState.hostRegion : matchmakerState.hostRegion);

    if (waitingPlayersPool.length > 0 && countdownTimer === null) {
        releaseWaitingPlayersImmediately(regionState ? regionState.hostRegion : null);
        startJoinWindowCountdown(regionState ? regionState.hostRegion : null);
    }

    updateAllPoolPlayers();
}

function scheduleJoinAcceptanceOpen(region = null) {
    clearCountdownTimer();
    clearJoinOpenTimer();
    const regionState = getRegionState(region || matchmakerState.hostRegion);
    if (regionState) {
        regionState.joinOpen = false;
        regionState.joinLocked = false;
        regionState.hostReady = false;
    } else {
        joinOpen = false;
        matchmakerState.hostReady = false;
    }
    logMatchmaker(`Host login confirmed. Free join will begin in ${JOIN_OPEN_DELAY_SECONDS} seconds.`, regionState ? regionState.hostRegion : matchmakerState.hostRegion);

    joinOpenTimer = setTimeout(() => {
        joinOpenTimer = null;
        const currentRegionState = getRegionState(region || matchmakerState.hostRegion);
        if (!currentRegionState || !currentRegionState.hostLoggedIn || currentRegionState.gameOpen) return;
        startJoinAcceptanceOpen(currentRegionState.hostRegion);
    }, JOIN_OPEN_DELAY_SECONDS * 1000);
}

function startJoinWindowCountdown(region = null, duration = JOIN_WINDOW_SECONDS) {
    const regionState = getRegionState(region || matchmakerState.hostRegion);
    if (regionState && regionState.joinLocked) {
        logMatchmaker(`Join acceptance is locked until the next host login for ${regionState.hostRegion}.`, regionState.hostRegion);
        return;
    }
    if (countdownTimer !== null) return;

    if (regionState) {
        regionState.hostReady = false;
        regionState.joinOpen = true;
    } else {
        matchmakerState.hostReady = false;
        joinOpen = true;
    }
    timeLeft = duration;
    logMatchmaker(`Join acceptance countdown started: ${duration} seconds`, regionState ? regionState.hostRegion : matchmakerState.hostRegion);

    updateAllPoolPlayers();

    countdownTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0 && timeLeft % 10 === 0) {
            logMatchmaker(`${timeLeft} seconds remaining until join acceptance closes...`, matchmakerState.hostRegion);
            updateAllPoolPlayers();
        }

        if (timeLeft <= 0) {
            clearCountdownTimer();

            if (matchmakerState.gameOpen) {
                return;
            }

            if (regionState) {
                regionState.joinOpen = false;
                regionState.joinLocked = true;
                regionState.hostReady = false;
            } else {
                joinOpen = false;
                matchmakerState.hostReady = false;
            }
            logMatchmaker("The join acceptance window has ended. The waiting pool is being kept until the next host login because 50 seconds have passed since the first user joined.", regionState ? regionState.hostRegion : matchmakerState.hostRegion);
            updateAllPoolPlayers();
        }
    }, 1000);
}

function discardWaitingPlayers() {
    const playersToDiscard = [...waitingPlayersPool];
    waitingPlayersPool = [];
    matchmakerState.firstReleaseAt = null;
    matchmakerState.hostReady = false;
    joinOpen = false;

    playersToDiscard.forEach((player) => {
        try {
            if (player.ws.readyState === 1) {
                player.ws.send(JSON.stringify({
                    payload: {
                        ticketId: player.ticketId,
                        queuedPlayers: 0,
                        estimatedWaitSec: 0,
                        status: 3,
                        state: "Queued"
                    },
                    name: "StatusUpdate"
                }));
            }
        } catch (error) {
            // ignore send errors for disconnected clients
        }

        try {
            player.ws.close();
        } catch (error) {
            // ignore close errors
        }
    });
}

function startReleaseCountdown(duration = HOST_READY_BUFFER_SECONDS) {
    if (countdownTimer !== null) return;

    matchmakerState.hostReady = false;
    timeLeft = duration;
    logMatchmaker(`Waiting for host readiness. The match will start automatically in ${duration} seconds.`, matchmakerState.hostRegion);

    updateAllPoolPlayers();

    countdownTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0 && timeLeft % 5 === 0) {
            logMatchmaker(`Automatic start in ${timeLeft} seconds...`, matchmakerState.hostRegion);
            updateAllPoolPlayers();
        }

        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            const dropState = getDropState(regionState ? regionState.hostRegion : matchmakerState.hostRegion);
            if (!dropState?.active || dropState.started) {
                logMatchmaker("Keeping players queued because no open drop server was received.", regionState ? regionState.hostRegion : matchmakerState.hostRegion);
                updateAllPoolPlayers();
                return;
            }
            matchmakerState.gameOpen = true;
            logMatchmaker(`Releasing all players who met the match-start conditions to the server. ${waitingPlayersPool.length}`, matchmakerState.hostRegion);

            const playersToRelease = [...waitingPlayersPool];
            waitingPlayersPool = [];
            matchmakerState.firstReleaseAt = null;

            playersToRelease.forEach((player) => {
                try {
                    player.release();
                } catch (error) {
                    logMatchmakerError("release error", error, matchmakerState.hostRegion);
                }
            });
        }
    }, 1000);
}

function syncHostLoginState() {
    const activeRegion = ["NAE", "ASIA"].find((region) => !!getRegionState(region) && getRegionState(region).hostLoggedIn);

    if (activeRegion) {
        matchmakerState.hostLoggedIn = true;
        matchmakerState.hostRegion = activeRegion;
        return;
    }

    matchmakerState.hostLoggedIn = activeHostSessions.GLOBAL > 0;
    matchmakerState.hostRegion = matchmakerState.hostLoggedIn ? matchmakerState.hostRegion : null;
}

function updateAllPoolPlayers() {
    waitingPlayersPool.forEach((player) => {
        if (player.ws.readyState === 1) {
            let estimatedWaitSec = countdownTimer ? timeLeft : (matchmakerState.gameOpen ? 0 : JOIN_WINDOW_SECONDS);

            if (matchmakerState.firstReleaseAt !== null) {
                const elapsedSinceStart = Math.floor((Date.now() - matchmakerState.firstReleaseAt) / 1000);
                estimatedWaitSec = Math.max(0, JOIN_WINDOW_SECONDS - elapsedSinceStart);
            }

            if (!countdownTimer && matchmakerState.hostLoggedIn && matchmakerState.firstReleaseAt !== null) {
                const elapsedSinceStart = Math.floor((Date.now() - matchmakerState.firstReleaseAt) / 1000);
                if (elapsedSinceStart >= JOIN_WINDOW_SECONDS) {
                    estimatedWaitSec = HOST_READY_BUFFER_SECONDS;
                }
            }

            try {
                player.ws.send(JSON.stringify({
                    payload: {
                        ticketId: player.ticketId,
                        queuedPlayers: waitingPlayersPool.length,
                        estimatedWaitSec,
                        status: 3,
                        state: "Queued"
                    },
                    name: "StatusUpdate"
                }));
            } catch (error) {
                // ignore send errors for disconnected clients
            }
        }
    });
}

function handleHostLogin(displayName, isServer = false) {
    if (!isHostUser(displayName, isServer)) return;

    const hostRegion = getHostRegion(displayName);
    const regionState = getRegionState(hostRegion || matchmakerState.hostRegion);
    const sessionKey = hostRegion || "GLOBAL";
    activeHostSessions[sessionKey] = (activeHostSessions[sessionKey] || 0) + 1;

    if (hostRegion) {
        matchmakerState.hostRegion = hostRegion;
    }

    logMatchmaker(`Host login detected (match ended / returned): ${displayName} / isServer=${isServer} / region=${hostRegion || matchmakerState.hostRegion || 'unknown'}`, hostRegion);

    if (regionState) {
        regionState.hostLoggedIn = true;
        regionState.gameOpen = false;
        regionState.hostReady = false;
        regionState.joinOpen = false;
        regionState.joinLocked = false;
    } else {
        matchmakerState.hostLoggedIn = true;
        matchmakerState.gameOpen = false;
        matchmakerState.hostReady = false;
        joinOpen = false;
    }

    syncHostLoginState();
    clearCountdownTimer();
    clearJoinOpenTimer();

    if (waitingPlayersPool.length > 0) {
        logMatchmaker(`Detected ${waitingPlayersPool.length} queued player(s). Join acceptance will begin in ${JOIN_OPEN_DELAY_SECONDS} seconds.`, hostRegion);
        if (regionState) {
            regionState.hostReady = false;
            scheduleJoinAcceptanceOpen(hostRegion);
        } else {
            matchmakerState.hostReady = false;
            scheduleJoinAcceptanceOpen();
        }
        updateAllPoolPlayers();
    } else {
        if (regionState) {
            regionState.hostReady = true;
        } else {
            matchmakerState.hostReady = true;
        }
        logMatchmaker("No queued players. Waiting for the next participant...", hostRegion);
    }
}

async function handleConnection(ws, req) {
    if (ws.protocol && ws.protocol.toLowerCase().includes("xmpp")) return ws.close();

    const clientIp = req.socket ? req.socket.remoteAddress : "Unknown";
    const dropRegion = getDropRegionFromRequest(req);
    const activeDrop = getDropState(dropRegion);
    const authHeader = (req.headers && req.headers.authorization) || "";
    const authParts = authHeader.split(" ");
    const playerKey = authParts.length >= 3 ? authParts[2] : `${clientIp}:${req.socket ? req.socket.remotePort : Math.random()}`;

    let isDisconnected = false;

    const ticketId = createHash("md5").update(`1${Date.now()}${clientIp}`).digest("hex");
    const matchId = createHash("md5").update(`2${Date.now()}${clientIp}`).digest("hex");
    const sessionId = createHash("md5").update(`3${Date.now()}${clientIp}`).digest("hex");

    let queuedStatusReady = null;
    const queuedStatusPromise = new Promise((resolve) => {
        queuedStatusReady = resolve;
    });

    let playerPlaylist = null;
    let playerRegion = null;
    if (global.kv && typeof global.kv.get === "function") {
        const [playlist, region] = await Promise.all([
            global.kv.get(`playerPlaylist:${playerKey}`),
            global.kv.get(`playerPlaylistRegion:${playerKey}`)
        ]);
        playerPlaylist = typeof playlist === "string" ? playlist : null;
        playerRegion = normalizeDropRegion(region || "");
    }

    const sendStatus = (payload) => {
        if (isDisconnected || ws.readyState !== 1) return false;
        try {
            ws.send(JSON.stringify({ payload, name: "StatusUpdate" }));
            return true;
        } catch (error) {
            return false;
        }
    };

    sendStatus({ state: "Connecting" });
    sendStatus({ totalPlayers: 1, connectedPlayers: 1, state: "Waiting" });
    sendStatus({
        ticketId,
        queuedPlayers: 0,
        estimatedWaitSec: 0,
        status: {},
        state: "Queued"
    });
    queuedStatusReady();

    if (activeDrop?.active && activeDrop.started) {
        logMatchmaker(`Drop match already started; keeping player ${clientIp} in the waiting queue.`, dropRegion);
    }

    const existingPlayerIndex = waitingPlayersPool.findIndex((player) => player.playerKey === playerKey);
    if (existingPlayerIndex !== -1) {
        const existingPlayer = waitingPlayersPool[existingPlayerIndex];
        logMatchmaker(`Reconnection detected for the same player (${playerKey}). Overwriting the old session.`, matchmakerState.hostRegion);

        if (existingPlayer.counted) {
            existingPlayer.counted = false;
            matchmakerState.connectedClients = Math.max(0, matchmakerState.connectedClients - 1);
        }
        waitingPlayersPool.splice(existingPlayerIndex, 1);

        try {
            existingPlayer.ws.close();
        } catch (error) {
            // ignore close errors
        }
    }

    matchmakerState.connectedClients++;

    let proceedToGame = null;
    const holdPromise = new Promise((resolve) => {
        proceedToGame = resolve;
    });

    const player = {
        ws,
        ticketId,
        release: proceedToGame,
        ip: clientIp,
        playerKey,
        counted: true,
        playlist: playerPlaylist,
        region: playerRegion
    };
    waitingPlayersPool.push(player);
    logMatchmaker(`Connected: ${clientIp} / key=${playerKey} (current pool: ${waitingPlayersPool.length})`, matchmakerState.hostRegion);
    global.updateOnlinePlayersMessage?.().catch(() => {});

    if (activeDrop?.active && !activeDrop.started) {
        logMatchmaker(`Drop queue is open; immediately accepting player ${clientIp}.`, dropRegion);
        releaseWaitingPlayersImmediately(dropRegion);
    }

    if (matchmakerState.firstReleaseAt === null) {
        matchmakerState.firstReleaseAt = Date.now();
        logMatchmaker(`Recorded first join time: ${matchmakerState.firstReleaseAt}`, matchmakerState.hostRegion);
    }

    if (activeDrop?.active && !activeDrop.started && matchmakerState.hostLoggedIn && joinOpen && countdownTimer !== null && !matchmakerState.gameOpen) {
        try {
            player.release();
        } catch (error) {
            logMatchmakerError("immediate release error", error, matchmakerState.hostRegion);
        }
    }

    try {
        if (countdownTimer === null && !matchmakerState.gameOpen) {
            if (matchmakerState.hostLoggedIn && !joinOpen) {
                logMatchmaker("Waiting for join acceptance to start after host login...", matchmakerState.hostRegion);
                if (joinOpenTimer === null) {
                    scheduleJoinAcceptanceOpen();
                }
            } else if (matchmakerState.hostLoggedIn && joinOpen && waitingPlayersPool.length > 0) {
                logMatchmaker("The first player joined after join acceptance started, so a 50-second acceptance timer has begun.", matchmakerState.hostRegion)
                startJoinWindowCountdown();
            }
        }
    } catch (error) {
        logMatchmakerError("join logic error", error, matchmakerState.hostRegion);
    }

    ws.on("close", () => {
        if (isDisconnected) return;
        isDisconnected = true;

        if (player.counted) {
            player.counted = false;
            matchmakerState.connectedClients = Math.max(0, matchmakerState.connectedClients - 1);
        }
        waitingPlayersPool = waitingPlayersPool.filter((player) => player.ws !== ws);

        logMatchmaker(`Cancelled disconnect: ${clientIp} (remaining pool size: ${waitingPlayersPool.length})`, matchmakerState.hostRegion);

        if (waitingPlayersPool.length === 0 && !matchmakerState.hostLoggedIn) {
            matchmakerState.firstReleaseAt = null;
        }

        global.updateOnlinePlayersMessage?.().catch(() => {});
        updateAllPoolPlayers();
    });

    if (matchmakerState.hostLoggedIn && countdownTimer === null && !matchmakerState.gameOpen && matchmakerState.firstReleaseAt === null) {
        if (!joinOpen && joinOpenTimer === null) {
            scheduleJoinAcceptanceOpen();
        } else if (joinOpen && waitingPlayersPool.length > 0) {
            startJoinWindowCountdown();
        }
    }

    updateAllPoolPlayers();

    await Promise.all([holdPromise, queuedStatusPromise]);

    if (isDisconnected) return;

    try {
        ws.send(JSON.stringify({
            payload: {
                matchId,
                state: "SessionAssignment"
            },
            name: "StatusUpdate"
        }));
    } catch (error) {
        logMatchmakerError(`Failed to send player [${clientIp}] to the game server`, error, matchmakerState.hostRegion);
        return;
    }

    setTimeout(() => {
        if (isDisconnected || ws.readyState !== 1) return;
        try {
            ws.send(JSON.stringify({
                payload: { matchId, sessionId, joinDelaySec: 1 },
                name: "Play"
            }));
            logMatchmaker(`Sent player [${clientIp}] to the game server`, matchmakerState.hostRegion);
        } catch (error) {
            logMatchmakerError(`Failed to send player [${clientIp}] to the game server`, error, matchmakerState.hostRegion);
        }
    }, 1000);
}

app.get("/start", (req, res) => {
    matchmakerState.gameOpen = true;
    res.json({ success: true });
});

app.get("/close", (req, res) => {
    matchmakerState.gameOpen = false;
    if (waitingPlayersPool.length > 0 && countdownTimer === null) {
        if (matchmakerState.hostLoggedIn && !joinOpen && joinOpenTimer === null) {
            scheduleJoinAcceptanceOpen();
        } else if (joinOpen && waitingPlayersPool.length > 0) {
            startJoinWindowCountdown();
        }
    }
    res.json({ success: true });
});

function handleGameServerReady(displayName, isKeepalive = false) {
    if (countdownTimer !== null) return;
    const hostRegion = getHostRegion(displayName);
    const regionState = getRegionState(hostRegion || matchmakerState.hostRegion);
    if (isKeepalive && regionState && regionState.hostLoggedIn) return;
    if (isKeepalive && !regionState && matchmakerState.hostLoggedIn) return;
    if (regionState && regionState.hostLoggedIn && regionState.hostReady && !regionState.gameOpen) return;
    if (!regionState && matchmakerState.hostLoggedIn && matchmakerState.hostReady && !matchmakerState.gameOpen) return;
    handleHostLogin(displayName, true);
}

function handleHostLogout(displayName, isServer = false) {
    if (!isHostUser(displayName, isServer)) return;

    const hostRegion = getHostRegion(displayName);
    const regionState = getRegionState(hostRegion || matchmakerState.hostRegion);
    const sessionKey = hostRegion || "GLOBAL";

    if ((activeHostSessions[sessionKey] || 0) > 1) {
        activeHostSessions[sessionKey] = Math.max(0, (activeHostSessions[sessionKey] || 0) - 1);
        logMatchmaker(`Host disconnect suppressed while another ${sessionKey} host session is still active.`, hostRegion);
        syncHostLoginState();
        return;
    }

    activeHostSessions[sessionKey] = 0;

    if (hostRegion && matchmakerState.hostRegion === hostRegion) {
        matchmakerState.hostRegion = null;
    }

    logMatchmaker(`Host logout detected: ${displayName} / region=${hostRegion || 'unknown'}`, hostRegion);
    if (regionState) {
        regionState.hostLoggedIn = false;
        regionState.hostReady = false;
        regionState.joinOpen = false;
    } else {
        matchmakerState.hostLoggedIn = false;
        matchmakerState.hostReady = false;
    }

    syncHostLoginState();

    if (waitingPlayersPool.length > 0) {
        if (countdownTimer === null && !joinOpen) {
            logMatchmaker("Keeping the queue alive while no host is present and waiting for join acceptance.", hostRegion)
            if (regionState && regionState.firstReleaseAt === null) {
                regionState.firstReleaseAt = Date.now();
            } else if (matchmakerState.firstReleaseAt === null) {
                matchmakerState.firstReleaseAt = Date.now();
            }
            scheduleJoinAcceptanceOpen(hostRegion);
        } else {
            logMatchmaker("Maintaining the active countdown and keeping the queue intact.", hostRegion)
        }
        updateAllPoolPlayers();
    }
}

function kickPlayer(accountId) {
    if (!accountId || !Array.isArray(global.accessTokens)) return false;

    const accessToken = global.accessTokens.find((entry) => entry && entry.accountId === accountId)?.token;
    if (!accessToken) return false;

    const tokenValues = new Set([accessToken, accessToken.replace(/^eg1~/, "")]);
    let kicked = false;

    waitingPlayersPool.slice().forEach((player) => {
        if (tokenValues.has(player.playerKey)) {
            kicked = true;
            try {
                player.ws.close(4003, "Account banned");
            } catch (error) {
                logMatchmakerError("ban disconnect error", error, matchmakerState.hostRegion);
            }
        }
    });

    return kicked;
}

function getMatchmakerStatus() {
    return {
        connectedClients: matchmakerState.connectedClients,
        gameOpen: matchmakerState.gameOpen,
        hostReady: matchmakerState.hostReady,
        hostLoggedIn: matchmakerState.hostLoggedIn,
        hostRegion: matchmakerState.hostRegion,
        waitingPlayers: waitingPlayersPool.length,
        timeLeft: countdownTimer ? timeLeft : null,
        firstReleaseAt: matchmakerState.firstReleaseAt,
        modes: { ...modeState },
        regionalStates: {
            NAE: { ...regionalMatchmakerState.NAE },
            ASIA: { ...regionalMatchmakerState.ASIA }
        },
        dropMatches: {
            NAE: { ...dropMatchState.NAE },
            ASIA: { ...dropMatchState.ASIA }
        }
    };
}

function setMatchmakerOpen(mode, open) {
    const normalizedMode = String(mode || "").toLowerCase();
    if (normalizedMode === "all") {
        modeState = {
            solo: open,
            duo: open,
            low_solo: open,
            creative: open,
            all: open
        };
    } else if (["solo", "duo", "low_solo", "creative"].includes(normalizedMode)) {
        modeState[normalizedMode] = open;
        if (open) {
            modeState.all = false;
        }
    }
    return getMatchmakerStatus();
}

module.exports = {
    JOIN_OPEN_DELAY_SECONDS,
    JOIN_WINDOW_SECONDS,
    handleExternalConnection: handleConnection,
    handleHostLogin,
    handleHostLogout,
    kickPlayer,
    handleGameServerReady,
    getMatchmakerStatus,
    setMatchmakerOpen,
    getOnlineMatchmakerPlayers,
    arenaRouter: app
};