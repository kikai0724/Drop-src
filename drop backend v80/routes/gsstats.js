const express = require("express");
const config = require("../Config/config.json");
const matchmaker = require("../matchmaker/matchmaker.js");

const router = express.Router();
const statsClients = new Set();

function notifyStatsChanged() {
    const payload = `data: ${JSON.stringify({ changedAt: new Date().toISOString() })}\n\n`;
    statsClients.forEach((client) => {
        try {
            client.write(payload);
        } catch (error) {
            statsClients.delete(client);
        }
    });
}

global.emitGSStatsUpdate = notifyStatsChanged;

function normalizeRegion(region) {
    const value = String(region || "GLOBAL").trim().toUpperCase();
    if (["US", "USA", "NA", "NAE", "NAW"].includes(value)) return "NAE";
    if (["AP", "APAC", "ASIA", "OCE"].includes(value)) return "ASIA";
    return value;
}

function normalizeServer(entry) {
    if (typeof entry === "string") {
        const [host, port, playlist, region, subregion] = entry.split(":");
        return host && port && playlist ? { host, port: Number(port), playlist, region: normalizeRegion(region), subregion: normalizeRegion(subregion) } : null;
    }

    if (!entry || typeof entry !== "object") return null;
    const host = String(entry.host || entry.ip || "");
    const port = Number(entry.port || entry.serverPort || 0);
    const playlist = String(entry.playlist || entry.playlistName || "");
    if (!host || !port || !playlist) return null;
    return {
        host,
        port,
        playlist,
        region: normalizeRegion(entry.region || entry.regionName),
        subregion: normalizeRegion(entry.subregion || entry.subregionName)
    };
}

function playlistLabel(playlist) {
    const value = String(playlist || "").toLowerCase();
    if (value.includes("50v50")) return "50v50";
    if (value.includes("duo")) return "Duos";
    if (value.includes("solo")) return "Arena Solos";
    if (value.includes("squad")) return "Squads";
    return playlist || "Game Server";
}

function getStats() {
    const status = matchmaker.getMatchmakerStatus();
    const servers = [];
    const activeDropServers = new Map();

    const regionState = status.dropMatches || {};
    for (const region of Object.keys(regionState)) {
        const queueMap = regionState[region]?.queues || {};
        for (const queueName of Object.keys(queueMap)) {
            const drop = queueMap[queueName];
            if (!drop?.active || !drop.details) continue;
            const regionNorm = normalizeRegion(drop.details.region);
            const queue = String(queueName || "").trim();
            const playlist = String(drop.details.playlist || "").toLowerCase();
            const queueKey = `${regionNorm}:${queue}:${playlist}`;
            activeDropServers.set(queueKey, { region: regionNorm, queue, playlist, drop });
        }
    }

    for (const { region, queue, playlist, drop } of activeDropServers.values()) {
        const details = drop.details || {};
        const key = `${region}:${queue}:${playlist}`;
        const inGame = Boolean(drop.started);
        const capacity = Math.max(1, Number(details.maxPlayers || 40));
        const players = Math.min(Number(details.players || 0), capacity);
        if (inGame && players <= 0) continue;

        const displayName = playlistLabel(playlist);

        servers.push({
            id: key,
            name: displayName,
            playlist,
            region,
            subregion: region,
            host: details.host || null,
            port: Number(details.port || 0),
            state: inGame ? "IN-GAME" : "JOINABLE",
            description: inGame
                ? "Match in progress, new game will start soon after this one ends."
                : "Server online, filling up the match with players in the pre-game lobby.",
            players,
            capacity,
            playerLabel: inGame ? "Players Left" : "Pre-Lobby"
        });
    }

    return {
        servers,
        total: servers.length,
        joinable: servers.filter(server => server.state === "JOINABLE").length,
        inGame: servers.filter(server => server.state === "IN-GAME").length,
        updatedAt: new Date().toISOString()
    };
}

router.get("/gsstats/api", (req, res) => {
    res.json(getStats());
});

router.get("/gsstats/events", (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    });
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
    statsClients.add(res);
    req.on("close", () => statsClients.delete(res));
});

router.get("/gsstats", (req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Drop Game Servers</title>
<style>
:root{color-scheme:dark;font-family:Inter,Segoe UI,sans-serif;background:#161827;color:#f8fafc}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 8% 0%,#4657c955 0,transparent 32%),radial-gradient(circle at 92% 12%,#00d9b833 0,transparent 28%),radial-gradient(circle at 50% 100%,#a52cff22 0,transparent 42%),linear-gradient(145deg,#202337,#111320 72%);background-size:140% 140%;animation:backgroundDrift 18s ease-in-out infinite alternate;padding:28px 5.5vw}.top{display:flex;align-items:center;gap:18px;margin-bottom:26px;animation:slideDown .55s ease both}.mark{width:54px;height:54px;object-fit:contain;animation:pulse 2.8s ease-in-out infinite}.title{font-size:22px;font-weight:800;background:linear-gradient(100deg,#fff,#9edcff 42%,#c888ff);-webkit-background-clip:text;background-clip:text;color:transparent}.summary{margin-left:auto;color:#c4c9e0;font-size:14px}.servers{display:grid;gap:10px}.server{border:1px solid transparent;border-radius:14px;background:linear-gradient(#1a1d2d,#1a1d2d) padding-box,linear-gradient(110deg,#00e89b99,#5264ff66,#d23cff88) border-box;padding:13px 15px 12px;box-shadow:0 6px 18px #0b0d1670,0 0 28px #5360ff0d;animation:serverIn .55s ease both;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}.server:hover{transform:translateY(-3px);box-shadow:0 10px 28px #00ef8b2b,0 0 34px #5668ff1c}.line{display:flex;align-items:center;gap:8px}.state{font-size:20px;font-weight:900;color:#00f26f}.state.game{color:#e600ff}.dot{color:#8b90a4}.name{font-size:20px;font-weight:750}.badge{font-size:12px;font-weight:800;padding:4px 9px;border-radius:5px;background:linear-gradient(135deg,#3a4164,#292e4d);color:#ced5ff}.count{margin-left:auto;background:linear-gradient(135deg,#101421,#242b48);border-radius:7px;padding:8px 10px;font-weight:800;box-shadow:inset 0 1px #ffffff12}.count small{font-size:12px;color:#bac1d7}.desc{margin:5px 0 10px;color:#aeb4cb;font-size:14px}.bar{height:10px;border-radius:99px;background:#34384c;overflow:hidden;box-shadow:inset 0 1px 4px #080a12}.fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#00ee73,#20ff25,#a6ff55);transition:width .7s ease}.fill.game{background:linear-gradient(90deg,#d900ff,#f42aff,#ff85ff)}.empty{color:#aeb4ca;text-align:center;padding:35px}.foot{color:#858ca8;font-size:12px;margin-top:16px}@keyframes backgroundDrift{from{background-position:0% 0%}to{background-position:100% 100%}}@keyframes serverIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes slideDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{filter:drop-shadow(0 0 0 #5865f266)}50%{filter:drop-shadow(0 0 12px #5865f2aa)}}@media(max-width:650px){body{padding:18px}.summary{display:none}.name,.state{font-size:17px}.count{font-size:13px}.desc{font-size:12px}}
</style>
</head>
<body>
<div class="top"><img class="mark" src="/gsstats/logo.png" alt="Drop" onerror="this.style.display='none'" /><div class="title">Drop Game Servers</div><div class="summary" id="summary">Loading...</div></div>
<div class="servers" id="servers"><div class="empty">Loading servers...</div></div>
<div class="foot" id="updated"></div>
<script>
const servers = document.getElementById('servers');
const summary = document.getElementById('summary');
const updated = document.getElementById('updated');
function render(data) {
  summary.textContent = data.total + ' servers (' + data.joinable + ' joinable, ' + data.inGame + ' in-game)';
    servers.innerHTML = data.servers.length ? data.servers.map((server, index) => {
    const game = server.state === 'IN-GAME';
    const percent = Math.max(0, Math.min(100, server.players / server.capacity * 100));
    return '<article class="server" style="animation-delay:' + (index * 90) + 'ms"><div class="line"><span class="state ' + (game ? 'game' : '') + '">' + server.state + '</span><span class="dot">•</span><span class="name">' + server.name + '</span><span class="badge">' + server.region + '</span><span class="count">' + server.players + '/' + server.capacity + ' <small>' + server.playerLabel + '</small></span></div><div class="desc">' + server.description + '</div><div class="bar"><div class="fill ' + (game ? 'game' : '') + '" style="width:' + percent + '%"></div></div></article>';
  }).join('') : '<div class="empty">No configured game servers.</div>';
  updated.textContent = 'Updated ' + new Date(data.updatedAt).toLocaleString();
}
async function refresh(){try{const response=await fetch('/gsstats/api',{cache:'no-store'});render(await response.json())}catch(error){servers.innerHTML='<div class="empty">Unable to load server status.</div>'}}
refresh();
const statsEvents = new EventSource('/gsstats/events');
statsEvents.onmessage = refresh;
statsEvents.onerror = () => {};
</script>
</body>
</html>`);
});

module.exports = router;
