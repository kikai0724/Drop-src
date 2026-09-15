const XMLBuilder = require("xmlbuilder");
const uuid = require("uuid");
const bcrypt = require("bcrypt");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const profileManager = require("../structs/profile.js");
const Friends = require("../model/friends.js");
const Arena = require("../model/arena.js");
const log = require("./log.js");
const config = require("../Config/config.json");

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
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "responses", "catalog.json")).toString());
    const CatalogConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "Config", "catalog_config.json").toString()));
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
            const storefrontName = 'BRDailyStorefront_Today_Popular';
            pushIntoStorefront(storefrontName, entry);
            pushIntoStorefront('BRDailyStorefront', entry);
        });
    };

    try {
        pushPopularEntries();

        for (let value in CatalogConfig) {
            if (!Array.isArray(CatalogConfig[value].itemGrants)) continue;
            if (CatalogConfig[value].itemGrants.length == 0) continue;
            
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

            if (CatalogConfig[value].SectionId) {
                CatalogEntry.meta.SectionId = CatalogConfig[value].SectionId;
                const sectionMeta = CatalogEntry.metaInfo.find(m => m.key === "SectionId");
                if (sectionMeta) sectionMeta.value = CatalogConfig[value].SectionId;
            }
            const isBattlePassEntry = (value || '').toLowerCase().includes('battlepass') || String(CatalogConfig[value].SectionId || '').toLowerCase() === 'battlepass';
            const configTileSize = typeof CatalogConfig[value].TileSize === 'string' && CatalogConfig[value].TileSize
                ? CatalogConfig[value].TileSize
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
            const parseShopSectionKey = (key) => {
                const normalizedName = (key || '').toLowerCase();
                const defaultResult = { sectionPrefix: 'daily', sectionKey: 'section_1' };
                const match = normalizedName.match(/^(daily|featured|weekly|season|standalone)_(section_?(\d+))/);
                if (!match) return defaultResult;
                return { sectionPrefix: match[1], sectionKey: `section_${match[2].replace(/^section_?/, '')}` };
            };

            const sectionDefinitions = (Array.isArray(config.bShopSections) && config.bShopSections.length > 0)
                ? config.bShopSections.map((section, index) => ({
                    sectionName: section.sectionName || `Section ${index + 1}`,
                    sectionKey: (section.sectionId || section.sectionName || `section${index + 1}`).toString().toLowerCase().replace(/[^a-z0-9]+/g, '_')
                }))
                : [{ sectionName: 'Section 1', sectionKey: 'section_1' }];

            const { sectionPrefix, sectionKey } = parseShopSectionKey(value);
            const sectionMeta = sectionDefinitions.find(section => section.sectionKey === sectionKey) || sectionDefinitions[0];
            const useSectionSuffix = Array.isArray(config.bShopSections) && config.bShopSections.length > 0 && sectionDefinitions.length > 0;

            const baseStorefrontName = (sectionPrefix === 'featured') ? 'BRFeaturedStorefront'
                : (sectionPrefix === 'weekly') ? 'BRWeeklyStorefront'
                : (sectionPrefix === 'season') ? 'BRSeasonStorefront'
                : (sectionPrefix === 'standalone') ? 'BRStandaloneStorefront'
                : 'BRDailyStorefront';

            let storefrontName = baseStorefrontName;
            if (useSectionSuffix && sectionMeta && sectionMeta.sectionName) {
                storefrontName = `${baseStorefrontName}_${sectionMeta.sectionName.replace(/[^a-z0-9]+/gi, '_')}`;
            }

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

            if (Array.isArray(CatalogConfig[value].additionalGrants)) {
                for (let additionalGrant of CatalogConfig[value].additionalGrants) {
                    if (typeof additionalGrant !== "string" || additionalGrant.length === 0) continue;
                    CatalogEntry.itemGrants.push({ "templateId": additionalGrant, "quantity": 1 });
                }
            }

            // Determine price: if config price is set and > 0, use it; otherwise pick a random
            // price based on item type and round to nearest 50.
            const determineRandomPrice = (cfg) => {
                const configured = Number(cfg.price) || 0;
                if (configured > 0) return Math.round(configured / 50) * 50;

                const sectionId = String(CatalogConfig[value].SectionId || '').trim();
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

                // Add section-specific storefronts for clients that request them, and also make sure
                // the base storefront still contains all entries when section suffix storefronts are used.
                    const baseForPrefix = (prefix) => {
                        if (prefix === 'featured') return 'BRFeaturedStorefront';
                        if (prefix === 'weekly') return 'BRWeeklyStorefront';
                        if (prefix === 'season') return 'BRSeasonStorefront';
                        if (prefix === 'standalone') return 'BRStandaloneStorefront';
                        return 'BRDailyStorefront';
                    };

                    const baseName = baseForPrefix(sectionPrefix);
                    if (useSectionSuffix && sectionMeta && sectionMeta.sectionName) {
                        try {
                            pushIntoStorefront(baseName, JSON.parse(JSON.stringify(CatalogEntry)));
                            const suffix = sectionMeta.sectionName.replace(/[^a-z0-9]+/gi, '_');
                            pushIntoStorefront(`${baseName}_${suffix}`, JSON.parse(JSON.stringify(CatalogEntry)));
                        } catch (e) {
                            log.error('Error while adding section storefront fallback', e);
                        }
                    }
            }
        }
