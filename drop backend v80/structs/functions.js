const XMLBuilder = require("xmlbuilder");
const uuid = require("uuid");
const bcrypt = require("bcrypt");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const Badwords = require("bad-words");

const badwords = new Badwords();

const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const profileManager = require("../structs/profile.js");
const Friends = require("../model/friends.js");
const Arena = require("../model/arena.js");
const log = require("./log.js");
const config = require("../Config/config.json");

let cachedItemShop = null;
let cachedItemShopSignature = null;

function getItemShopSignature() {
    const catalogConfigPath = path.join(__dirname, "..", "Config", "catalog_config.json");
    const configPath = path.join(__dirname, "..", "Config", "config.json");

    try {
        const catalogStats = fs.existsSync(catalogConfigPath) ? fs.statSync(catalogConfigPath) : null;
        const configStats = fs.existsSync(configPath) ? fs.statSync(configPath) : null;
        return [
            catalogStats ? `${catalogStats.mtimeMs}:${catalogStats.size}` : 'missing-catalog-config',
            configStats ? `${configStats.mtimeMs}:${configStats.size}` : 'missing-config'
        ].join('|');
    } catch (error) {
        return 'signature-error';
    }
}

async function sleep(ms) {
    await new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    })
}

function GetVersionInfo(req) {
    let memory = {
        season: 0,
        build: 0.0,
        CL: "0",
        lobby: ""
    }

    if (req.headers["user-agent"]) {
        let CL = "";

        try {
            let BuildID = req.headers["user-agent"].split("-")[3].split(",")[0];

            if (!Number.isNaN(Number(BuildID))) CL = BuildID;
            else {
                BuildID = req.headers["user-agent"].split("-")[3].split(" ")[0];

                if (!Number.isNaN(Number(BuildID))) CL = BuildID;
            }
        } catch {
            try {
                let BuildID = req.headers["user-agent"].split("-")[1].split("+")[0];

                if (!Number.isNaN(Number(BuildID))) CL = BuildID;
            } catch {}
        }

        try {
            let Build = req.headers["user-agent"].split("Release-")[1].split("-")[0];

            if (Build.split(".").length == 3) {
                let Value = Build.split(".");
                Build = Value[0] + "." + Value[1] + Value[2];
            }

            memory.season = Number(Build.split(".")[0]);
            memory.build = Number(Build);
            memory.CL = CL;
            memory.lobby = `LobbySeason${memory.season}`;

            if (Number.isNaN(memory.season)) throw new Error();
        } catch {
            if (Number(memory.CL) < 3724489) {
                memory.season = 0;
                memory.build = 0.0;
                memory.CL = CL;
                memory.lobby = "LobbySeason0";
            } else if (Number(memory.CL) <= 3790078) {
                memory.season = 1;
                memory.build = 1.0;
                memory.CL = CL;
                memory.lobby = "LobbySeason1";
            } else {
                memory.season = 2;
                memory.build = 2.0;
                memory.CL = CL;
                memory.lobby = "LobbyWinterDecor";
            }
        }
    }

    return memory;
}

function chooseRandom(values) {
    return values[Math.floor(Math.random() * values.length)];
}

function normalizeShopTemplateId(value) {
    return String(value || '').trim().toLowerCase();
}

function createSafeUsername(username, accountId = null) {
    const raw = String(username || '').trim();
    const suffix = String(accountId || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const fallback = suffix.slice(-10) || 'anonymous';

    if (!raw) return `User-${fallback}`;

    const cleaned = raw
        .replace(/[\n\r\t\x00-\x1F\x7F-\x9F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return `User-${fallback}`;
    if (cleaned.length >= 3 && cleaned.length < 25 && !badwords.isProfane(cleaned)) {
        return cleaned;
    }

    return `User-${fallback}`;
}

function getTodayPopularTrackerPath() {
    return path.join(__dirname, "..", "Config", "today_popular_items.json");
}

function getTodayPopularItems() {
    const trackerPath = getTodayPopularTrackerPath();
    if (!fs.existsSync(trackerPath)) return [];

    try {
        const raw = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
        const records = Array.isArray(raw) ? raw : [];
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        const counts = new Map();
        records.forEach((entry) => {
            if (!entry || !entry.timestamp) return;
            const timestamp = new Date(entry.timestamp);
            if (Number.isNaN(timestamp.getTime()) || timestamp < todayStart || timestamp >= todayEnd) return;

            const grants = Array.isArray(entry?.itemGrants) ? entry.itemGrants : [];
            grants.forEach((grant) => {
                const normalized = normalizeTodayPopularTemplate(grant);
                if (!normalized) return;
                counts.set(normalized, (counts.get(normalized) || 0) + 1);
            });
        });

        const limit = Number(config.bPopularSectionItemCount || 6);
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, limit)
            .map(([templateId, count]) => ({ templateId, count }));
    } catch (error) {
        log.error('Failed to load today popular tracker', error);
        return [];
    }
}

function normalizeTodayPopularTemplate(value) {
    if (!value) return '';

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed === '[object Object]') return '';
        return trimmed;
    }

    if (typeof value === 'object') {
        const templateId = value?.templateId || value?.id || value?.itemId || value?.template || '';
        if (typeof templateId === 'string') {
            const trimmed = templateId.trim();
            if (!trimmed || trimmed === '[object Object]') return '';
            return trimmed;
        }
    }

    const fallback = String(value || '').trim();
    return fallback && fallback !== '[object Object]' ? fallback : '';
}

function recordTodayPopularPurchase(itemGrants = []) {
    const trackerPath = getTodayPopularTrackerPath();
    const grants = Array.isArray(itemGrants)
        ? itemGrants.map((grant) => String(grant || '').trim()).filter(Boolean)
        : [];

    if (grants.length === 0) return;

    let records = [];
    try {
        if (fs.existsSync(trackerPath)) {
            const raw = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
            records = Array.isArray(raw) ? raw : [];
        }
    } catch (error) {
        records = [];
    }

    records.push({
        timestamp: new Date().toISOString(),
        itemGrants: grants
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const filtered = records.filter((entry) => {
        if (!entry || !entry.timestamp) return false;
        const timestamp = new Date(entry.timestamp);
        return !Number.isNaN(timestamp.getTime()) && timestamp >= todayStart;
    });

    fs.writeFileSync(trackerPath, JSON.stringify(filtered, null, 2));
}

function getSectionDisplayName(sectionId) {
    const id = String(sectionId || '').toLowerCase();

    if (id === 'section7daily' || id === 'section7featured' || id === 'section7') {
        return '無料枠';
    }

    const dailyPrimary = [
        'Daily Items',
        'Today\'s Daily',
        'Daily Rotation',
        'Rotating Daily Items',
        'Daily Selection',
        'Daily Spotlight',
        'Daily Feature',
        'Today\'s Picks',
        'Rotating Picks',
        'Drop Daily',
        'Daily Highlight',
        'Rotating Highlight',
        'Special Daily',
        'Popular Daily',
        'Fresh Daily',
        'Featured Daily',
        'Trending Daily',
        'Daily Select',
        'Extra Daily'
    ];
    const featuredPrimary = [
        'Featured Items',
        'Drop Featured',
        'Pickups',
        'Hot Items',
        'Top Picks',
        'Featured',
        'This Week\'s Highlight',
        'Star Select',
        'Top Pick',
        'Popular Items',
        'Featured Goods',
        'Special Select',
        'Epic Pick',
        'Premium Section',
        'Limited Collection'
    ];
    const dailyMore = [
        'More Daily',
        'Additional Daily',
        'Daily Expansion',
        'Bonus Daily',
        'Daily #2',
        'Another Daily',
        'Additional Rotation',
        'Daily Refill',
        'Today\'s Extra',
        'Rotating Continue',
        'Daily Spotlight',
        'Daily Add-On',
        'Special Daily',
        'Trending Daily',
        'Drop Recommendation',
        'Today\'s Lineup',
        'This Week\'s Daily',
        'Daily Sale',
        'Daily Select',
        'Special Daily'
    ];
    const featuredMore = [
        'More Featured',
        'Additional Featured',
        'Featured Expansion',
        'Bonus Pickup',
        'Featured #2',
        'Featured Continue',
        'Additional Spotlight',
        'Another Featured',
        'Spotlight Add-On',
        'Highlight Continue',
        'Featured Extra',
        'Additional Highlight',
        'Storm of Items',
        'Limited-Time Pick',
        'Best of the Week',
        'Rising Popularity',
        'New Recommendations',
        'Featured Select',
        'Top Store',
        'Premium Collection',
        'Epic Pick'
    ];

    const sectionMatch = id.match(/section[_ ]?(\d+)/);
    const sectionNumber = sectionMatch ? Number(sectionMatch[1]) : 1;

    const pickFromPool = (pool, index, fallback) => {
        if (!Array.isArray(pool) || pool.length === 0) return fallback;
        const safeIndex = Math.max(0, Math.min(index, pool.length - 1));
        return pool[safeIndex];
    };

    if (id.includes('daily')) {
        const pool = sectionNumber === 1 ? dailyPrimary : dailyMore;
        return chooseRandom(pool);
    }
    if (id.includes('featured')) {
        const pool = sectionNumber === 1 ? featuredPrimary : featuredMore;
        return chooseRandom(pool);
    }

    const genericSectionMatch = id.match(/^section[_ ]?(\d+)$/);
    if (genericSectionMatch) {
        const allSectionNames = [
            ...dailyPrimary,
            ...dailyMore,
            ...featuredPrimary,
            ...featuredMore,
            'Recommended Section',
            'Top Store',
            'Ultimate Section',
            'Limited Shop',
            'Special Store'
        ];
        return chooseRandom(allSectionNames);
    }

    if (id.includes('battlepass') || id === 'battlepass') {
        return chooseRandom(['Battle Pass', 'Season Pass', 'Battle Pass Store', 'Battle Pass Section', 'BP Store']);
    }
    return chooseRandom(['Item Shop', 'Shop Section', 'Storefront']);
}

function isFreeShopSection(section, sectionIndex) {
    if (!section || typeof section !== 'object') return false;

    const sectionName = String(section.sectionName || section.sectionId || '').trim();
    const normalizedName = sectionName.toLowerCase();
    const normalizedIndex = Number(sectionIndex ?? 0) + 1;

    if (normalizedName.includes('section 7') || normalizedName.includes('section7') || normalizedIndex === 7) {
        return true;
    }

    return false;
}

function getSectionFreePrice(section, sectionIndex) {
    return isFreeShopSection(section, sectionIndex) ? 0 : null;
}

function getShopSectionDisplayName(sectionId) {
    if (String(sectionId || '').toLowerCase() === 'section7daily' || String(sectionId || '').toLowerCase() === 'section7featured') {
        return '無料枠';
    }

    return getSectionDisplayName(sectionId);
}

function buildShopSections() {
    const sections = [];
    const todayPopularItems = getTodayPopularItems();
    const shouldShowPopularSection = Number(config.bEnableTodayPopularSection ?? 1) === 1;

    if (shouldShowPopularSection || Array.isArray(todayPopularItems) && todayPopularItems.length > 0) {
        sections.push({
            bSortOffersByOwnership: false,
            bShowIneligibleOffersIfGiftable: false,
            bEnableToastNotification: true,
            background: {
                stage: 'default',
                _type: 'DynamicBackground',
                key: 'vault'
            },
            _type: 'ShopSection',
            landingPriority: 200,
            bHidden: false,
            sectionId: 'TodayPopular',
            bShowTimer: true,
            sectionDisplayName: 'Popular Today',
            bShowIneligibleOffers: true,
            bFreeSection: false
        });
    }

    if (!Array.isArray(config.bShopSections) || config.bShopSections.length === 0) {
        if (config.bBattlePassItems === true) {
            const battlePassSection = {
                bSortOffersByOwnership: false,
                bShowIneligibleOffersIfGiftable: false,
                bEnableToastNotification: true,
                background: { stage: 'default', _type: 'DynamicBackground', key: 'vault' },
                _type: 'ShopSection',
                landingPriority: 10,
                bHidden: false,
                sectionId: 'BattlePass',
                bShowTimer: false,
                sectionDisplayName: getSectionDisplayName('BattlePass'),
                bShowIneligibleOffers: true
            };

            sections.push(battlePassSection);
        }

        return sections.length > 0 ? sections : null;
    }

    config.bShopSections.flatMap((section, index) => {
        const sectionNumber = index + 1;
        const basePriority = 100 - index * 40;
        const dailyPriority = Math.max(0, basePriority);
        const featuredPriority = Math.max(0, basePriority - 20);

        const isFreeSection = isFreeShopSection(section, index);

        const shopSectionDaily = {
            bSortOffersByOwnership: false,
            bShowIneligibleOffersIfGiftable: false,
            bEnableToastNotification: true,
            background: {
                stage: 'default',
                _type: 'DynamicBackground',
                key: 'vault'
            },
            _type: 'ShopSection',
            landingPriority: dailyPriority,
            bHidden: false,
            sectionId: `Section${sectionNumber}Daily`,
            bShowTimer: true,
            sectionDisplayName: isFreeSection ? 'Free Slot' : getSectionDisplayName(`Section${sectionNumber}Daily`),
            bShowIneligibleOffers: true,
            bFreeSection: isFreeSection
        };

        const shopSectionFeatured = {
            bSortOffersByOwnership: false,
            bShowIneligibleOffersIfGiftable: false,
            bEnableToastNotification: true,
            background: {
                stage: 'default',
                _type: 'DynamicBackground',
                key: 'vault'
            },
            _type: 'ShopSection',
            landingPriority: featuredPriority,
            bHidden: false,
            sectionId: `Section${sectionNumber}Featured`,
            bShowTimer: true,
            sectionDisplayName: isFreeSection ? 'Free Slot' : getSectionDisplayName(`Section${sectionNumber}Featured`),
            bShowIneligibleOffers: true,
            bFreeSection: isFreeSection
        };

        sections.push(shopSectionDaily, shopSectionFeatured);
    });

    if (config.bBattlePassItems === true) {
        const battlePassSection = {
            bSortOffersByOwnership: false,
            bShowIneligibleOffersIfGiftable: false,
            bEnableToastNotification: true,
            background: { stage: 'default', _type: 'DynamicBackground', key: 'vault' },
            _type: 'ShopSection',
            landingPriority: 10,
            bHidden: false,
            sectionId: 'BattlePass',
            bShowTimer: false,
            sectionDisplayName: getSectionDisplayName('BattlePass'),
            bShowIneligibleOffers: true
        };

        sections.push(battlePassSection);
    }

    return sections;
}

function deduplicateCatalogEntries(entries = []) {
    const seen = new Set();
    const deduped = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry || typeof entry !== 'object') continue;

        if (entry?.__shopIdentity) {
            if (seen.has(entry.__shopIdentity)) continue;
            seen.add(entry.__shopIdentity);
            deduped.push(entry);
            continue;
        }

        const grants = Array.isArray(entry?.itemGrants)
            ? entry.itemGrants.map((grant) => (typeof grant === 'string' ? grant : grant?.templateId || '')).filter(Boolean)
            : [];
        const identity = grants.length > 0
            ? `grants:${grants.join('|')}`
            : (entry?.offerId ? `offer:${entry.offerId}` : (entry?.devName ? `dev:${entry.devName}` : `payload:${JSON.stringify(entry?.meta || {})}`));

        if (seen.has(identity)) continue;
        seen.add(identity);
        deduped.push(entry);
    }

    return deduped;
}

function getContentPages(req) {
    const memory = GetVersionInfo(req);

    const contentpages = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "responses", "contentpages.json")).toString());

    let Language = "en";

    try {
        if (req.headers["accept-language"]) {
            if (req.headers["accept-language"].includes("-") && req.headers["accept-language"] != "es-419") {
                Language = req.headers["accept-language"].split("-")[0];
            } else {
                Language = req.headers["accept-language"];
            }
        }
    } catch {}

    const modes = ["saveTheWorldUnowned", "battleRoyale", "creative", "saveTheWorld"];
    const news = ["savetheworldnews", "battleroyalenews"];

    try {
        modes.forEach(mode => {
            contentpages.subgameselectdata[mode].message.title = contentpages.subgameselectdata[mode].message.title[Language]
            contentpages.subgameselectdata[mode].message.body = contentpages.subgameselectdata[mode].message.body[Language]
        })
    } catch {}

    try {
        const playlistInfo = contentpages.playlistinformation?.playlist_info?.playlists || [];
        const fiftyVsFifty = playlistInfo.find(playlist => playlist.playlist_name === 'Playlist_50v50');
        if (fiftyVsFifty) {
            fiftyVsFifty.display_name = Language === 'ja' ? fiftyVsFifty.display_name_ja : fiftyVsFifty.display_name_en;
            fiftyVsFifty.description = Language === 'ja' ? fiftyVsFifty.description_ja : fiftyVsFifty.description_en;
        }
    } catch {}

    try {
        if (memory.build < 5.30) { 
            news.forEach(mode => {
                contentpages[mode].news.messages[0].image = "https://i.imgur.com/6ayl4nx.png";
                contentpages[mode].news.messages[1].image = "https://i.imgur.com/6ayl4nx.png";
            });
        }
    } catch {}

    try {
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = `season${memory.season}`;
        contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = `season${memory.season}`;

        if (memory.season == 10) {
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "seasonx";
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = "seasonx";
        }

        if (memory.build == 11.31 || memory.build == 11.40) {
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "Winter19";
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = "Winter19";
        }

        if (memory.build == 19.01) {
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "winter2021";
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png";
                contentpages.subgameinfo.battleroyale.image = "https://i.imgur.com/6ayl4nx.png";
            contentpages.specialoffervideo.bSpecialOfferEnabled = "true";
        }

        if (memory.season == 20) {
            if (memory.build == 20.40) {
                contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png"
            } else {
                contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png";
            }
        }

        if (memory.season == 21) {
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png"
            
            if (memory.build == 21.10) {
                contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "season2100";
            }
            if (memory.build == 21.30) {
                contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png"
                contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "season2130";
            }
        }

        if (memory.season == 22) {
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png"
        }

        if (memory.season == 23) {
            if (memory.build == 23.10) {
                contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png"
                contentpages.specialoffervideo.bSpecialOfferEnabled = "true";
            } else {
                contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png";
            }
        }

        if (memory.season == 24) {
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "defaultnotris";
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png";
        }

        if (memory.season == 25) {
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png"
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png"
            
            if (memory.build == 25.11) {
                contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].backgroundimage = "https://i.imgur.com/6ayl4nx.png"
            }
        }

        if (memory.season == 27) {
            contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = "rufus";
        }
    } catch {}

    try {
        const dynamicSections = buildShopSections();
        if (Array.isArray(dynamicSections) && dynamicSections.length > 0) {
            contentpages.shopSections = contentpages.shopSections || {};
            contentpages.shopSections.sectionList = contentpages.shopSections.sectionList || { _type: 'ShopSectionList', sections: [] };
            contentpages.shopSections.sectionList.sections = dynamicSections;
        } else if (contentpages.shopSections && contentpages.shopSections.sectionList && Array.isArray(contentpages.shopSections.sectionList.sections)) {
            contentpages.shopSections.sectionList.sections.forEach(section => {
                if (section && typeof section.sectionId === 'string') {
                    section.sectionDisplayName = getSectionDisplayName(section.sectionId);
                }
            });
        }
    } catch {}

    return contentpages;
}

function getItemShop() {
    const currentSignature = getItemShopSignature();

    if (cachedItemShop && cachedItemShopSignature === currentSignature) {
        return cachedItemShop;
    }

    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "responses", "catalog.json")).toString());
    const catalogConfigPath = path.join(__dirname, "..", "Config", "catalog_config.json");
    let CatalogConfig = {};

    try {
        CatalogConfig = JSON.parse(fs.readFileSync(catalogConfigPath, "utf8"));
    } catch (error) {
        log.error("Failed to load catalog_config.json for storefront generation:", error.message || error);
        CatalogConfig = {};
    }

    const todayPopularItems = getTodayPopularItems();
    
    const todayAtMidnight = new Date();
    todayAtMidnight.setHours(24, 0, 0, 0)
    const todayOneMinuteBeforeMidnight = new Date(todayAtMidnight.getTime() - 60000);
    const isoDate = todayOneMinuteBeforeMidnight.toISOString();

    const getDeterministicFloat = (seed) => {
        const hash = crypto.createHash('sha1').update(String(seed || '')).digest('hex');
        const value = parseInt(hash.slice(0, 8), 16);
        return value / 0xffffffff;
    };

    const getDeterministicPrice = (seed, min, max, step = 50) => {
        const normalizedMin = Number(min) || 0;
        const normalizedMax = Number(max) || normalizedMin;
        if (normalizedMin >= normalizedMax) return normalizedMin;
        const steps = Math.floor((normalizedMax - normalizedMin) / step) + 1;
        const choice = Math.min(steps - 1, Math.floor(getDeterministicFloat(seed) * steps));
        return normalizedMin + choice * step;
    };

    // Track items per section for LayoutId
    const sectionItemCounts = {};

    const getStorefront = (name) => {
        let idx = catalog.storefronts.findIndex(p => p.name == name);
        if (idx == -1) {
            catalog.storefronts.push({ name, catalogEntries: [] });
            idx = catalog.storefronts.length - 1;
        }
        return catalog.storefronts[idx];
    };

    const determinePriceForTemplate = (templateId, fallbackSectionId) => {
        const normalizedTemplate = String(templateId || '').toLowerCase();
        const sectionId = String(fallbackSectionId || '').trim();
        const normalizeSectionName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const normalizedSectionId = normalizeSectionName(sectionId);
        const sectionIndex = Array.isArray(config.bShopSections)
            ? config.bShopSections.findIndex(section => {
                const candidate = normalizeSectionName(section.sectionName || section.sectionId || '');
                return !!candidate && (normalizedSectionId.includes(candidate) || candidate.includes(normalizedSectionId));
            })
            : -1;
        const isFreeByKey = normalizedTemplate.includes('section7') || normalizedTemplate.includes('section_7');
        const freePrice = getSectionFreePrice({ sectionName: sectionId, sectionId }, sectionIndex);
        if (freePrice === 0 || isFreeByKey) return 0;

        let min = 200, max = 500;
        if (normalizedTemplate.includes('pickaxe') || normalizedTemplate.includes('pickaxe_id')) { min = 500; max = 1200; }
        else if (normalizedTemplate.includes('character') || normalizedTemplate.includes(':cid_') || normalizedTemplate.includes('cid_')) { min = 800; max = 2000; }
        else if (normalizedTemplate.includes(':eid_') || normalizedTemplate.includes('eid_') || normalizedTemplate.includes('emote')) { min = 200; max = 800; }
        else if (normalizedTemplate.includes('backpack') || normalizedTemplate.includes(':bid_') || normalizedTemplate.includes('bid_')) { min = 300; max = 500; }
        else if (normalizedTemplate.includes('emoji')) { min = 200; max = 200; }
        else if (normalizedTemplate.includes('wrap') || normalizedTemplate.includes('wraps')) { min = 300; max = 300; }

        const rand = Math.floor(Math.random() * (max - min + 1)) + min;
        return Math.max(50, Math.round(rand / 50) * 50);
    };

    const getEntryIdentity = (entry) => {
        if (entry?.__shopIdentity) return `manual:${entry.__shopIdentity}`;
        const grants = Array.isArray(entry?.itemGrants)
            ? entry.itemGrants.map(grant => (typeof grant === 'string' ? grant : grant?.templateId || '')).filter(Boolean)
            : [];
        if (grants.length > 0) return `grants:${grants.join('|')}`;
        if (entry?.offerId) return `offer:${entry.offerId}`;
        if (entry?.devName) return `dev:${entry.devName}`;
        return `payload:${JSON.stringify(entry)}`;
    };

    const pushIntoStorefront = (storefrontName, entry) => {
        const storefront = getStorefront(storefrontName);
        const entryIdentity = getEntryIdentity(entry);
        const exists = storefront.catalogEntries.some(existingEntry => getEntryIdentity(existingEntry) === entryIdentity);
        if (!exists) {
            storefront.catalogEntries.push(entry);
        }
    };

    const dedupeStorefrontEntries = (storefrontName) => {
        const storefront = getStorefront(storefrontName);
        const deduped = deduplicateCatalogEntries(storefront.catalogEntries || []);
        storefront.catalogEntries = deduped;
    };

    const pushPopularEntries = () => {
        if (!Array.isArray(todayPopularItems) || todayPopularItems.length === 0) return;

        const makeCatalogEntry = (templateId) => {
            const entry = {
                devName: '',
                offerId: '',
                fulfillmentIds: [],
                dailyLimit: -1,
                weeklyLimit: -1,
                monthlyLimit: -1,
                categories: [],
                prices: [{ currencyType: 'MtxCurrency', currencySubType: '', regularPrice: 0, finalPrice: 0, saleExpiration: isoDate, basePrice: 0 }],
                meta: { SectionId: 'TodayPopular', TileSize: 'Small', LayoutId: 'TodayPopular.0' },
                matchFilter: '',
                filterWeight: 0,
                appStoreId: [],
                requirements: [],
                offerType: 'StaticPrice',
                giftInfo: { bIsEnabled: true, forcedGiftBoxTemplateId: '', purchaseRequirements: [], giftRecordIds: [] },
                refundable: false,
                metaInfo: [
                    { key: 'SectionId', value: 'TodayPopular' },
                    { key: 'TileSize', value: 'Small' },
                    { key: 'LayoutId', value: 'TodayPopular.0' }
                ],
                displayAssetPath: '',
                itemGrants: [],
                sortPriority: 0,
                catalogGroupPriority: 0
            };

            entry.requirements.push({ requirementType: 'DenyOnItemOwnership', requiredId: templateId, minQuantity: 1 });
            entry.itemGrants.push({ templateId, quantity: 1 });
            const hash = crypto.createHash('sha1').update(`popular_${templateId}`).digest('hex');
            entry.devName = hash;
            entry.offerId = hash;
            entry.meta.LayoutId = `TodayPopular.${sectionItemCounts.TodayPopular || 0}`;
            entry.metaInfo.find((meta) => meta.key === 'LayoutId').value = entry.meta.LayoutId;
            entry.prices = [{ currencyType: 'MtxCurrency', currencySubType: '', regularPrice: determinePriceForTemplate(templateId, 'TodayPopular'), finalPrice: determinePriceForTemplate(templateId, 'TodayPopular'), saleExpiration: isoDate, basePrice: determinePriceForTemplate(templateId, 'TodayPopular') }];
            sectionItemCounts.TodayPopular = (sectionItemCounts.TodayPopular || 0) + 1;
            return entry;
        };

        todayPopularItems.forEach(({ templateId }) => {
            if (!templateId || typeof templateId !== 'string') return;
            const entry = makeCatalogEntry(templateId);
            pushIntoStorefront('BRDailyStorefront', entry);
        });
    };

    pushPopularEntries();

    for (const [value, catalogValue] of Object.entries(CatalogConfig)) {
            if (!Array.isArray(catalogValue?.itemGrants)) continue;
            if (catalogValue.itemGrants.length == 0) continue;
            
            const CatalogEntry = {
                "devName": "",
                "offerId": "",
                "fulfillmentIds": [],
                "dailyLimit": -1,
                "weeklyLimit": -1,
                "monthlyLimit": -1,
                "categories": [],
                "prices": [
                    {
                    "currencyType": "MtxCurrency",
                    "currencySubType": "",
                    "regularPrice": 0,
                    "finalPrice": 0,
                    "saleExpiration": "9999-12-02T01:12:00Z",
                    "basePrice": 0
                    }
                ],
                "meta": {
                    "SectionId": "Featured",
                    "TileSize": "Small",
                    "LayoutId": "Featured.0"
                },
                "matchFilter": "",
                "filterWeight": 0,
                "appStoreId": [],
                "requirements": [],
                "offerType": "StaticPrice",
                "giftInfo": {
                    "bIsEnabled": true,
                    "forcedGiftBoxTemplateId": "",
                    "purchaseRequirements": [],
                    "giftRecordIds": []
                },
                "refundable": false,
                "metaInfo": [
                    { "key": "SectionId", "value": "Featured" },
                    { "key": "TileSize", "value": "Small" },
                    { "key": "LayoutId", "value": "Featured.0" }
                ],
                "displayAssetPath": "",
                "itemGrants": [],
                "sortPriority": 0,
                "catalogGroupPriority": 0
            };

            if (catalogValue.SectionId) {
                CatalogEntry.meta.SectionId = catalogValue.SectionId;
                const sectionMeta = CatalogEntry.metaInfo.find(m => m.key === "SectionId");
                if (sectionMeta) sectionMeta.value = catalogValue.SectionId;
            }
            const isBattlePassEntry = (value || '').toLowerCase().includes('battlepass') || String(catalogValue.SectionId || '').toLowerCase() === 'battlepass';
            const configTileSize = typeof catalogValue.TileSize === 'string' && catalogValue.TileSize
                ? catalogValue.TileSize
                : 'Small';
            const forcedTileSize = isBattlePassEntry
                ? (configTileSize === 'Small' ? 'DoubleWide' : configTileSize || 'DoubleWide')
                : (configTileSize || 'Small');
            CatalogEntry.meta.TileSize = forcedTileSize;
            const tileMeta = CatalogEntry.metaInfo.find(m => m.key === "TileSize");
            if (tileMeta) tileMeta.value = forcedTileSize;
            else CatalogEntry.metaInfo.push({ "key": "TileSize", "value": forcedTileSize });
            if (typeof CatalogConfig[value].refundable === "boolean") {
                CatalogEntry.refundable = CatalogConfig[value].refundable;
            }

            // Determine storefront name per catalog key, supporting multiple sections
            const parseShopSectionKey = (key, sectionId) => {
                const normalizedName = (key || '').toLowerCase();
                const normalizedSectionId = (sectionId || '').toLowerCase();
                const defaultResult = { sectionPrefix: 'daily', sectionKey: 'section_1' };
                const match = normalizedName.match(/^(daily|featured|weekly|season|standalone)_(section_?(\d+))/);
                if (!match) {
                    const sectionMatch = normalizedSectionId.match(/section_?(\d+)/);
                    if (!sectionMatch) return defaultResult;
                    return {
                        sectionPrefix: normalizedSectionId.includes('featured') ? 'featured' : 'daily',
                        sectionKey: `section_${sectionMatch[1]}`
                    };
                }
                return { sectionPrefix: match[1], sectionKey: `section_${match[2].replace(/^section_?/, '')}` };
            };

            const sectionDefinitions = (Array.isArray(config.bShopSections) && config.bShopSections.length > 0)
                ? config.bShopSections.map((section, index) => ({
                    sectionName: section.sectionName || `Section ${index + 1}`,
                    sectionKey: (section.sectionId || section.sectionName || `section${index + 1}`).toString().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                    dailyItemsAmount: section.dailyItemsAmount,
                    featuredItemsAmount: section.featuredItemsAmount
                }))
                : [{ sectionName: 'Section 1', sectionKey: 'section_1' }];

            const { sectionPrefix, sectionKey } = parseShopSectionKey(value, catalogValue.SectionId);
            const sectionMeta = sectionDefinitions.find(section => section.sectionKey === sectionKey) || sectionDefinitions[0];
            const useSectionSuffix = Array.isArray(config.bShopSections) && config.bShopSections.length > 0 && sectionDefinitions.length > 0;
            const sectionLimit = sectionPrefix === 'featured'
                ? Number(sectionMeta?.featuredItemsAmount ?? config.bFeaturedItemsAmount ?? 0)
                : sectionPrefix === 'daily'
                    ? Number(sectionMeta?.dailyItemsAmount ?? config.bDailyItemsAmount ?? 0)
                    : 0;
            const sectionCountKey = `${sectionKey}:${sectionPrefix}`;
            if (sectionLimit > 0 && (sectionItemCounts[sectionCountKey] || 0) >= sectionLimit) continue;

            const baseStorefrontName = (sectionPrefix === 'featured') ? 'BRWeeklyStorefront'
                : (sectionPrefix === 'weekly') ? 'BRWeeklyStorefront'
                : (sectionPrefix === 'season') ? 'BRSeasonStorefront'
                : (sectionPrefix === 'standalone') ? 'BRStandaloneStorefront'
                : 'BRDailyStorefront';

            // SectionId/LayoutId already tell the client which shop section owns the
            // offer. Publishing the same offer in a suffixed storefront as well as
            // the base storefront makes clients that aggregate storefronts render it
            // twice, so generated offers must have one canonical storefront.
            const storefrontName = baseStorefrontName;

            getStorefront(storefrontName);

            if (value.toLowerCase().startsWith("daily")) {
                CatalogEntry.sortPriority = -1;
            }

            if (typeof CatalogConfig[value].bIsGiftable === "boolean") {
                CatalogEntry.giftInfo.bIsEnabled = CatalogConfig[value].bIsGiftable;
            }

            for (let itemGrant of CatalogConfig[value].itemGrants) {
                if (typeof itemGrant != "string") continue;
                if (itemGrant.length == 0) continue;

                CatalogEntry.requirements.push({ "requirementType": "DenyOnItemOwnership", "requiredId": itemGrant, "minQuantity": 1 });
                CatalogEntry.itemGrants.push({ "templateId": itemGrant, "quantity": 1 });
            }

            if (Array.isArray(catalogValue.additionalGrants)) {
                for (let additionalGrant of catalogValue.additionalGrants) {
                    if (typeof additionalGrant !== "string" || additionalGrant.length === 0) continue;
                    CatalogEntry.itemGrants.push({ "templateId": additionalGrant, "quantity": 1 });
                }
            }

            const offerIdentity = crypto.createHash('sha1')
                .update(`shop:${value}:${CatalogEntry.itemGrants.map(grant => grant.templateId).join('|')}`)
                .digest('hex');
            CatalogEntry.devName = offerIdentity;
            CatalogEntry.offerId = offerIdentity;

            // Determine price: if config price is set and > 0, use it; otherwise pick a random
            // price based on item type and round to nearest 50.
            const determineRandomPrice = (cfg) => {
                const configured = Number(cfg.price) || 0;
                if (configured > 0) return Math.round(configured / 50) * 50;

                const sectionId = String(catalogValue.SectionId || '').trim();
                const keyName = String(value || '').trim().toLowerCase();
                const normalizeSectionName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
                const normalizedSectionId = normalizeSectionName(sectionId);
                const sectionIndex = Array.isArray(config.bShopSections)
                    ? config.bShopSections.findIndex(section => {
                        const candidate = normalizeSectionName(section.sectionName || section.sectionId || '');
                        return !!candidate && (normalizedSectionId.includes(candidate) || candidate.includes(normalizedSectionId));
                    })
                    : -1;
                const isFreeByKey = keyName.includes('section7') || keyName.includes('section_7');
                const freePrice = getSectionFreePrice({ sectionName: sectionId, sectionId: sectionId }, sectionIndex);
                if (freePrice === 0 || isFreeByKey) return 0;

                const firstGrant = Array.isArray(cfg.itemGrants) && cfg.itemGrants.length ? cfg.itemGrants[0] : '';
                const templateId = (typeof firstGrant === 'string') ? firstGrant : (firstGrant && firstGrant.templateId) || '';
                const seed = `${templateId}|${sectionId}|${value}`;
                const suggestedPrice = determinePriceForTemplate(templateId, sectionId);

                if (suggestedPrice === 0) return 0;
                const min = Math.max(50, Math.round((suggestedPrice * 0.75) / 50) * 50);
                const max = Math.round((suggestedPrice * 1.25) / 50) * 50;
                return getDeterministicPrice(seed, min, max, 50);
            };

            const priceValue = determineRandomPrice(CatalogConfig[value]);
            CatalogEntry.prices = [{
                currencyType: 'MtxCurrency',
                currencySubType: '',
                regularPrice: priceValue,
                finalPrice: priceValue,
                saleExpiration: isoDate,
                basePrice: priceValue
            }];

            const sectionId = CatalogEntry.meta.SectionId;
            if (!sectionItemCounts[sectionId]) {
                sectionItemCounts[sectionId] = 0;
            }
            const layoutId = `${sectionId}.${sectionItemCounts[sectionId]}`;
            CatalogEntry.meta.LayoutId = layoutId;
            const layoutMeta = CatalogEntry.metaInfo.find(m => m.key === "LayoutId");
            if (layoutMeta) {
                layoutMeta.value = layoutId;
            } else {
                CatalogEntry.metaInfo.push({ "key": "LayoutId", "value": layoutId });
            }
            sectionItemCounts[sectionId]++;
            if (sectionLimit > 0) {
                sectionItemCounts[sectionCountKey] = (sectionItemCounts[sectionCountKey] || 0) + 1;
            }

            const getEntryIdentity = (entry) => {
                    if (entry?.__shopIdentity) return `manual:${entry.__shopIdentity}`;
                    const grants = Array.isArray(entry?.itemGrants)
                        ? entry.itemGrants.map(grant => (typeof grant === 'string' ? grant : grant?.templateId || '')).filter(Boolean)
                        : [];
                    if (grants.length > 0) return `grants:${grants.join('|')}`;
                    if (entry?.offerId) return `offer:${entry.offerId}`;
                    if (entry?.devName) return `dev:${entry.devName}`;
                    return `payload:${JSON.stringify(entry)}`;
                };

                // Push entry into the primary storefront and also into legacy/per-section storefronts
                // Primary target we computed earlier (e.g., BRWeeklyStorefront or BRDailyStorefront)
                pushIntoStorefront(storefrontName, CatalogEntry);

            }

                // Deduplicate storefronts and their entries by name and item grants.
    try {
        const normalizedStorefronts = [];
        const seenStorefrontNames = new Map();

        for (const sf of catalog.storefronts || []) {
            const existing = seenStorefrontNames.get(sf.name);
            if (existing) {
                existing.catalogEntries.push(...sf.catalogEntries);
            } else {
                const copy = { name: sf.name, catalogEntries: Array.isArray(sf.catalogEntries) ? [...sf.catalogEntries] : [] };
                normalizedStorefronts.push(copy);
                seenStorefrontNames.set(sf.name, copy);
            }
        }

        catalog.storefronts = normalizedStorefronts;

        const targetBattlePassSeason = Number(config.bBattlePassSeason) > 10 ? Number(config.bBattlePassSeason) - 10 : Number(config.bBattlePassSeason);
        const targetBattlePassSeasonToken = String(targetBattlePassSeason);

        for (const storefront of catalog.storefronts) {
            const filteredEntries = [];
            for (const entry of Array.isArray(storefront?.catalogEntries) ? storefront.catalogEntries : []) {
                const rawTitle = typeof entry?.title === 'string'
                    ? entry.title
                    : (entry?.title?.en || entry?.title?.ja || '');
                const titleText = String(rawTitle || '').toLowerCase();
                const devName = String(entry?.devName || '').toLowerCase();
                const sectionId = String(entry?.meta?.SectionId || Array.isArray(entry?.metaInfo)
                    ? (entry.metaInfo.find(m => m.key === 'SectionId')?.value || '')
                    : '').toLowerCase();
                const isBattlePassEntry = titleText.includes('battle pass') || devName.includes('battlepass') || sectionId === 'battlepass';

                if (!isBattlePassEntry) {
                    filteredEntries.push(entry);
                    continue;
                }

                const isTargetSeasonEntry = devName.includes(`.season${targetBattlePassSeasonToken}.battlepass.`)
                    || devName.includes(`season${targetBattlePassSeasonToken}`)
                    || (entry?.__shopIdentity === 'manual-battlepass-daily');

                if (isTargetSeasonEntry) {
                    filteredEntries.push(entry);
                }
            }
            storefront.catalogEntries = filteredEntries;
        }

        for (const sf of catalog.storefronts) {
            const out = [];
            for (const entry of sf.catalogEntries || []) {
                if (entry?.__shopIdentity === 'manual-battlepass-daily') {
                    out.push(entry);
                    continue;
                }

                const grants = Array.isArray(entry.itemGrants)
                    ? entry.itemGrants.map(g => (typeof g === 'string' ? g : g?.templateId || '')).filter(Boolean)
                    : [];
                const id = grants.length > 0
                    ? `grants:${grants.join('|')}`
                    : (entry.offerId ? `offer:${entry.offerId}` : (entry.devName ? `dev:${entry.devName}` : `payload:${JSON.stringify(entry.meta||{})}`));
                if (out.some(existing => {
                    const existingGrants = Array.isArray(existing.itemGrants)
                        ? existing.itemGrants.map(g => (typeof g === 'string' ? g : g?.templateId || '')).filter(Boolean)
                        : [];
                    const existingId = existingGrants.length > 0
                        ? `grants:${existingGrants.join('|')}`
                        : (existing.offerId ? `offer:${existing.offerId}` : (existing.devName ? `dev:${existing.devName}` : `payload:${JSON.stringify(existing.meta||{})}`));
                    return existingId === id;
                })) continue;
                out.push(entry);
            }
            sf.catalogEntries = out;
        }
    } catch (e) {}

    try {
        const shouldAddBattlePass = config.bEnableBattlepass === true && config.bBattlePassItems === true;
        if (shouldAddBattlePass) {
            const sectionDefinitions = Array.isArray(config.bShopSections) && config.bShopSections.length > 0
                ? config.bShopSections.map((section, index) => ({
                    sectionName: section.sectionName || `Section ${index + 1}`,
                    sectionKey: (section.sectionId || section.sectionName || `section${index + 1}`).toString().toLowerCase().replace(/[^a-z0-9]+/g, '_')
                }))
                : [];
            const battlePassSection = sectionDefinitions.find(section =>
                (section.sectionName || '').toLowerCase().includes('battlepass') || (section.sectionKey || '').toLowerCase().includes('battlepass')
            );

            const targetStorefrontNames = ['BRDailyStorefront'];
            if (battlePassSection && battlePassSection.sectionName) {
                const suffix = battlePassSection.sectionName.replace(/[^a-z0-9]+/gi, '_');
                targetStorefrontNames.push(`BRDailyStorefront_${suffix}`);
            }

            const storefronts = targetStorefrontNames.map(name => getStorefront(name));
            const hasBattlePass = storefronts.some(storefront => (storefront.catalogEntries || []).some(entry => {
                const sectionValue = entry?.meta?.SectionId || '';
                const metaSectionValue = Array.isArray(entry?.metaInfo)
                    ? entry.metaInfo.find(m => m.key === 'SectionId')?.value || ''
                    : '';
                return sectionValue === 'BattlePass' || metaSectionValue === 'BattlePass' || entry?.title === 'Battle Pass';
            }));

            if (!hasBattlePass) {
                const targetSeason = Number(config.bBattlePassSeason) > 10 ? Number(config.bBattlePassSeason) - 10 : Number(config.bBattlePassSeason);
                const seasonCandidates = catalog.storefronts.filter(storefront => {
                    const name = String(storefront?.name || '').toLowerCase();
                    const seasonMatch = name.match(/brseason(\d+)/i);
                    return seasonMatch && Number(seasonMatch[1]) === targetSeason;
                });

                const battlePassEntry = seasonCandidates
                    .flatMap(storefront => Array.isArray(storefront?.catalogEntries) ? storefront.catalogEntries : [])
                    .find(entry => {
                        const sectionValue = entry?.meta?.SectionId || '';
                        const metaSectionValue = Array.isArray(entry?.metaInfo)
                            ? entry.metaInfo.find(m => m.key === 'SectionId')?.value || ''
                            : '';
                        return sectionValue === 'BattlePass' || metaSectionValue === 'BattlePass' || entry?.title === 'Battle Pass';
                    });

                if (battlePassEntry) {
                    const appendedEntry = JSON.parse(JSON.stringify(battlePassEntry));
                    appendedEntry.__shopIdentity = 'manual-battlepass-daily';
                    appendedEntry.meta = appendedEntry.meta || {};
                    appendedEntry.meta.SectionId = 'BattlePass';
                    appendedEntry.meta.TileSize = 'DoubleWide';
                    appendedEntry.meta.LayoutId = 'BattlePass.0';
                    appendedEntry.metaInfo = Array.isArray(appendedEntry.metaInfo) ? appendedEntry.metaInfo : [];

                    const sectionMeta = appendedEntry.metaInfo.find(m => m.key === 'SectionId');
                    if (sectionMeta) sectionMeta.value = 'BattlePass';
                    else appendedEntry.metaInfo.push({ key: 'SectionId', value: 'BattlePass' });

                    const tileMeta = appendedEntry.metaInfo.find(m => m.key === 'TileSize');
                    if (tileMeta) tileMeta.value = 'DoubleWide';
                    else appendedEntry.metaInfo.push({ key: 'TileSize', value: 'DoubleWide' });

                    const layoutMeta = appendedEntry.metaInfo.find(m => m.key === 'LayoutId');
                    if (layoutMeta) layoutMeta.value = 'BattlePass.0';
                    else appendedEntry.metaInfo.push({ key: 'LayoutId', value: 'BattlePass.0' });

                    storefronts.forEach(storefront => {
                        storefront.catalogEntries.push(appendedEntry);
                    });
                }
            }
        }
    } catch (e) {
        log.error('Failed to append battle pass offer', e);
    }

    // Fortnite aggregates the BR storefronts in one shop view. Ensure an offer
    // with the same grants is emitted only once across that combined view.
    const seenBrOffers = new Set();
    for (const storefront of catalog.storefronts || []) {
        if (!/^BR(?:Daily|Featured|Weekly|Standalone)Storefront/i.test(String(storefront?.name || ''))) continue;

        storefront.catalogEntries = (storefront.catalogEntries || []).filter(entry => {
            const grants = Array.isArray(entry?.itemGrants)
                ? entry.itemGrants
                    .map(grant => typeof grant === 'string' ? grant : grant?.templateId || '')
                    .filter(Boolean)
                    .map(grant => grant.toLowerCase())
                    .sort()
                : [];
            if (grants.length === 0) return true;

            const identity = grants.join('|');
            if (seenBrOffers.has(identity)) return false;
            seenBrOffers.add(identity);
            return true;
        });
    }

    cachedItemShop = catalog;
    cachedItemShopSignature = currentSignature;
    return catalog;
}

function getKeychain() {
    try {
        const keychain = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "responses", "keychain.json")).toString());
        return keychain;
    } catch (e) {
        console.error("Error reading keychain.json:", e);
        return [];
    }
}

function getOfferID(offerId) {
    const catalog = getItemShop();
    if (!offerId) return null;

    // Exact match first
    for (let storefront of catalog.storefronts || []) {
        let findOfferId = (storefront.catalogEntries || []).find(i => i.offerId === offerId || i.devName === offerId);
        if (findOfferId) return { name: storefront.name, offerId: findOfferId };
    }

    // Allow lookup by templateId (item grant), e.g. client sends "AthenaCharacter:CID_..."
    for (let storefront of catalog.storefronts || []) {
        for (let entry of (storefront.catalogEntries || [])) {
            const grants = Array.isArray(entry.itemGrants) ? entry.itemGrants : [];
            for (let g of grants) {
                const template = (typeof g === 'string') ? g : (g.templateId || '');
                if (!template) continue;
                if (template.toLowerCase() === String(offerId).toLowerCase()) {
                    return { name: storefront.name, offerId: entry };
                }
            }
        }
    }

    // Fallback: match by layout/meta values or partial matches
    for (let storefront of catalog.storefronts || []) {
        for (let entry of (storefront.catalogEntries || [])) {
            try {
                const metaLayout = entry.meta && entry.meta.LayoutId ? String(entry.meta.LayoutId) : '';
                if (metaLayout && metaLayout.toLowerCase() === String(offerId).toLowerCase()) return { name: storefront.name, offerId: entry };
            } catch (e) {}
        }
    }

    return null;
}

function MakeID() {
    return uuid.v4();
}

function buildVbucksNotificationPayload({ amount, reason, message, killCount }) {
    const safeAmount = Number(amount) || 0;
    const safeReason = String(reason || 'manual').trim();
    const safeKillCount = Number(killCount) || 0;
    const killText = safeKillCount > 0 ? `（キル数: ${safeKillCount}）` : '';
    const defaultMessage = safeAmount > 0
        ? `${safeAmount} V-Bucks を受け取りました。${safeReason ? `(${safeReason})` : ''}${killText}`
        : 'V-Bucks を受け取りました。';
    const safeMessage = String(message || defaultMessage).trim();

    return {
        type: 'com.epicgames.notification',
        title: 'V-Bucks Received',
        message: safeMessage,
        notificationType: 'vbucks',
        amount: safeAmount,
        reason: safeReason,
        killCount: safeKillCount
    };
}

function sendXmppMessageToAll(body) {
    if (!global.Clients) return;
    if (typeof body == "object") body = JSON.stringify(body);

    global.Clients.forEach(ClientData => {
        ClientData.client.send(XMLBuilder.create("message")
        .attribute("from", `xmpp-admin@${global.xmppDomain}`)
        .attribute("xmlns", "jabber:client")
        .attribute("to", ClientData.jid)
        .element("body", `${body}`).up().toString());
    });
}

function sendXmppMessageToId(body, toAccountId) {
    if (!global.Clients) return;
    if (typeof body == "object") body = JSON.stringify(body);

    let receiver = global.Clients.find(i => i.accountId == toAccountId);
    if (!receiver) return;

    receiver.client.send(XMLBuilder.create("message")
    .attribute("from", `xmpp-admin@${global.xmppDomain}`)
    .attribute("to", receiver.jid)
    .attribute("xmlns", "jabber:client")
    .element("body", `${body}`).up().toString());
}

function getPresenceFromUser(fromId, toId, offline) {
    if (!global.Clients) return;

    let SenderData = global.Clients.find(i => i.accountId == fromId);
    let ClientData = global.Clients.find(i => i.accountId == toId);

    if (!SenderData || !ClientData) return;

    let xml = XMLBuilder.create("presence")
    .attribute("to", ClientData.jid)
    .attribute("xmlns", "jabber:client")
    .attribute("from", SenderData.jid)
    .attribute("type", offline ? "unavailable" : "available")

    if (SenderData.lastPresenceUpdate.away) xml = xml.element("show", "away").up().element("status", SenderData.lastPresenceUpdate.status).up();
    else xml = xml.element("status", SenderData.lastPresenceUpdate.status).up();

    ClientData.client.send(xml.toString());
}

async function registerUser(discordId, username, email, plainPassword, isServer = false) {
    email = email.toLowerCase();

    if (!username || !email || !plainPassword) {
        return { message: "Username, email, or password is required.", status: 400 };
    }

    if (username.length > 12 && !isServer) {
        username = username.substring(0, 12);
    }

    if (!isServer && discordId && await User.findOne({ discordId })) {
        return { message: "You already created an account!", status: 400 };
    }

    if (!isServer && (!discordId || !/^\d{17,20}$/.test(discordId))) {
        return { message: "Error, Retry.", status: 400 };
    }

    if (/[@]projectreboot\\.dev$/i.test(email)) {
        return { message: "You can't use this email.", status: 400 };
    }

    if (await User.findOne({ email })) {
        return { message: "Email is already in use.", status: 400 };
    }

    const accountId = MakeID().replace(/-/ig, "");
    const matchmakingId = MakeID().replace(/-/ig, "");
    username = createSafeUsername(username, accountId);

    const emailFilter = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
    if (!emailFilter.test(email)) {
        return { message: "You did not provide a valid email address.", status: 400 };
    }
    if (username.length >= 25) {
        return { message: "Your username must be less than 25 characters long.", status: 400 };
    }
    if (username.length < 3) {
        return { message: "Your username must be at least 3 characters long.", status: 400 };
    }
    if (plainPassword.length >= 128) {
        return { message: "Your password must be less than 128 characters long.", status: 400 };
    }
    if (plainPassword.length < 4) {
        return { message: "Your password must be at least 4 characters long.", status: 400 };
    }

    // Reject only control characters and null bytes; allow Japanese, emoji, and other languages
    if (/[\n\r\t\x00-\x1F\x7F-\x9F]/.test(username)) {
        return { message: "Your username contains invalid control characters.", status: 400 };
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    try {
        await User.create({
            created: new Date().toISOString(),
            discordId: isServer ? null : (discordId || null),
            accountId,
            username,
            username_lower: username.toLowerCase(),
            email,
            password: hashedPassword,
            matchmakingId,
            isServer: isServer
        }).then(async (i) => {
            await Profile.create({ created: i.created, accountId: i.accountId, profiles: profileManager.createProfiles(i.accountId) });
            await Friends.create({ created: i.created, accountId: i.accountId });
        });
    } catch (err) {
        if (err.code == 11000) {
            return { message: `Username or email is already in use.`, status: 400 };
        }

        return { message: "An unknown error has occurred, please try again later.", status: 400 };
    }

    return { message: `Successfully created an account with the username **${username}**`, status: 200 };
}

function DecodeBase64(str) {
    return Buffer.from(str, 'base64').toString();
}

function UpdateTokens() {
    fs.writeFileSync("./tokenManager/tokens.json", JSON.stringify({
        accessTokens: global.accessTokens,
        refreshTokens: global.refreshTokens,
        clientTokens: global.clientTokens
    }, null, 2));
}


async function getDivisionPoints(accountIdOrUser, statType) {
    const fallbackPoints = {
        "TEAM_ELIMS_STAT_INDEX": 1,
        "PLACEMENT_STAT_INDEX": 1,
        "MATCH_PLAYED_STAT": 1
    };

    const accountId = typeof accountIdOrUser === 'object'
        ? (accountIdOrUser.accountId || accountIdOrUser.account_id || "")
        : (accountIdOrUser || "");

    try {
        const eventListPath = path.join(__dirname, "./../responses/eventlistactive.json");
        const eventList = JSON.parse(fs.readFileSync(eventListPath, 'utf-8'));
        const playerData = accountId ? await Arena.findOne({ accountId }) : null;
        const playerDivision = Number(playerData?.division ?? 0);

        const event = (eventList.events || []).find(evt => Array.isArray(evt.eventWindows) && evt.eventWindows.length > 0) || eventList.events?.[0];
        const eventWindows = event?.eventWindows || [];
        const eventWindow = eventWindows.find(window => Number(window?.metadata?.divisionRank) === playerDivision)
            || eventWindows.find(window => Number(window?.metadata?.divisionRank) === 0)
            || eventWindows[0];

        const templateId = eventWindow?.eventTemplateId;
        const template = (eventList.templates || []).find(t => t.eventTemplateId === templateId) || (eventList.templates || [])[0];
        const scoringRules = Array.isArray(template?.scoringRules) ? template.scoringRules : [];
        const scoringRule = scoringRules.find(rule => rule?.trackedStat === statType) || scoringRules[0];
        const tier = Array.isArray(scoringRule?.rewardTiers) && scoringRule.rewardTiers.length > 0 ? scoringRule.rewardTiers[0] : null;

        return Number(tier?.pointsEarned ?? fallbackPoints[statType] ?? 0);
    } catch (error) {
        console.error("Error getting division points:", error?.message || error);
        return Number(fallbackPoints[statType] ?? 0);
    }
}

async function addEliminationHypePoints(user) {
    const points = await getDivisionPoints(user, "TEAM_ELIMS_STAT_INDEX");
    return await updateHypePoints(user, points);
}

function calculateEliminationVbucks(killCount) {
    const kills = Number(killCount) || 0;
    return Math.max(0, kills) * 50;
}

function calculateVbucksReward(type, killCount) {
    const normalizedType = String(type || '').toLowerCase();
    if (normalizedType === 'victory' || normalizedType === 'victoryroyale' || normalizedType === 'win') {
        return 150;
    }

    if (normalizedType === 'elimination' || normalizedType === 'kill' || normalizedType === 'kills') {
        return calculateEliminationVbucks(killCount);
    }

    return 0;
}

async function addEliminationVbucks(user, killCount) {
    const amount = calculateEliminationVbucks(killCount);

    if (!user?.accountId || amount <= 0) {
        return { success: true, amount: 0 };
    }

    try {
        const filter = { accountId: user.accountId };
        const profile = await Profile.findOne(filter);
        if (!profile) {
            return { success: false, message: "Profile not found." };
        }

        const commonCore = profile.profiles?.common_core || {};
        const profile0 = profile.profiles?.profile0 || {};

        await Profile.updateOne(filter, {
            $inc: {
                "profiles.common_core.items.Currency:MtxPurchased.quantity": amount,
                "profiles.profile0.items.Currency:MtxPurchased.quantity": amount
            },
            $set: {
                "profiles.common_core.rvn": (commonCore.rvn || 0) + 1,
                "profiles.common_core.commandRevision": (commonCore.commandRevision || 0) + 1,
                "profiles.profile0.rvn": (profile0.rvn || 0) + 1,
                "profiles.profile0.commandRevision": (profile0.commandRevision || 0) + 1
            }
        });

        return { success: true, amount };
    } catch (err) {
        log.error(`addEliminationVbucks error: ${err.message}`);
        return { success: false, message: "An error occurred while granting V-Bucks." };
    }
}

async function addVictoryHypePoints(user) {
    return await updateHypePoints(user, 60);
}

async function deductBusFareHypePoints(user) {
    return await updateHypePoints(user, 0);
}

async function calculateTotalHypePoints(user) {
    const accountId = user.account_id || user.accountId;

    const playerData = await Arena.findOne({ accountId });
    const currentHype = playerData?.hype ?? 0;

    return currentHype;
}

async function deductHypePoints(user) {
    const points = await getDivisionPoints(user.account_id, "TEAM_ELIMS_STAT_INDEX");
    return await deductPoints(user, points);
}

async function updateHypePoints(user, points) {
    const accountId = user.account_id || user.accountId;

    let playerData = await Arena.findOne({ accountId });
    let currentHype = playerData ? playerData.hype : 0;
    let currentDivision = playerData ? playerData.division : 0;

    currentHype += points;

    const nextDivision = getNextDivision(currentHype, currentDivision);
    currentDivision = nextDivision;

    await Arena.updateOne(
        { accountId },
        { 
            $set: {
                accountId: accountId,
                hype: currentHype,
                division: currentDivision
            }
        },
        { upsert: true }
    );

    return {
        success: true,
        data: `Points mis à jour à ${currentHype}, Division actuelle : ${currentDivision}`,
    };
}

async function deductPoints(user, points) {
    const accountId = user.account_id || user.accountId;

    let playerData = await Arena.findOne({ accountId });
    let currentHype = playerData ? playerData.hype : 0;
    let currentDivision = playerData ? playerData.division : 0;

    currentHype -= points;

    const nextDivision = getNextDivision(currentHype, currentDivision);
    currentDivision = nextDivision;

    await Arena.updateOne(
        { accountId },
        { 
            $set: {
                accountId: accountId,
                hype: currentHype,
                division: currentDivision
            }
        },
        { upsert: true }
    );

    return {
        success: true,
        data: `Points mis à jour à ${currentHype}, Division actuelle : ${currentDivision}`,
    };
}

function getNextDivision(hypePoints, currentDivision) {
    const thresholds = [400, 800, 1200, 2000, 3000, 5000, 7500, 10000, 15000];
    for (let i = 0; i < thresholds.length; i++) {
        if (hypePoints < thresholds[i]) return i;
    }
    return currentDivision;
}



function getAccountIdData(UserID) {
    const account_id = UserID ? UserID.split("|")[1] : "";

    return account_id;
}

const BOOK_XP_INCREMENTS = {
    5: 5, 10: 10, 15: 5, 20: 10,
    25: 5, 30: 10, 35: 5, 40: 10,
    45: 5, 50: 10, 55: 5, 60: 10,
    65: 5, 70: 10, 75: 5, 80: 10,
    85: 5, 90: 10, 95: 5, 100: 10
};

const MAX_LEVEL = 3000;
const MIN_XP_GRANT = 1000;

// xp.json contains 3000 levels (about 275KB), so cache it rather than reading it each time XP is granted.
let cachedXpCurve = null;
function getXpCurve() {
    if (!cachedXpCurve) {
        const levelsFilePath = path.join(__dirname, "../responses/Athena/XP/xp.json");
        cachedXpCurve = JSON.parse(fs.readFileSync(levelsFilePath, "utf8"));
    }
    return cachedXpCurve;
}

// Walks the XP curve (responses/Athena/XP/xp.json) from the current level, consuming
// xpEarned across as many level-ups as it covers in one shot (levels are capped at MAX_LEVEL).
function updateLvlAndXp(currentLevel, currentXp, xpEarned) {
    const levelsData = getXpCurve();

    let totalXp = (currentXp || 0) + (xpEarned || 0);
    let newLevel = currentLevel || 1;
    let levelsEarned = 0;

    for (let i = newLevel - 1; i < levelsData.length; i++) {
        const xpNeeded = levelsData[i]?.xpToNextLvl;
        if (!xpNeeded || newLevel >= MAX_LEVEL) break;

        if (totalXp >= xpNeeded) {
            totalXp -= xpNeeded;
            newLevel++;
            levelsEarned++;
        } else {
            break;
        }
    }

    return {
        level: newLevel,
        xp: totalXp,
        levelsEarned
    };
}

// Grants seasonal (account) XP to the athena profile, leveling the player up and
// feeding book_xp so the Battle Pass tier can progress via updateUserLevel().
async function SeasonXp(user, xp) {
    try {
        // Ensure XP grants are always at least 1000.
        if (xp > 0 && xp < MIN_XP_GRANT) xp = MIN_XP_GRANT;

        const findProfile = await Profile.findOne({ accountId: user.accountId });
        if (!findProfile) return { success: false, message: "Profile not found." };

        const athena = findProfile.profiles["athena"];
        if (!athena) return { success: false, message: "Athena profile not found." };

        const attributes = athena.stats.attributes;
        const currentLevel = attributes.level || 1;
        const currentXp = attributes.xp || 0;

        const xpUpdate = updateLvlAndXp(currentLevel, currentXp, xp);
        attributes.level = xpUpdate.level;
        attributes.xp = xpUpdate.xp;

        if (xpUpdate.levelsEarned > 0) {
            attributes.book_xp = parseInt(attributes.book_xp, 10) || 0;

            for (let i = 1; i <= xpUpdate.levelsEarned; i++) {
                const newLevel = currentLevel + i;
                attributes.book_xp += BOOK_XP_INCREMENTS[newLevel] || 2;
            }
        }

        athena.rvn = (athena.rvn || 0) + 1;
        athena.commandRevision = (athena.commandRevision || 0) + 1;
        athena.updated = new Date().toISOString();

        await findProfile.updateOne({ $set: { "profiles.athena": athena } });

        return { success: true, level: attributes.level, xp: attributes.xp, levelsEarned: xpUpdate.levelsEarned };
    } catch (err) {
        log.error(`SeasonXp error: ${err.message}`);
        return { success: false, message: "An error occurred while granting season XP." };
    }
}

// Converts accumulated book_xp into Battle Pass tiers (book_level) and grants the
// free/paid rewards for every tier crossed, using the season file for bBattlePassSeason.
async function updateUserLevel(user) {
    try {
        const findProfiles = await Profile.findOne({ accountId: user.accountId });
        if (!findProfiles) return { success: false, message: "Profile not found." };

        const athena = findProfiles.profiles["athena"];
        const commonCore = findProfiles.profiles["common_core"];
        const profile0 = findProfiles.profiles["profile0"];

        if (!athena) return { success: false, message: "Athena profile not found." };

        const attributes = athena.stats.attributes;
        attributes.book_xp = parseInt(attributes.book_xp, 10) || 0;

        if (attributes.book_xp < 10) {
            return { success: true, message: "Not enough book XP for a Battle Pass tier yet." };
        }

        const initialLevel = attributes.book_level || 1;
        const levelsToAward = Math.floor(attributes.book_xp / 10);
        const finalLevel = Math.min(initialLevel + levelsToAward, 100);
        const actualLevelsAwarded = finalLevel - initialLevel;

        if (actualLevelsAwarded <= 0) {
            return { success: true, message: "Battle Pass is already at max tier." };
        }

        attributes.book_xp -= actualLevelsAwarded * 10;
        attributes.book_level = finalLevel;

        const season = `Season${config.bBattlePassSeason}`;
        const bpFilePath = path.join(__dirname, "../responses/Athena/BattlePass/", `${season}.json`);

        if (fs.existsSync(bpFilePath)) {
            const bpData = JSON.parse(fs.readFileSync(bpFilePath).toString());

            const normalizeAthenaTemplateId = (id) => {
                if (!id || typeof id !== "string") return id;
                if (id.includes(":")) return id;

                const lower = id.toLowerCase();
                if (lower.startsWith("cid_")) return `AthenaCharacter:${id}`;
                if (lower.startsWith("bid_")) return `AthenaBackpack:${id}`;
                if (lower.startsWith("pickaxe_id_")) return `AthenaPickaxe:${id}`;
                if (lower.startsWith("glider_id_")) return `AthenaGlider:${id}`;
                if (lower.startsWith("trails_id_")) return `AthenaSkyDiveContrail:${id}`;
                if (lower.startsWith("wrap_")) return `AthenaItemWrap:${id}`;
                if (lower.startsWith("musicpack_")) return `AthenaMusicPack:${id}`;
                if (lower.startsWith("lsid_")) return `AthenaLoadingScreen:${id}`;
                if (lower.startsWith("eid_")) return `AthenaDance:${id}`;
                if (lower.startsWith("spid_")) return `AthenaDance:${id}`;
                if (lower.startsWith("emoji_")) return `AthenaDance:${id}`;
                if (lower.startsWith("vtid_")) return `CosmeticVariantToken:${id}`;

                return id;
            };

            const incrementCurrency = (amount) => {
                if (!amount || typeof amount !== "number") return;

                const applyCurrency = (profile) => {
                    if (!profile || !profile.items) return;
                    const currentPlatform = profile.stats?.attributes?.current_mtx_platform || "";
                    for (const key in profile.items) {
                        const item = profile.items[key];
                        if (!item?.templateId || !item.templateId.toLowerCase().startsWith("currency:mtx")) continue;
                        const platform = (item.attributes?.platform || "").toLowerCase();
                        if (platform && currentPlatform) {
                            if (platform !== currentPlatform.toLowerCase() && platform !== "shared") continue;
                        }
                        if (typeof item.quantity === "number") {
                            item.quantity += amount;
                        } else if (item.attributes && typeof item.attributes.quantity === "number") {
                            item.attributes.quantity += amount;
                        } else {
                            item.quantity = amount;
                        }
                        break;
                    }
                };

                applyCurrency(commonCore);
                applyCurrency(profile0);
            };

            const addHomebaseBanner = (templateId) => {
                if (!commonCore || !commonCore.items) return;
                const lower = templateId.toLowerCase();
                for (const key in commonCore.items) {
                    if (commonCore.items[key].templateId.toLowerCase() === lower) {
                        commonCore.items[key].attributes.item_seen = false;
                        return;
                    }
                }

                const itemId = MakeID();
                commonCore.items[itemId] = {
                    templateId,
                    attributes: { item_seen: false },
                    quantity: 1
                };
            };

            const addAthenaItem = (templateId, quantity) => {
                if (!athena || !athena.items) return;
                const resolvedId = normalizeAthenaTemplateId(templateId);
                const lower = resolvedId.toLowerCase();

                for (const key in athena.items) {
                    if (athena.items[key].templateId.toLowerCase() === lower) {
                        athena.items[key].attributes.item_seen = false;
                        return;
                    }
                }

                const itemId = MakeID();
                athena.items[itemId] = {
                    templateId: resolvedId,
                    attributes: {
                        max_level_bonus: 0,
                        level: 1,
                        item_seen: false,
                        xp: 0,
                        variants: [],
                        favorite: false
                    },
                    quantity: quantity
                };
            };

            const grantRewardMap = (rewardMap) => {
                if (!rewardMap || Object.keys(rewardMap).length === 0) return;

                Object.entries(rewardMap).forEach(([templateId, quantity]) => {
                    const lowerId = templateId.toLowerCase();

                    if (lowerId.includes("athenaseasonxpboost")) {
                        attributes.season_match_boost = (attributes.season_match_boost || 0) + quantity;
                    } else if (lowerId.includes("athenaseasonfriendxpboost")) {
                        attributes.season_friend_match_boost = (attributes.season_friend_match_boost || 0) + quantity;
                    } else if (lowerId.includes("mtxgiveaway") || lowerId.startsWith("currency:mtx")) {
                        incrementCurrency(quantity);
                    } else if (lowerId.startsWith("homebasebanner")) {
                        addHomebaseBanner(templateId);
                    } else {
                        addAthenaItem(templateId, quantity);
                    }
                });
            };

            for (let tier = initialLevel; tier < finalLevel; tier++) {
                if (bpData.freeRewards && bpData.freeRewards[tier]) {
                    grantRewardMap(bpData.freeRewards[tier]);
                }

                if (attributes.book_purchased === true && bpData.paidRewards && bpData.paidRewards[tier]) {
                    grantRewardMap(bpData.paidRewards[tier]);
                }
            }
        } else {
            log.debug(`updateUserLevel: no Battle Pass data for ${season}, awarding tier without rewards.`);
        }

        athena.rvn = (athena.rvn || 0) + 1;
        athena.commandRevision = (athena.commandRevision || 0) + 1;
        athena.updated = new Date().toISOString();

        const setPayload = { "profiles.athena": athena };
        if (commonCore) setPayload["profiles.common_core"] = commonCore;
        if (profile0) setPayload["profiles.profile0"] = profile0;

        await findProfiles.updateOne({ $set: setPayload });

        return { success: true, message: "User level updated successfully.", levelsAwarded: actualLevelsAwarded };
    } catch (err) {
        log.error(`updateUserLevel error: ${err.message}`);
        return { success: false, message: "An error occurred while updating user level." };
    }
}

async function calculateTournamentPoints(eliminations, placement) {
    try {
        const eventListPath = path.join(__dirname, "./../responses/eventlistactive.json");
        const eventList = JSON.parse(fs.readFileSync(eventListPath, 'utf-8'));

        const template = (eventList.templates || []).find(t =>
            t.persistentScoreId === 'ReloadPoints'
        );

        if (!template || !Array.isArray(template.scoringRules)) return 0;

        let totalPoints = 0;

        for (const rule of template.scoringRules) {
            const stat = rule.trackedStat;

            if (stat === 'PLACEMENT_STAT_INDEX' && typeof placement === 'number') {
                if (rule.matchRule === 'lte') {
                    const tier = (rule.rewardTiers || []).find(t => placement <= t.keyValue);
                    if (tier) totalPoints += Number(tier.pointsEarned || 0);
                } else if (rule.matchRule === 'gte') {
                    const tier = (rule.rewardTiers || []).find(t => placement >= t.keyValue);
                    if (tier) totalPoints += Number(tier.pointsEarned || 0);
                }
            }

            if (stat === 'TEAM_ELIMS_STAT_INDEX' && typeof eliminations === 'number') {
                if (rule.matchRule === 'gte') {
                    const tier = (rule.rewardTiers || [])[0];
                    if (tier) {
                        if (tier.multiplicative) {
                            totalPoints += eliminations * Number(tier.pointsEarned || 0);
                        } else {
                            // find highest tier satisfied
                            const found = (rule.rewardTiers || []).slice().reverse().find(t => eliminations >= t.keyValue) || tier;
                            totalPoints += Number(found.pointsEarned || 0);
                        }
                    }
                }
            }

            if (stat === 'MATCH_PLAYED_STAT') {
                const tier = (rule.rewardTiers || [])[0];
                if (tier) totalPoints += Number(tier.pointsEarned || 0);
            }
        }

        return totalPoints;
    } catch (err) {
        console.error("Error calculating tournament points:", err.message);
        return 0;
    }
}

async function addTournamentPoints(accountId, eliminations, placement) {
    const points = await calculateTournamentPoints(Number(eliminations) || 0, typeof placement === 'number' ? placement : (placement ? Number(placement) : undefined));

    if (!accountId) return { success: false, points: 0 };

    await Arena.updateOne(
        { accountId },
        { $inc: { reloadPoints: points }, $set: { accountId } },
        { upsert: true }
    );

    return { success: true, points };
}

function PlaylistNames(playlist) {
    switch (playlist) {
        case "2":
            return "Playlist_DefaultSolo";
        case "10":
            return "Playlist_DefaultDuo";
        case "9":
            return "Playlist_DefaultSquad";
        case "50":
            return "Playlist_50v50";
        case "11":
            return "Playlist_50v50";
        case "13":
            return "Playlist_HighExplosives_Squads";
        case "22":
            return "Playlist_5x20";
        case "36":
            return "Playlist_Blitz_Solo";
        case "37":
            return "Playlist_Blitz_Duos";
        case "19":
            return "Playlist_Blitz_Squad";
        case "33":
            return "Playlist_Carmine";
        case "32":
            return "Playlist_Fortnite";
        case "23":
            return "Playlist_HighExplosives_Solo";
        case "24":
            return "Playlist_HighExplosives_Squads";
        case "44":
            return "Playlist_Impact_Solo";
        case "45":
            return "Playlist_Impact_Duos";
        case "46":
            return "Playlist_Impact_Squads";
        case "35":
            return "Playlist_Playground";
        case "30":
            return "Playlist_SkySupply";
        case "42":
            return "Playlist_SkySupply_Duos";
        case "43":
            return "Playlist_SkySupply_Squads";
        case "41":
            return "Playlist_Snipers";
        case "39":
            return "Playlist_Snipers_Solo";
        case "40":
            return "Playlist_Snipers_Duos";
        case "26":
            return "Playlist_SolidGold_Solo";
        case "27":
            return "Playlist_SolidGold_Squads";
        case "28":
            return "Playlist_ShowdownAlt_Solo";
        case "solo":
            return "2";
        case "duo":
            return "10";
        case "squad":
            return "9";
        default:
            return playlist;
    }
}

module.exports = {
    sleep,
    isFreeShopSection,
    getShopSectionDisplayName,
    deduplicateCatalogEntries,
    GetVersionInfo,
    getContentPages,
    getItemShop,
    createSafeUsername,
    getTodayPopularItems,
    recordTodayPopularPurchase,
    getKeychain,
    getOfferID,
    getSectionDisplayName,
    MakeID,
    sendXmppMessageToAll,
    buildVbucksNotificationPayload,
    sendXmppMessageToId,
    getPresenceFromUser,
    registerUser,
    DecodeBase64,
    UpdateTokens,
    getAccountIdData,
    getDivisionPoints,
    addEliminationHypePoints,
    calculateEliminationVbucks,
    calculateVbucksReward,
    addEliminationVbucks,
    addVictoryHypePoints,
    deductBusFareHypePoints,
    addTournamentPoints,
    calculateTotalHypePoints,
    deductHypePoints,
    updateHypePoints,
    deductPoints,
    PlaylistNames,
    updateLvlAndXp,
    SeasonXp,
    updateUserLevel
}
