const assert = require("assert");
const { EventEmitter } = require("events");
const http = require("http");
const express = require("express");

const matchmaker = require("../matchmaker/matchmaker.js");
const matchmakingRoutes = require("../routes/matchmaking.js");

class FakeWebSocket extends EventEmitter {
    constructor() {
        super();
        this.protocol = "";
        this.readyState = 1;
        this.messages = [];
    }

    send(message) {
        this.messages.push(JSON.parse(message));
    }

    close() {
        this.readyState = 3;
        setImmediate(() => this.emit("close"));
    }
}

function createRequest(playerKey, port) {
    return {
        headers: { authorization: `Epic-Signed mms-player ${playerKey} account` },
        socket: { remoteAddress: "127.0.0.1", remotePort: port }
    };
}

async function testArenaRouterDoesNotShadowMatchmakingApi() {
    const app = express();
    app.use(matchmaker.arenaRouter);
    app.use(matchmakingRoutes);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        const response = await fetch(
            `http://127.0.0.1:${address.port}/fortnite/api/game/v2/matchmaking/account/player/session/session-id`
        );

        assert.strictEqual(response.status, 200);
        const body = await response.json();
        assert.strictEqual(body.accountId, "player");
        assert.strictEqual(body.sessionId, "session-id");
        assert.strictEqual(body.serverPort, 7777);
        assert.strictEqual(body.allowJoinInProgress, true);
        assert.strictEqual(typeof body.sessionKey, "string");
        assert.ok(body.sessionKey.length > 0);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

async function testReconnectKeepsAccurateClientCount() {
    const firstSocket = new FakeWebSocket();
    const secondSocket = new FakeWebSocket();

    matchmaker.handleExternalConnection(firstSocket, createRequest("same-player", 10001));
    assert.strictEqual(matchmaker.getMatchmakerStatus().connectedClients, 1);
    assert.strictEqual(matchmaker.getMatchmakerStatus().waitingPlayers, 1);

    matchmaker.handleExternalConnection(secondSocket, createRequest("same-player", 10002));
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(matchmaker.getMatchmakerStatus().connectedClients, 1);
    assert.strictEqual(matchmaker.getMatchmakerStatus().waitingPlayers, 1);

    secondSocket.close();
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(matchmaker.getMatchmakerStatus().connectedClients, 0);
    assert.strictEqual(matchmaker.getMatchmakerStatus().waitingPlayers, 0);
    assert.strictEqual(matchmaker.getMatchmakerStatus().firstReleaseAt, null);
}

function testRenamedServerAccountIsDetectedAsHost() {
    matchmaker.handleHostLogin("renamed-dedicated-host", true);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostLoggedIn, true);

    matchmaker.handleHostLogout("renamed-dedicated-host", true);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostLoggedIn, false);
}

function testRegionSpecificHostAccountsAreTracked() {
    matchmaker.handleHostLogin("ArenaHostNAE", true);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostRegion, "NAE");

    matchmaker.handleHostLogout("ArenaHostNAE", true);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostRegion, null);
}

function testArenaHostAsiaIsIgnored() {
    matchmaker.handleHostLogin("ArenaHostASIA", true);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostLoggedIn, false);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostRegion, null);
}

function testServerSelectionDoesNotUseCurrentHostRegionAsFallback() {
    const selectedServer = matchmakingRoutes.selectGameServerForPlaylist("playlist_showdownalt_solo", null, "NAE");
    assert.strictEqual(selectedServer.region, "ASIA");
}

function testRequestedRegionIsReadFromBucketId() {
    const region = matchmakingRoutes.getRequestedRegion({
        query: { bucketId: "build-id:live:NAE:playlist_showdownalt_solo" },
        body: {},
        headers: {}
    });

    assert.strictEqual(region, "NAE");
}

function testRegionalHostStatesStayIndependent() {
    matchmaker.handleHostLogin("ArenaHostNAE", true);

    matchmaker.handleHostLogout("ArenaHostNAE", true);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostLoggedIn, false);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostRegion, null);
}

function testHostReloginIsTrackedAcrossStaleDisconnects() {
    matchmaker.handleHostLogin("ArenaHostNAE", true);
    matchmaker.handleHostLogin("ArenaHostNAE", true);

    matchmaker.handleHostLogout("ArenaHostNAE", true);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostLoggedIn, true,
        "one stale disconnect should not log the NAE host out while another session is still active");

    matchmaker.handleHostLogout("ArenaHostNAE", true);
    assert.strictEqual(matchmaker.getMatchmakerStatus().hostLoggedIn, false,
        "the final host logout should close the session cleanly");
}

function testArenaFreeJoinWindowMatchesS12Timing() {
    assert.strictEqual(matchmaker.JOIN_OPEN_DELAY_SECONDS, 60,
        "host login should wait 60 seconds before allowing free join");
    assert.strictEqual(matchmaker.JOIN_WINDOW_SECONDS, 50,
        "free join should close 50 seconds after the first player enters");
}

async function testAccountSessionReturnsSelectedGameServerAddress() {
    global.kv = {
        get: async (key) => {
            if (key === "playerPlaylist:player") return "playlist_showdownalt_solo";
            if (key === "playerPlaylistRegion:player") return "NAE";
            if (key === "playerCustomKey:player") return null;
            return null;
        },
        set: async () => {}
    };

    const app = express();
    app.use(matchmakingRoutes);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        const response = await fetch(`http://127.0.0.1:${address.port}/fortnite/api/game/v2/matchmaking/account/player/session/session-id`);
        assert.strictEqual(response.status, 200);
        const body = await response.json();
        assert.strictEqual(body.serverAddress, "127.0.0.1");
        assert.strictEqual(body.serverPort, 7777);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

async function testDropQueueOpenAcceptsPlayersWithoutHostLogin() {
    const app = express();
    app.use(matchmaker.arenaRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        const addResponse = await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/add/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        assert.strictEqual(addResponse.status, 200);
        const addBody = await addResponse.json();
        assert.strictEqual(addBody.maxPlayers, 40);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(addBody, "playlistId"), false);

        const statusAfterAdd = matchmaker.getMatchmakerStatus();
        assert.strictEqual(statusAfterAdd.dropMatches.ASIA.active, true);
        assert.strictEqual(statusAfterAdd.hostLoggedIn, false,
            "drop queue callbacks must not force the matchmaker into a host-logged-in state");

        const socket = new FakeWebSocket();
        matchmaker.handleExternalConnection(socket, createRequest("drop-queue-client", 20001));
        await new Promise((resolve) => setTimeout(resolve, 1800));

        assert.strictEqual(matchmaker.getMatchmakerStatus().waitingPlayers, 0,
            "players should be released while the drop queue is open");
        assert.strictEqual(socket.messages.some((msg) => msg.name === "Play"), true,
            "drop queue open must immediately release a player");
        assert.strictEqual(socket.messages.some((msg) => msg.payload?.state === "Connecting"), true);
        assert.strictEqual(socket.messages.some((msg) => msg.payload?.state === "Queued"), true);
        assert.strictEqual(socket.messages.some((msg) => msg.payload?.state === "SessionAssignment"), true);
        socket.close();
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

async function testDropRouteResponsesExposeQueueAndServerPort() {
    const app = express();
    app.use(matchmaker.arenaRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        const firstResponse = await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/add/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        assert.strictEqual(firstResponse.status, 200);
        const firstBody = await firstResponse.json();
        assert.strictEqual(firstBody.queue, "DropLateGameArenaSolo");
        assert.strictEqual(firstBody.port, 7777);

        const secondResponse = await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/add/DropLateGameArenaSolo2/ASIA/7776/Playlist_ShowdownAlt_Solo/40/LateGame`);
        assert.strictEqual(secondResponse.status, 200);
        const secondBody = await secondResponse.json();
        assert.strictEqual(secondBody.queue, "DropLateGameArenaSolo2");
        assert.strictEqual(secondBody.port, 7776);

        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo2/ASIA/7776/Playlist_ShowdownAlt_Solo/40/LateGame`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

async function testPlayerWithoutDropAddRemainsQueued() {
    const socket = new FakeWebSocket();
    matchmaker.handleExternalConnection(socket, createRequest("without-drop-add", 20003));
    await new Promise((resolve) => setTimeout(resolve, 1200));

    assert.strictEqual(socket.messages.some((msg) => msg.name === "Play"), false,
        "players must remain queued until a drop add event is received");
    assert.strictEqual(matchmaker.getMatchmakerStatus().waitingPlayers, 1);
    socket.close();
    await new Promise((resolve) => setImmediate(resolve));
}

async function testStartedDuoDropDoesNotReleaseQueuedPlayers() {
    const app = express();
    app.use(matchmaker.arenaRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        const socket = new FakeWebSocket();
        matchmaker.handleExternalConnection(socket, createRequest("started-duo-player", 20006));
        await new Promise((resolve) => setTimeout(resolve, 300));

        assert.strictEqual(matchmaker.getMatchmakerStatus().waitingPlayers, 1,
            "a queued player should remain queued before any drop add event");

        const startedResponse = await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/started/DropFullMapDuo2/ASIA/7777/Playlist_DefaultDuo/100/FullMap`);
        assert.strictEqual(startedResponse.status, 200, "started callback should be accepted for DropFullMapDuo2");
        await new Promise((resolve) => setTimeout(resolve, 300));

        assert.strictEqual(matchmaker.getMatchmakerStatus().waitingPlayers, 1,
            "started should not release already queued Duo players");
        assert.strictEqual(socket.messages.some((msg) => msg.name === "Play"), false,
            "started should not send queued Duo players to the game server");

        socket.close();
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropFullMapDuo2/ASIA/7777/Playlist_DefaultDuo/100/FullMap`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

async function testDuoPlayersDoNotGetMixedIntoLateGameOpenQueue() {
    const app = express();
    app.use(matchmaker.arenaRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/add/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/add/DropFullMapDuo2/ASIA/7777/Playlist_DefaultDuo/100/FullMap`);

        global.kv = {
            get: async (key) => {
                if (key === "playerPlaylist:duo-player") return "playlist_defaultduo";
                if (key === "playerPlaylistRegion:duo-player") return "ASIA";
                if (key === "playerCustomKey:duo-player") return null;
                return null;
            },
            set: async () => {}
        };

        const socket = new FakeWebSocket();
        matchmaker.handleExternalConnection(socket, createRequest("duo-player", 20005));
        await new Promise((resolve) => setTimeout(resolve, 1800));

        assert.strictEqual(socket.messages.some((msg) => msg.name === "Play"), true,
            "a duo player should be released from the duo drop queue even when LateGame is also open");

        socket.close();
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropFullMapDuo2/ASIA/7777/Playlist_DefaultDuo/100/FullMap`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        delete global.kv;
    }
}

async function testLateGameArenaQueueSelectionHonorsArenaServerPriority() {
    const app = express();
    app.use(matchmaker.arenaRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/add/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/add/DropLateGameArenaSolo2/ASIA/7776/Playlist_ShowdownAlt_Solo/40/LateGame`);

        const selectedOpenArena = matchmakingRoutes.selectGameServerForPlaylist("playlist_showdownalt_solo", "ASIA", null);
        assert.strictEqual(selectedOpenArena.name, "Arena1",
            "DropLateGameArenaSolo should stay primary while the queue is open/joinable");

        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/started/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);

        const selectedFallbackArena = matchmakingRoutes.selectGameServerForPlaylist("playlist_showdownalt_solo", "ASIA", null);
        assert.strictEqual(selectedFallbackArena.name, "Arena2",
            "DropLateGameArenaSolo2 should handle fallback when the primary queue is in-game or ended");

        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        const selectedEndedArena = matchmakingRoutes.selectGameServerForPlaylist("playlist_showdownalt_solo", "ASIA", null);
        assert.strictEqual(selectedEndedArena.name, "Arena2",
            "DropLateGameArenaSolo2 should handle fallback after the primary queue ends");
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo2/ASIA/7776/Playlist_ShowdownAlt_Solo/40/LateGame`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

async function testPlayerJoiningStartedDropWaitsInQueue() {
    const app = express();
    app.use(matchmaker.arenaRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        const startedResponse = await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/started/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        assert.strictEqual(startedResponse.status, 200);

        const socket = new FakeWebSocket();
        matchmaker.handleExternalConnection(socket, createRequest("started-drop-client", 20002));
        await new Promise((resolve) => setTimeout(resolve, 1500));

        assert.strictEqual(socket.messages.some((msg) => msg.name === "Play"), false,
            "a player joining an active drop must wait for the next add event");
        assert.strictEqual(socket.messages.some((msg) => msg.payload?.state === "Canceled"), false,
            "a player joining an active drop must not be canceled");
        assert.strictEqual(matchmaker.getMatchmakerStatus().waitingPlayers, 1);
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

async function testQueuedPlayerCanJoinSecondaryArenaWhilePrimaryIsInGame() {
    const app = express();
    app.use(matchmaker.arenaRouter);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const address = server.address();
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/started/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/add/DropLateGameArenaSolo2/ASIA/7776/Playlist_ShowdownAlt_Solo/40/LateGame`);

        const socket = new FakeWebSocket();
        matchmaker.handleExternalConnection(socket, createRequest("secondary-arena-client", 20004));
        await new Promise((resolve) => setTimeout(resolve, 1500));

        assert.strictEqual(socket.messages.some((msg) => msg.name === "Play"), true,
            "a player must join Arena2 immediately while Arena1 is in-game");
        socket.close();
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo/ASIA/7777/Playlist_ShowdownAlt_Solo/40/LateGame`);
        await fetch(`http://127.0.0.1:${address.port}/fortnite/api/drop/ended/DropLateGameArenaSolo2/ASIA/7776/Playlist_ShowdownAlt_Solo/40/LateGame`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

(async () => {
    await testArenaRouterDoesNotShadowMatchmakingApi();
    await testReconnectKeepsAccurateClientCount();
    testRenamedServerAccountIsDetectedAsHost();
    testRegionSpecificHostAccountsAreTracked();
    testArenaHostAsiaIsIgnored();
    testServerSelectionDoesNotUseCurrentHostRegionAsFallback();
    testRequestedRegionIsReadFromBucketId();
    testRegionalHostStatesStayIndependent();
    testHostReloginIsTrackedAcrossStaleDisconnects();
    testArenaFreeJoinWindowMatchesS12Timing();
    await testAccountSessionReturnsSelectedGameServerAddress();
    await testDropQueueOpenAcceptsPlayersWithoutHostLogin();
    await testDropRouteResponsesExposeQueueAndServerPort();
    await testPlayerWithoutDropAddRemainsQueued();
    await testStartedDuoDropDoesNotReleaseQueuedPlayers();
    await testDuoPlayersDoNotGetMixedIntoLateGameOpenQueue();
    await testPlayerJoiningStartedDropWaitsInQueue();
    await testQueuedPlayerCanJoinSecondaryArenaWhilePrimaryIsInGame();
    await testLateGameArenaQueueSelectionHonorsArenaServerPriority();
    console.log("matchmaker tests passed");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
