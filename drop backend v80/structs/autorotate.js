const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const JimpClass = Jimp.Jimp;
const pluginPrint = require('@jimp/plugin-print');
const FormData = require('form-data');
const config = require('../Config/config.json');
const log = require('./log.js');
const functions = require('./functions.js');

const webhook = config.bItemShopWebhook;
const fortniteapi = 'https://fortnite-api.com/v2/cosmetics/br';
const catalogcfg = path.join(__dirname, '..', 'Config', 'catalog_config.json');

const chapterlimit = config.bChapterlimit;
const seasonlimit = config.bSeasonlimit;

async function fetchitems() {
    try {
        const response = await axios.get(fortniteapi);
        const cosmetics = response.data.data || [];
        const excludedItems = config.bExcludedItems || [];

        return cosmetics.filter(item => {
            const { id, introduction, rarity } = item;
            const itemType = (item?.type?.value || item?.type?.displayValue || '').toString().toLowerCase();
            const chapter = introduction?.chapter ? parseInt(introduction.chapter, 10) : null;
            const season = introduction?.season ? introduction.season.toString() : null;
            const itemRarity = rarity?.displayValue?.toLowerCase();

            if (itemType === 'bundle') {
                return !!id && !excludedItems.includes(id);
            }

            if (!chapter || !season) return false;
            if (excludedItems.includes(id)) return false;

            const maxChapter = parseInt(chapterlimit, 10);
            const maxSeason = seasonlimit.toString();

            if (maxSeason === 'OG') {
                return chapter >= 1 && chapter <= maxChapter && itemRarity !== 'common';
            }

            if (
                chapter < 1 || chapter > maxChapter ||
                (chapter === maxChapter && (season === 'X' || parseInt(season, 10) > parseInt(maxSeason, 10)))
            ) {
                return false;
            }

            return itemRarity !== 'common';
        });
    } catch (error) {
        log.error('Error fetching cosmetics:', error.message || error);
        return [];
    }
}

function loadManualShopCosmetics() {
    const manualCatalogPath = path.join(__dirname, '..', 'Config', 'manual_catalog_config.json');
    if (!fs.existsSync(manualCatalogPath)) return [];

    try {
        const manualCatalog = JSON.parse(fs.readFileSync(manualCatalogPath, 'utf8'));
        const typeNames = {
            athenacharacter: 'Outfit',
            athenadance: 'Emote',
            athenabackpack: 'Backpack',
            athenapickaxe: 'Pickaxe',
            athenaglider: 'Glider',
            athenawrap: 'Wrap',
            athenabundle: 'Bundle'
        };

        return Object.values(manualCatalog || {}).flatMap((entry) => {
            const grant = Array.isArray(entry?.itemGrants) ? entry.itemGrants[0] : null;
            if (typeof grant !== 'string' || !grant.includes(':')) return [];
            const [grantType, ...idParts] = grant.split(':');
            const id = idParts.join(':');
            if (!id) return [];
            return [{
                id,
                type: { value: typeNames[String(grantType).toLowerCase()] || 'Cosmetic' },
                rarity: { displayValue: 'Rare' },
                price: Number(entry.price) || 0,
                images: { icon: `https://fortnite-api.com/images/cosmetics/br/${encodeURIComponent(id)}/icon.png` },
                source: 'manual_catalog'
            }];
        });
    } catch (error) {
        log.error('Failed to load manual shop cosmetics:', error.message || error);
        return [];
    }
}

function pickRandomItems(items, count) {
    const shuffled = items.slice().sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function isBundleItem(item) {
    const candidates = [];
    const typeObj = item?.type;
    if (typeObj) {
        candidates.push(typeObj.value, typeObj.displayValue, typeObj.backendValue, typeObj.name);
    }
    candidates.push(item?.backendType, item?.displayType, item?.type?.type, item?.typeName, item?.itemType, item?.kind);

    const normalized = candidates
        .filter(Boolean)
        .map(value => String(value).toLowerCase())
        .filter(Boolean);

    return normalized.some(value => value === 'bundle' || value.includes('bundle'));
}

function injectBundleItems(shopSections, cosmetics) {
    const bundleItems = (cosmetics || []).filter(isBundleItem);
    const fallbackItems = (cosmetics || []).filter(item => !!item && !!item.id);
    const pool = bundleItems.length > 0 ? bundleItems : fallbackItems;

    shopSections.forEach((section) => {
        const bundleAmount = Number(section.bundleItemsAmount ?? section.BundleItemsAmount ?? 0);
        if (!bundleAmount || bundleAmount <= 0) return;

        if (!Array.isArray(pool) || pool.length === 0) {
            section.bundleItems = [];
            return;
        }

        const bundlesToInsert = [];
        for (let i = 0; i < bundleAmount; i++) {
            bundlesToInsert.push(pool[i % pool.length]);
        }

        section.bundleItems = bundlesToInsert;
    });

    return shopSections;
}

async function fetchBuffer(url) {
    if (!url) return null;

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            validateStatus: () => true,
            timeout: 400,
            maxRedirects: 1,
            maxContentLength: 128 * 1024,
            maxBodyLength: 128 * 1024,
            headers: {
                Accept: 'image/*,*/*;q=0.8'
            }
        });
        const contentType = (response.headers['content-type'] || '').toLowerCase();
        if (response.status !== 200 || !contentType.startsWith('image/')) {
            return null;
        }

        const buffer = Buffer.from(response.data || []);
        return buffer && buffer.length > 0 ? buffer : null;
    } catch (error) {
        return null;
    }
}

function getItemImageUrls(item) {
    const candidates = [];

    if (item?.images?.icon) candidates.push(item.images.icon);
    if (item?.images?.smallIcon) candidates.push(item.images.smallIcon);
    if (item?.images?.featured) candidates.push(item.images.featured);

    if (item?.id && typeof item.id === 'string') {
        candidates.push(`https://fortnite-api.com/images/cosmetics/br/${encodeURIComponent(item.id)}/icon.png`);
    }

    if (item?.templateId && typeof item.templateId === 'string') {
        const candidate = item.templateId.split(':').pop();
        if (candidate) {
            candidates.push(`https://fortnite-api.com/images/cosmetics/br/${encodeURIComponent(candidate)}/icon.png`);
        }
    }

    return [...new Set(candidates.filter(Boolean))];
}

function getItemImageUrl(item) {
    return getItemImageUrls(item)[0] || null;
}

// Rarity color mapping
const rarityColors = {
    'Common': 0x888888ff,
    'Uncommon': 0x00ff00ff,
    'Rare': 0x0099ffff,
    'Epic': 0x9933ffff,
    'Legendary': 0xffcc00ff
};

function getRarityColor(rarity) {
    const displayValue = rarity?.displayValue || 'Common';
    return rarityColors[displayValue] || 0x888888ff;
}

async function sendShopImageViaWebhook(filePath, title, description) {
    if (!webhook) {
        log.error('Discord webhook URL is not configured');
        return false;
    }

    try {
        const form = new FormData();
        form.append('payload_json', JSON.stringify({
            content: '',
            embeds: [{
                title,
                description,
                color: 0x112b58,
                image: { url: 'attachment://shop.png' }
            }]
        }));
        form.append('file', fs.createReadStream(filePath), {
            filename: 'shop.png',
            contentType: 'image/png'
        });

        const response = await axios.post(webhook, form, {
            headers: form.getHeaders()
        });

        if (response.status >= 200 && response.status < 300) {
            log.AutoRotation('Shop image posted to Discord via webhook successfully');
            return true;
        }

        log.error('Discord webhook returned non-success status:', response.status, response.data);
        return false;
    } catch (error) {
        log.error('Failed to send shop image via Discord webhook:', error.message || error);
        return false;
    }
}

async function createShopSummaryImage(itemShop) {
    try {
        const fontPath = path.join(__dirname, '..', 'node_modules', '@jimp', 'plugin-print', 'fonts', 'open-sans', 'open-sans-16-white', 'open-sans-16-white.fnt');
        const font = await Jimp.loadFont(fontPath);

        const maxRenderableItems = 48;
        const itemsToRender = Array.isArray(itemShop) ? itemShop.slice(0, maxRenderableItems) : [];
        if (Array.isArray(itemShop) && itemShop.length > maxRenderableItems) {
            log.AutoRotation(`Rendering first ${maxRenderableItems} of ${itemShop.length} items to keep the shop image Discord-friendly and fast.`);
        }

        const itemBoxWidth = 120;
        const itemBoxHeight = 150;
        const startY = 120;
        const startX = 24;
        const spacing = 12;
        const itemsPerRow = 6;
        const rows = Math.max(1, Math.ceil(itemsToRender.length / itemsPerRow));
        const imageHeight = startY + rows * (itemBoxHeight + spacing) + 50;
        const imageWidth = startX * 2 + itemsPerRow * itemBoxWidth + (itemsPerRow - 1) * spacing;

        let image = await new JimpClass({
            width: imageWidth,
            height: imageHeight,
            color: 0x1a2a4aff
        });

        const headerColor = 0x112b58ff;
        for (let py = 0; py < 120; py++) {
            for (let px = 0; px < imageWidth; px++) {
                image.setPixelColor(headerColor, px, py);
            }
        }

        log.AutoRotation(`Drawing ${itemsToRender.length} items on shop image (${rows} rows, ${itemsPerRow} columns)`);

        const renderItems = await Promise.all(itemsToRender.map(async (item, i) => {
            const row = Math.floor(i / itemsPerRow);
            const col = i % itemsPerRow;
            const x = startX + col * (itemBoxWidth + spacing);
            const y = startY + row * (itemBoxHeight + spacing);
            const priceText = item?.price !== undefined ? String(item.price) : (item?.priceText || ' ');
            const itemName = item?.id || 'Unknown';
            let iconUrl = null;
            let iconBuffer = null;

            for (const candidateUrl of getItemImageUrls(item).slice(0, 2)) {
                iconUrl = candidateUrl;
                iconBuffer = await fetchBuffer(candidateUrl);
                if (iconBuffer) break;
            }

            return { x, y, priceText, itemName, iconUrl, iconBuffer };
        }));

        for (const { x, y, priceText, itemName, iconUrl, iconBuffer } of renderItems) {
            const accentColor = 0x112b58ff;
            const boxColor = 0x1a3a6aff;
            for (let py = y; py < y + itemBoxHeight; py++) {
                for (let px = x; px < x + itemBoxWidth; px++) {
                    image.setPixelColor(boxColor, px, py);
                }
            }

            for (let py = y; py < y + 40; py++) {
                for (let px = x; px < x + itemBoxWidth; px++) {
                    image.setPixelColor(accentColor, px, py);
                }
            }

            const borderThickness = 3;
            for (let px = x; px < x + itemBoxWidth; px++) {
                for (let t = 0; t < borderThickness; t++) {
                    image.setPixelColor(accentColor, px, y + t);
                    image.setPixelColor(accentColor, px, y + itemBoxHeight - 1 - t);
                }
            }
            for (let py = y; py < y + itemBoxHeight; py++) {
                for (let t = 0; t < borderThickness; t++) {
                    image.setPixelColor(accentColor, x + t, py);
                    image.setPixelColor(accentColor, x + itemBoxWidth - 1 - t, py);
                }
            }

            if (iconUrl && iconBuffer) {
                try {
                    const iconImage = await JimpClass.read(iconBuffer);
                    const iconSize = 82;
                    if (typeof iconImage.contain === 'function') {
                        iconImage.contain({ w: iconSize, h: iconSize });
                    } else if (typeof iconImage.resize === 'function') {
                        iconImage.resize({ w: iconSize, h: iconSize });
                    } else {
                        iconImage.scaleToFit(iconSize, iconSize);
                    }
                    image.composite(iconImage, x + Math.floor((itemBoxWidth - iconSize) / 2), y + 34);
                } catch (iconError) {
                    log.error(`Failed to load icon for ${itemName} (${iconUrl}):`, iconError.message || iconError);
                }
            }

            const textY = y + itemBoxHeight - 28;
            pluginPrint.methods.print(image, {
                font,
                x: x + 8,
                y: textY,
                text: priceText || ' ',
                alignmentX: Jimp.HorizontalAlign.CENTER,
                alignmentY: Jimp.VerticalAlign.TOP,
                maxWidth: itemBoxWidth - 16,
                maxHeight: 26
            });
        }

        const pngMime = Jimp.JimpMime?.png || Jimp.MIME_PNG || 'image/png';
        const buffer = await new Promise((resolve, reject) => {
            image.getBuffer(pngMime, (err, buf) => {
                if (err) return reject(err);
                resolve(buf);
            });
        });
        return buffer;
    } catch (err) {
        log.error('Error creating shop image:', err.message || err);
        return null;
    }
}



function formatitemgrantsyk(item) {
    const { id, backendValue, type } = item || {};
    if (!id) return [];

    let itemType;

    switch ((type?.value || '').toLowerCase()) {
        case 'outfit':
            itemType = 'AthenaCharacter';
            break;
        case 'emote':
            itemType = 'AthenaDance';
            break;
        case 'bundle':
            itemType = 'AthenaBundle';
            break;
        default:
            itemType = backendValue || `Athena${capitalizeomg(type?.value || '')}`;
            break;
    }

    return [`${itemType}:${id}`];
}

function buildCatalogItemGrants(item) {
    const candidateLists = [
        item?.items,
        item?.grantedCosmetics,
        item?.grants,
        item?.bundleItems,
        item?.contents,
        item?.includedItems
    ];

    const grants = [];

    for (const list of candidateLists) {
        if (!Array.isArray(list)) continue;

        for (const candidate of list) {
            if (!candidate) continue;

            if (typeof candidate === 'string') {
                if (candidate) grants.push(candidate);
                continue;
            }

            const grant = formatitemgrantsyk(candidate);
            if (grant.length > 0) grants.push(...grant);
        }
    }

    if (grants.length > 0) return grants;
    return formatitemgrantsyk(item);
}

function capitalizeomg(string) {
    if (!string || typeof string !== 'string') return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getShopSectionConfig() {
    if (Array.isArray(config.bShopSections) && config.bShopSections.length > 0) {
        return config.bShopSections.map((section, index) => {
            const sectionNumber = index + 1;
            const sectionId = `Section${sectionNumber}`;
            const explicitName = typeof section.sectionName === 'string' && section.sectionName.trim().length > 0
                ? section.sectionName.trim()
                : null;
            return {
                sectionNumber,
                sectionId,
                sectionDailyId: `${sectionId}Daily`,
                sectionFeaturedId: `${sectionId}Featured`,
                sectionName: explicitName || functions.getSectionDisplayName(sectionId),
                sectionKey: (section.sectionId || explicitName || `section${sectionNumber}`).toString().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                dailyItemsAmount: Number(section.dailyItemsAmount ?? config.bDailyItemsAmount ?? 0),
                featuredItemsAmount: Number(section.featuredItemsAmount ?? config.bFeaturedItemsAmount ?? 0),
                bundleItemsAmount: Number(section.bundleItemsAmount ?? section.BundleItemsAmount ?? 0)
            };
        });
    }

    return [{
        sectionNumber: 1,
        sectionId: 'Section1',
        sectionDailyId: 'Section1Daily',
        sectionFeaturedId: 'Section1Featured',
        sectionName: functions.getSectionDisplayName('Section1Daily'),
        sectionKey: 'section1',
        dailyItemsAmount: Number(config.bDailyItemsAmount ?? 0),
        featuredItemsAmount: Number(config.bFeaturedItemsAmount ?? 0),
        bundleItemsAmount: 0
    }];
}

function updatecfgomg(shopSections) {
    const catalogConfig = { '//': 'BR Item Shop Config' };

    shopSections.forEach((section, sectionIndex) => {
        const baseKey = section.sectionKey || `section${sectionIndex + 1}`;
        const sectionId = section.sectionId || `Section${sectionIndex + 1}`;
        const sectionDailyId = section.sectionDailyId || `${sectionId}Daily`;
        const sectionFeaturedId = section.sectionFeaturedId || `${sectionId}Featured`;
        const sectionBaseName = sectionId.toString().replace(/[^A-Za-z0-9]+/g, '') || `Section${sectionIndex + 1}`;

        const addSectionItems = (sectionPrefix, items) => {
            items.forEach((item, index) => {
                const entryKey = `${sectionPrefix}_${baseKey}_${index + 1}`;
                const tileSize = 'Small';
                const sectionIdOverride = sectionPrefix === 'featured' ? sectionFeaturedId : sectionDailyId;
                catalogConfig[entryKey] = {
                    itemGrants: buildCatalogItemGrants(item),
                    price: 0,
                    SectionId: sectionIdOverride,
                    TileSize: tileSize
                };
            });
        };

        addSectionItems('daily', section.dailyItems || []);
        addSectionItems('featured', section.featuredItems || []);

        const bundles = Array.isArray(section.bundleItems) ? section.bundleItems : [];
        if (bundles.length > 0) {
            bundles.forEach((item, index) => {
                const entryKey = `bundle_${baseKey}_${index + 1}`;
                const sectionNameForBundle = sectionBaseName || `Section${sectionIndex + 1}`;
                catalogConfig[entryKey] = {
                    itemGrants: buildCatalogItemGrants(item),
                    price: 0,
                    SectionId: sectionNameForBundle,
                    TileSize: 'DoubleWide'
                };
            });
        }
    });

    // Bundle entries are generated from each section's bundleItems selection.

    try {
        fs.writeFileSync(catalogcfg, JSON.stringify(catalogConfig, null, 2), 'utf-8');
        log.AutoRotation('The item shop has rotated!');
    } catch (err) {
        log.error('Failed to write catalog config:', err.message || err);
    }
}

async function fetchItemIcon(itemName) {
    log.AutoRotation(`fetchItemIcon is deprecated and should not be used for ${itemName}`);
    return null;
}

function waitForDiscordReady(discordClient, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        if (!discordClient) {
            return reject(new Error('Discord client is not available'));
        }
        if (discordClient.readyAt) {
            return resolve(true);
        }

        const onReady = () => {
            cleanup();
            resolve(true);
        };

        const onError = (err) => {
            cleanup();
            reject(err || new Error('Discord client error before ready'));
        };

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Discord client did not become ready in time'));
        }, timeoutMs);

        const cleanup = () => {
            clearTimeout(timeout);
            discordClient.off('ready', onReady);
            discordClient.off('error', onError);
        };

        discordClient.once('ready', onReady);
        discordClient.once('error', onError);
    });
}

async function discordpost(itemShop) {
    try {
        const discordClient = global.discordClient;
        if (!discordClient) {
            log.AutoRotation('Discord Bot client is not available; skipping Discord shop post.');
            return false;
        }
        if (!discordClient.readyAt) {
            log.AutoRotation('Discord Bot client is not ready; skipping Discord shop post.');
            return false;
        }

        // Flatten items from all sections into a single array
        let allItems = [];
        if (itemShop.sections && Array.isArray(itemShop.sections)) {
            for (const section of itemShop.sections) {
                if (section.daily && Array.isArray(section.daily)) {
                    allItems = allItems.concat(section.daily);
                }
                if (section.featured && Array.isArray(section.featured)) {
                    allItems = allItems.concat(section.featured);
                }
            }
        } else if (Array.isArray(itemShop)) {
            allItems = itemShop;
        }

        const channelId = config.bReportChannelId || config.discord?.reportChannelId || '1424719759399845920';
        log.AutoRotation(`Generating shop image for Discord Bot and posting to channel ${channelId}...`);
        const imageBuffer = await createShopSummaryImage(allItems);
        log.AutoRotation('Shop image buffer length:', imageBuffer ? imageBuffer.length : 0);
        if (!imageBuffer || imageBuffer.length === 0) {
            log.error('Failed to generate shop image buffer for Discord');
            return false;
        }

        const shopDir = path.join(__dirname, '..', 'Discordshop');
        if (!fs.existsSync(shopDir)) {
            fs.mkdirSync(shopDir, { recursive: true });
        }

        const date = new Date().toISOString().slice(0, 10);
        const fileName = `shop_${date}.png`;
        const filePath = path.join(shopDir, fileName);
        fs.writeFileSync(filePath, imageBuffer);
        log.AutoRotation('Shop image saved to:', filePath);

        let channel;
        try {
            channel = await discordClient.channels.fetch(channelId);
        } catch (channelError) {
            log.error(`Failed to fetch Discord channel ${channelId}:`, channelError.message || channelError);
        }

        if (channel) {
            const { MessageEmbed } = require('discord.js');
            const embed = new MessageEmbed()
                .setTitle(`Drop Shop for ${date}`)
                .setDescription('The item shop resets in 7 hours.')
                .setColor('#112b58')
                .setImage('attachment://shop.png');

            try {
                const sentMessage = await channel.send({
                    embeds: [embed],
                    files: [{ attachment: filePath, name: 'shop.png' }]
                });

                try {
                    await sentMessage.react('👍');
                    await sentMessage.react('🦇');
                } catch (reactionError) {
                    log.error('Failed to add reactions to shop message:', reactionError.message || reactionError);
                }

                log.AutoRotation('Shop image posted to Discord channel successfully');
                return;
            } catch (sendError) {
                log.error(`Failed to send shop image to Discord channel ${channelId}:`, sendError.message || sendError);
                if (sendError?.rawError) {
                    log.error('Discord raw error:', sendError.rawError);
                }
            }
        } else {
            log.error('Could not fetch Discord channel:', channelId);
        }

        const webhookSent = await sendShopImageViaWebhook(filePath, `Drop Shop for ${date}`, 'The item shop resets in 7 hours.');
        if (!webhookSent) {
            log.error('Unable to post the shop image to Discord via either the bot channel or the webhook.');
            return false;
        }

        return true;

    } catch (error) {
        log.error('Error in discordpost:', error.message || error);
    }
}

async function rotateshop() {
    try {
        const apiCosmetics = await fetchitems();
        const manualCosmetics = loadManualShopCosmetics();
        const cosmetics = [...new Map([...apiCosmetics, ...manualCosmetics].map(item => [item.id, item])).values()];
        if (cosmetics.length === 0) {
            log.error('No cosmetics found?');
            setTimeout(rotateshop, milisecstillnextrotation());
            return;
        }

        const sections = getShopSectionConfig();
        const usedItemIds = new Set();
        const pickRotationItems = (count) => {
            const amount = Number(count) || 0;
            if (amount <= 0) return [];

            const available = cosmetics.filter(item => !usedItemIds.has(item.id));
            const selected = pickRandomItems(available, Math.min(amount, available.length));
            selected.forEach(item => usedItemIds.add(item.id));
            return selected;
        };

        const shopSections = sections.map(section => ({
            ...section,
            dailyItems: pickRotationItems(section.dailyItemsAmount),
            featuredItems: pickRotationItems(section.featuredItemsAmount)
        }));

        injectBundleItems(shopSections, cosmetics);
        updatecfgomg(shopSections);
        await discordpost({ sections: shopSections.map(s => ({ name: s.sectionName, daily: s.dailyItems, featured: s.featuredItems })) });

        const nextRotationTime = milisecstillnextrotation();
        log.AutoRotation(`Scheduling next rotation in: ${nextRotationTime} milliseconds`);
        setTimeout(rotateshop, nextRotationTime);
    } catch (error) {
        log.error('Error while rotating:', error.message || error);
        setTimeout(rotateshop, milisecstillnextrotation());
    }
}

function getUTCTimeFromLocal(hour, minute) {
    const now = new Date();
    const japanOffsetMs = 9 * 60 * 60 * 1000;
    const japanNow = new Date(now.getTime() + japanOffsetMs);
    const japanYear = japanNow.getUTCFullYear();
    const japanMonth = japanNow.getUTCMonth();
    const japanDate = japanNow.getUTCDate();

    return new Date(Date.UTC(japanYear, japanMonth, japanDate, hour - 9, minute, 0));
}

function milisecstillnextrotation() {
    const now = new Date();
    const [localHour, localMinute] = (config.bRotateTime || '00:00').toString().split(':').map(Number);
    const nextRotation = getUTCTimeFromLocal(localHour, localMinute);

    if (now.getTime() >= nextRotation.getTime()) {
        nextRotation.setUTCDate(nextRotation.getUTCDate() + 1);
    }

    const millisUntilNextRotation = nextRotation.getTime() - now.getTime();
    log.AutoRotation(`Milliseconds until next rotation: ${millisUntilNextRotation}`);
    return millisUntilNextRotation;
}

let autoRotateStarted = false;

function beginAutoRotate() {
    if (autoRotateStarted) return;
    autoRotateStarted = true;

    if (config.bUseAutoRotate === true) {
        const nextRotationTime = milisecstillnextrotation();
        log.AutoRotation(`Auto rotate enabled: keeping the current shop until the next 09:00 JST rotation in ${nextRotationTime} milliseconds.`);
        setTimeout(rotateshop, nextRotationTime);
    } else {
        setTimeout(rotateshop, milisecstillnextrotation());
    }
}

function startAutoRotate() {
    const discordClient = global.discordClient;
    if (!discordClient) {
        log.AutoRotation('Discord client not available; starting shop rotation without Discord posting.');
        beginAutoRotate();
        return;
    }

    if (!discordClient.readyAt) {
        log.AutoRotation('Discord Bot client is not ready; starting shop rotation without Discord posting.');
        beginAutoRotate();
        return;
    }

    beginAutoRotate();
}

startAutoRotate();

module.exports = {
    createShopSummaryImage,
    fetchitems,
    pickRandomItems,
    getShopSectionConfig,
    updatecfgomg,
    fetchItemIcon,
    getItemImageUrl,
    getItemImageUrls,
    fetchBuffer,
    discordpost,
    rotateshop,
    startAutoRotate,
    getUTCTimeFromLocal,
    milisecstillnextrotation
};
