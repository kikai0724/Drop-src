const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const path = require("path");
const kv = require("./structs/kv.js");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
const WebSocket = require('ws');
const https = require("https");

const log = require("./structs/log.js");
const error = require("./structs/error.js");
const functions = require("./structs/functions.js");
const AutoBackendRestart = require("./structs/autobackendrestart.js");
const matchmaker = require("./matchmaker/matchmaker.js");
const discoveryRoutes = require("./routes/discovery.js");

const app = express();

if (!fs.existsSync("./ClientSettings")) fs.mkdirSync("./ClientSettings");

global.JWT_SECRET = functions.MakeID();
const PORT = config.port;
const WEBSITEPORT = config.Website.websiteport;

let httpsServer;

if (config.bEnableHTTPS) {
    const httpsOptions = {
        cert: fs.readFileSync(config.ssl.cert),
        ca: fs.existsSync(config.ssl.ca) ? fs.readFileSync(config.ssl.ca) : undefined,
        key: fs.readFileSync(config.ssl.key)
    };

    httpsServer = https.createServer(httpsOptions, app);
}

if (!fs.existsSync("./ClientSettings")) fs.mkdirSync("./ClientSettings");

global.JWT_SECRET = functions.MakeID();

console.log('[Shard-backend] booting\n');

const tokens = JSON.parse(fs.readFileSync("./tokenManager/tokens.json").toString());

tokens.accessTokens = Array.isArray(tokens.accessTokens) ? tokens.accessTokens : [];
tokens.refreshTokens = Array.isArray(tokens.refreshTokens) ? tokens.refreshTokens : [];
tokens.clientTokens = Array.isArray(tokens.clientTokens) ? tokens.clientTokens : [];

for (let tokenType in tokens) {
    if (!Array.isArray(tokens[tokenType])) continue;
    for (let tokenIndex in tokens[tokenType]) {
        const tokenEntry = tokens[tokenType][tokenIndex];
        if (!tokenEntry || !tokenEntry.token) continue;

        let decodedToken = jwt.decode(tokenEntry.token.replace("eg1~", ""));
        if (!decodedToken || !decodedToken.creation_date || !decodedToken.hours_expire) continue;

        if (DateAddHours(new Date(decodedToken.creation_date), decodedToken.hours_expire).getTime() <= new Date().getTime()) {
            tokens[tokenType].splice(Number(tokenIndex), 1);
        }
    }
}

fs.writeFileSync("./tokenManager/tokens.json", JSON.stringify(tokens, null, 2));

global.accessTokens = Array.isArray(tokens.accessTokens) ? tokens.accessTokens : [];
global.refreshTokens = Array.isArray(tokens.refreshTokens) ? tokens.refreshTokens : [];
global.clientTokens = Array.isArray(tokens.clientTokens) ? tokens.clientTokens : [];
global.Clients = Array.isArray(global.Clients) ? global.Clients : [];
global.kv = kv;

global.exchangeCodes = [];

let updateFound = false;

mongoose.set('strictQuery', true);

mongoose.connect(config.mongodb.database, () => {
    log.backend("App successfully connected to MongoDB!");
});

mongoose.connection.on("error", err => {
    log.error("MongoDB failed to connect, please make sure you have MongoDB installed and running.");
    throw err;
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(discoveryRoutes);
app.use(matchmaker.arenaRouter);

app.get("/shop", async (req, res) => {
    try {
        const autorotate = require("./structs/autorotate.js");
        const sections = autorotate.getShopSectionConfig();

        const humanizeName = (value) => {
            if (!value || typeof value !== 'string') return 'Unknown';
            return value
                .replace(/^Athena[A-Za-z]+:/, '')
                .replace(/^CID_\d+_/, '')
                .replace(/^BID_\d+_/, '')
                .replace(/^SPID_\d+_/, '')
                .replace(/^Trails_ID_\d+_/, '')
                .replace(/^LSID_\d+_/, '')
                .replace(/^Pickaxe_ID_\d+_/, '')
                .replace(/^MUSIC_\d+_/, '')
                .replace(/^Glider_ID_\d+_/, '')
                .replace(/^Contrail_ID_\d+_/, '')
                .replace(/^Wrap_ID_\d+_/, '')
                .replace(/^Emoji_ID_\d+_/, '')
                .replace(/^Athena_Commando_[MF]_/, '')
                .replace(/^Athena_Commando_/, '')
                .replace(/^Athena_/, '')
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                .replace(/[_-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const normalizeItemName = (grantId) => {
            if (!grantId || typeof grantId !== 'string') return 'Unknown';
            let name = grantId;
            const typePrefixMatch = name.match(/^(Athena[A-Za-z]+):/);
            if (typePrefixMatch) {
                name = name.replace(typePrefixMatch[0], '');
            }
            const fallback = humanizeName(name);
            if (fallback && fallback !== 'Unknown') {
                return fallback;
            }
            return humanizeName(grantId);
        };

        const mapGrantType = (grantType) => {
            const t = String(grantType || '').toLowerCase();
            if (t.includes('character')) return 'Outfit';
            if (t.includes('dance')) return 'Emote';
            if (t.includes('backpack')) return 'Backpack';
            if (t.includes('pickaxe')) return 'Pickaxe';
            if (t.includes('glider')) return 'Glider';
            if (t.includes('wrap')) return 'Wrap';
            if (t.includes('music')) return 'Music';
            if (t.includes('spray')) return 'Spray';
            if (t.includes('contrail')) return 'Contrail';
            if (t.includes('loading')) return 'Loading Screen';
            if (t.includes('emote')) return 'Emote';
            if (t.includes('bundle')) return 'Bundle';
            return 'Cosmetic';
        };

        let catalogEntries = {};
        try {
            const catalogRaw = fs.readFileSync(path.join(__dirname, 'Config', 'catalog_config.json')).toString();
            const catalogJson = JSON.parse(catalogRaw);
            Object.keys(catalogJson).forEach(k => {
                const entry = catalogJson[k];
                if (!entry || !entry.itemGrants || !entry.SectionId) return;
                const sectionId = entry.SectionId;
                entry.itemGrants.forEach(grant => {
                    const parts = (grant || '').split(':');
                    if (parts.length < 2) return;
                    const grantType = parts[0];
                    const grantId = parts.slice(1).join(':');
                    const normalizedGrantType = String(grantType || '').toLowerCase();
                    const normalizedGrantId = String(grantId || '').toLowerCase();

                    // Keep emoji items in the shop display; they should render with their own icon if available.
                    if (normalizedGrantType === 'athenaemoji') {
                        // Emoji IDs are often formatted as Emoji_* and icon URLs may still resolve.
                    }

                    const item = {
                        id: grantId,
                        name: normalizeItemName(grantId),
                        type: { value: mapGrantType(grantType) },
                        rarity: { displayValue: 'Rare' },
                        images: { icon: `https://fortnite-api.com/images/cosmetics/br/${encodeURIComponent(grantId)}/icon.png` },
                        price: entry.price || 0,
                        source: 'current_rotation'
                    };

                    catalogEntries[sectionId] = catalogEntries[sectionId] || [];
                    catalogEntries[sectionId].push(item);
                });
            });
        } catch (err) {
            // ignore if catalog not present or malformed
        }

        const sectionItems = {};
        sections.forEach((section, index) => {
            const sectionNumber = index + 1;
            const sectionKey = section.sectionKey || section.sectionName || `Section${sectionNumber}`;
            const candidates = [
                `Section${sectionNumber}Featured`, `${sectionNumber}Featured`,
                `Section${sectionNumber}Daily`, `${sectionNumber}Daily`
            ];

            const featured = [];
            const daily = [];
            const bundles = [];

            candidates.forEach(c => {
                const arr = catalogEntries[c];
                if (!arr || !Array.isArray(arr)) return;
                if (c.toLowerCase().includes('featured')) {
                    featured.push(...arr);
                } else {
                    daily.push(...arr);
                }
            });

            const candidateKeys = [
                section.sectionDailyId,
                section.sectionFeaturedId,
                section.sectionId,
                sectionKey,
                section.sectionName || `Section${sectionNumber}`,
                `Section${sectionNumber}`,
                String(section.sectionName || '').replace(/\s+/g, ''),
                String(section.sectionName || '').replace(/\s+/g, '') + 'Bundle'
            ];

            candidateKeys.forEach(candidateKey => {
                const directSectionEntries = catalogEntries[candidateKey] || [];
                if (!Array.isArray(directSectionEntries)) return;
                directSectionEntries.forEach(item => {
                    if (item?.type?.value === 'Bundle') {
                        bundles.push(item);
                    }
                });
            });

            sectionItems[sectionKey] = { featured, daily, bundles };
        });

        const populatedSections = sections.map((section, index) => {
            const sectionKey = section.sectionKey || section.sectionName || `Section${index + 1}`;
            return {
                ...section,
                featured: (sectionItems[sectionKey]?.featured || []),
                daily: (sectionItems[sectionKey]?.daily || []),
                bundles: (sectionItems[sectionKey]?.bundles || [])
            };
        });

        const renderItem = (item) => {
            const imageUrl = item?.images?.icon || item?.images?.smallIcon || 'https://via.placeholder.com/512?text=No+Image';
            const itemName = item?.name || item?.displayName || item?.id || 'Unknown';
            const itemType = item?.type?.value || item?.type?.displayValue || item?.rarity?.displayValue || 'Outfit';
            const rarity = item?.rarity?.displayValue || 'Rare';
            const price = item?.price || (Math.floor(Math.random() * 8) + 1) * 100;
            return `
                <article class="card">
                    <div class="image" style="background-image:url('${imageUrl}')"></div>
                    <div class="info">
                        <div class="tag">${itemType}</div>
                        <h3>${itemName}</h3>
                        <div class="meta">${rarity}</div>
                        <div class="price">${price.toLocaleString()} V</div>
                    </div>
                </article>`;
        };

        const renderSection = (section) => {
            const featuredHtml = section.featured.map(renderItem).join('');
            const dailyHtml = section.daily.map(renderItem).join('');
            const bundleHtml = section.bundles.map(renderItem).join('');
            const sectionTitle = section.sectionName || 'Section';
            return `
                <section class="shop-section">
                    <div class="section-block">
                        <div class="section-header">
                            <p class="section-title">${sectionTitle}</p>
                            <p class="section-subtitle"><span>Featured ${section.featured.length} items</span> / <span>Daily ${section.daily.length} items</span> / <span>Bundles ${section.bundles.length} items</span></p>
                        </div>
                        <div class="section-split">
                            <div class="section-column section-featured">
                                <div class="section-column-title">Featured</div>
                                <div class="section-grid">${featuredHtml}</div>
                            </div>
                            <div class="section-column section-daily">
                                <div class="section-column-title">Daily</div>
                                <div class="section-grid">${dailyHtml}</div>
                            </div>
                            ${section.bundles.length > 0 ? `<div class="section-column section-featured">
                                <div class="section-column-title">Bundles</div>
                                <div class="section-grid">${bundleHtml}</div>
                            </div>` : ''}
                        </div>
                    </div>
                </section>`;
        };

        const sectionsHtml = populatedSections.map(renderSection).join('');

        const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Drop Item Shop</title>
<style>
    :root {
        color-scheme: dark;
    }

    * { box-sizing:border-box; }
    body {
        margin:0;
        min-height:100vh;
        font-family: Inter, system-ui, sans-serif;
        color:#f8fafc;
        background:
            radial-gradient(circle at top left, rgba(56, 189, 248, 0.20), transparent 25%),
            radial-gradient(circle at bottom right, rgba(168, 85, 247, 0.18), transparent 30%),
            linear-gradient(135deg, #050816 0%, #0f172a 42%, #111827 100%);
        background-size: 200% 200%;
        animation: hueShift 25s linear infinite;
        overflow-x:hidden;
        position:relative;
    }
    body::before, body::after {
        content:'';
        position:fixed;
        width:360px;
        height:360px;
        border-radius:50%;
        filter:blur(108px);
        opacity:.28;
        pointer-events:none;
        animation: floatGlow 10s ease-in-out infinite;
    }
    body::before {
        top:-120px;
        left:-90px;
        background:rgba(56, 189, 248, 0.7);
    }
    body::after {
        bottom:-120px;
        right:-90px;
        background:rgba(168, 85, 247, 0.7);
        animation-delay:-5s;
    }
    .page::before {
        content:'';
        position:absolute;
        inset:0;
        pointer-events:none;
        opacity:0;
    }

    .page {
        max-width:1200px;
        margin:0 auto;
        padding:24px;
        position:relative;
        z-index:1;
    }
    .header {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        margin-bottom:24px;
        padding:20px 24px;
        border-radius:24px;
        background:rgba(15, 23, 42, 0.62);
        backdrop-filter:blur(18px);
        border:1px solid rgba(148, 163, 184, 0.2);
        box-shadow:0 20px 50px rgba(2, 6, 23, 0.28);
    }
    .brand { display:flex; align-items:center; gap:12px; }
    .brand-logo {
        width:58px;
        height:58px;
        border-radius:16px;
        background:linear-gradient(135deg,#5b21b6,#0ea5e9);
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden;
        box-shadow:0 12px 30px rgba(14, 165, 233, 0.3);
        animation:pulse 3s ease-in-out infinite;
    }
    .brand-logo img { width:100%; height:100%; object-fit:cover; }
    .brand-text { line-height:1.1; }
    .brand-title {
        font-size:2rem;
        margin:0;
        font-weight:800;
        letter-spacing:.02em;
        background:linear-gradient(90deg,#f8fafc 0%, #7dd3fc 100%);
        -webkit-background-clip:text;
        -webkit-text-fill-color:transparent;
    }
    .brand-subtitle { margin:0; color:#cbd5e1; }
    .update-text { margin:0; color:#94a3b8; font-size:.95rem; }

    .section-title {
        font-size:1.25rem;
        margin:0 0 16px;
        color:#e2e8f0;
        letter-spacing:.02em;
        display:flex;
        align-items:center;
        gap:10px;
    }
    .section-title::before {
        content:'';
        width:10px;
        height:10px;
        border-radius:50%;
        background:linear-gradient(135deg,#38bdf8,#a855f7);
        box-shadow:0 0 18px rgba(56, 189, 248, 0.6);
    }

    .section-block {
        margin-bottom:28px;
        padding:22px;
        border-radius:24px;
        background:rgba(15, 23, 42, 0.72);
        border:1px solid rgba(148, 163, 184, 0.15);
        box-shadow:0 16px 40px rgba(2, 6, 23, 0.15);
    }
    .section-subtitle {
        margin:0;
        color:#cbd5e1;
        font-size:.98rem;
    }
    .section-subtitle span {
        color:#94a3b8;
    }
    .section-header {
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-bottom:18px;
    }
    .section-split {
        display:block;
        margin:0;
    }
    .section-column {
        width:100%;
        margin-bottom:18px;
        background:rgba(30, 41, 59, 0.85);
        border:1px solid rgba(148,163,184,0.15);
        border-radius:20px;
        padding:18px;
    }
    .section-column-title {
        margin:0 0 16px;
        font-size:1rem;
        font-weight:700;
        color:#f8fafc;
        letter-spacing:.03em;
    }
    .section-featured {
        border-color:rgba(59,130,246,0.24);
    }
    .section-daily {
        border-color:rgba(16,185,129,0.24);
    }
    .section-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px; }
    .card {
        position:relative;
        background:linear-gradient(180deg, rgba(31,41,55,.96), rgba(17,24,39,.96));
        border:1px solid rgba(148,163,184,.18);
        border-radius:20px;
        overflow:hidden;
        box-shadow:0 24px 60px rgba(2, 6, 23, 0.26);
        transition:transform .25s ease, box-shadow .25s ease, border-color .25s ease;
    }
    .card::before {
        content:'';
        position:absolute;
        inset:0;
        background:linear-gradient(120deg, transparent 0%, rgba(255,255,255,.12) 50%, transparent 100%);
        transform:translateX(-140%);
        transition:transform .65s ease;
        pointer-events:none;
    }
    .card:hover {
        transform:translateY(-6px) scale(1.01);
        box-shadow:0 28px 70px rgba(2, 6, 23, 0.34);
        border-color:rgba(125, 211, 252, 0.38);
    }
    .card:hover::before { transform:translateX(140%); }
    .image {
        padding-top:100%;
        background-size:cover;
        background-position:center;
        position:relative;
        transition:transform .35s ease;
    }
    .card:hover .image { transform:scale(1.05); }
    .info { padding:16px; }
    .tag {
        text-transform:uppercase;
        letter-spacing:.14em;
        font-size:.65rem;
        color:#7dd3fc;
        margin-bottom:8px;
        font-weight:700;
    }
    .meta { margin:0 0 10px; font-size:.82rem; color:#94a3b8; }
    h3 {
        margin:0 0 12px;
        font-size:1.05rem;
        line-height:1.3;
        color:#f8fafc;
    }
    .price {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:6px;
        font-weight:700;
        color:#e2e8f0;
    }
    .price::before {
        content: "";
        display:inline-block;
        width:20px;
        height:20px;
        background-image: url('https://image.fnbr.co/price/icon_vbucks.png');
        background-size:contain;
        background-repeat:no-repeat;
        margin-right:8px;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45));
    }

    @keyframes floatGlow {
        0%, 100% { transform:translate3d(0,0,0) scale(1); }
        50% { transform:translate3d(18px, -22px, 0) scale(1.08); }
    }
    @keyframes hueShift {
        0% { background-position:0% 50%; }
        50% { background-position:100% 50%; }
        100% { background-position:0% 50%; }
    }
    @keyframes slideLines {
        0% { background-position:0 0; }
        100% { background-position:0 32px; }
    }
    @keyframes pulse {
        0%, 100% { transform:translateY(0) scale(1); }
        50% { transform:translateY(-2px) scale(1.03); }
    }

    @media (max-width: 640px) {
        .page { padding:16px; }
        .header { flex-direction:column; align-items:flex-start; }
        .brand-title { font-size:1.6rem; }
    }
</style>
</head>
<body>
<div class="page">
    <div class="header">
        <div class="brand">
            <div class="brand-logo"><img src="https://pub-b3ee689799f143a7968146e63124b471.r2.dev/DropLogo.png" alt="Drop Shop logo" /></div>
            <div class="brand-text">
                <p class="brand-title">Drop Shop</p>
                <p class="brand-subtitle">Drop storefront</p>
            </div>
        </div>
        <div>
            <p class="update-text">Updated: ${new Date().toLocaleString('ja-JP')}</p>
        </div>
    </div>

    ${sectionsHtml}
</div>
</body>
</html>`;

        res.set("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
    } catch (error) {
        log.error("Failed to serve /shop:", error.message || error);
        return res.status(500).send("Unable to render shop page");
    }
});

fs.readdirSync("./routes").forEach(fileName => {
    try {
        app.use(require(`./routes/${fileName}`));
    } catch (err) {
        log.error(`Routes Error: Failed to load ${fileName}`)
    }
});

fs.readdirSync("./Api").forEach(fileName => {
    try {
        app.use(require(`./Api/${fileName}`));
    } catch (err) {
        log.error(`API Error: Failed to load ${fileName}`)
    }
});

app.get("/unknown", (req, res) => {
    log.debug('GET /unknown endpoint called');
    res.json({ msg: "Uhh mister kyle we have a problem" });
});

let server;
if (config.bEnableHTTPS) {
    server = httpsServer.listen(PORT, () => {
        log.backend(`Backend started listening on port ${PORT} (SSL Enabled)`);
        require("./xmpp/xmpp.js");
        if (config.discord.bUseDiscordBot === true) {
            require("./DiscordBot");
        }
        if (config.bUseAutoRotate === true) {
            require("./structs/autorotate.js");
        }
    }).on("error", async (err) => {
        if (err.code === "EADDRINUSE") {
            log.error(`Port ${PORT} is already in use!\nClosing in 3 seconds...`);
            await functions.sleep(3000);
            process.exit(0);
        } else {
            throw err;
        }
    });
} else {
    server = app.listen(PORT, () => {
        log.backend(`Backend started listening on port ${PORT} (SSL Disabled)`);
        require("./xmpp/xmpp.js");
        if (config.discord.bUseDiscordBot === true) {
            require("./DiscordBot");
        }
        if (config.bUseAutoRotate === true) {
            require("./structs/autorotate.js");
        }
    }).on("error", async (err) => {
        if (err.code === "EADDRINUSE") {
            log.error(`Port ${PORT} is already in use!\nClosing in 3 seconds...`);
            await functions.sleep(3000);
            process.exit(0);
        } else {
            throw err;
        }
    });
}

if (config.bEnableAutoBackendRestart === true) {
    AutoBackendRestart.scheduleRestart(config.bRestartTime);
}

if (config.bEnableCalderaService === true) {
    const createCalderaService = require('./CalderaService/calderaservice');
    const calderaService = createCalderaService();

    let calderaHttpsOptions;
    if (config.bEnableHTTPS) {
        calderaHttpsOptions = {
            cert: fs.readFileSync(config.ssl.cert),
            ca: fs.existsSync(config.ssl.ca) ? fs.readFileSync(config.ssl.ca) : undefined,
            key: fs.readFileSync(config.ssl.key)
        };
    }

    if (config.bEnableHTTPS) {
        const calderaHttpsServer = https.createServer(calderaHttpsOptions, calderaService);
        
        if (!config.bGameVersion) {
            log.calderaservice("Please define a version in the config!")
            return;
        }

        calderaHttpsServer.listen(config.bCalderaServicePort, () => {
            log.calderaservice(`Caldera Service started listening on port ${config.bCalderaServicePort} (SSL Enabled)`);
        }).on("error", async (err) => {
            if (err.code === "EADDRINUSE") {
                log.calderaservice(`Caldera Service port ${config.bCalderaServicePort} is already in use!\nClosing in 3 seconds...`);
                await functions.sleep(3000);
                process.exit(1);
            } else {
                throw err;
            }
        });
    } else {
        if (!config.bGameVersion) {
            log.calderaservice("Please define a version in the config!")
            return;
        }

        calderaService.listen(config.bCalderaServicePort, () => {
            log.calderaservice(`Caldera Service started listening on port ${config.bCalderaServicePort} (SSL Disabled)`);
        }).on("error", async (err) => {
            if (err.code === "EADDRINUSE") {
                log.calderaservice(`Caldera Service port ${config.bCalderaServicePort} is already in use!\nClosing in 3 seconds...`);
                await functions.sleep(3000);
                process.exit(1);
            } else {
                throw err;
            }
        });
    }
}

if (config.Website.bUseWebsite === true) {
    const websiteApp = express();
    websiteApp.get("/", (req, res) => res.redirect("/shop"));
    websiteApp.use(require("./routes/gsstats.js"));
    websiteApp.use((req, res, next) => {
        if (req.path === "/shop") return next();
        next();
    });

    let httpsOptions;
    if (config.bEnableHTTPS) {
        httpsOptions = {
            cert: fs.readFileSync(config.ssl.cert),
            ca: fs.existsSync(config.ssl.ca) ? fs.readFileSync(config.ssl.ca) : undefined,
            key: fs.readFileSync(config.ssl.key)
        };
    }

    if (config.bEnableHTTPS) {
        const httpsServer = https.createServer(httpsOptions, websiteApp);
        httpsServer.listen(config.Website.websiteport, () => {
            log.website(`Website started listening on port ${config.Website.websiteport} (SSL Enabled)`);
        }).on("error", async (err) => {
            if (err.code === "EADDRINUSE") {
                log.error(`Website port ${config.Website.websiteport} is already in use!\nClosing in 3 seconds...`);
                await functions.sleep(3000);
                process.exit(1);
            } else {
                throw err;
            }
        });
    } else {
        websiteApp.listen(config.Website.websiteport, () => {
            log.website(`Website started listening on port ${config.Website.websiteport} (SSL Disabled)`);
        }).on("error", async (err) => {
            if (err.code === "EADDRINUSE") {
                log.error(`Website port ${config.Website.websiteport} is already in use!\nClosing in 3 seconds...`);
                await functions.sleep(3000);
                process.exit(1);
            } else {
                throw err;
            }
        });
    }
}

app.use((req, res, next) => {
    const url = req.originalUrl;
    log.debug(`Missing endpoint: ${req.method} ${url} request port ${req.socket.localPort}`);
    if (req.url.includes("..")) {
        res.redirect("https://youtu.be/dQw4w9WgXcQ");
        return;
    }
    error.createError(
        "errors.com.epicgames.common.not_found", 
        "Sorry the resource you were trying to find could not be found", 
        undefined, 1004, undefined, 404, res
    );
});

function DateAddHours(pdate, number) {
    let date = pdate;
    date.setHours(date.getHours() + number);

    return date;
}

module.exports = app;