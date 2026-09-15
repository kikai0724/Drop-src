const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'Config', 'config.json'), 'utf8'));
const CatalogConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'Config', 'catalog_config.json'), 'utf8'));
const catalog = {storefronts: []};
const sectionDefinitions = (Array.isArray(config.bShopSections) && config.bShopSections.length > 0)
    ? config.bShopSections.map((section, index) => ({
        sectionName: section.sectionName || `Section ${index + 1}`,
        sectionKey: (section.sectionId || section.sectionName || `section${index + 1}`).toString().toLowerCase().replace(/[^a-z0-9]+/g, '_')
    }))
    : [{ sectionName: 'Section 1', sectionKey: 'section_1' }];

console.log('sectionDefinitions', sectionDefinitions);
const parseShopSectionKey = (value) => {
    const normalizedName = value.toLowerCase();
    const defaultResult = { sectionPrefix: 'daily', sectionKey: 'section_1' };
    const match = normalizedName.match(/^(daily|featured|weekly|season|standalone)_(section_?(\d+))/);
    if (!match) return defaultResult;
    const sectionPrefix = match[1];
    const sectionKey = `section_${match[2].replace(/^section_?/, '')}`;
    return { sectionPrefix, sectionKey };
};
const useSectionSuffix = sectionDefinitions.length > 1;
const storefrontsToReset = new Set();
for (let value in CatalogConfig) {
    if (!Array.isArray(CatalogConfig[value].itemGrants)) continue;
    if (CatalogConfig[value].itemGrants.length == 0) continue;
    const { sectionPrefix, sectionKey } = parseShopSectionKey(value);
    const sectionMeta = sectionDefinitions.find(section => section.sectionKey === sectionKey) || sectionDefinitions[0];
    let storefrontName = 'BRDailyStorefront';
    if (sectionPrefix === 'featured') storefrontName = 'BRFeaturedStorefront';
    else if (sectionPrefix === 'weekly') storefrontName = 'BRWeeklyStorefront';
    else if (sectionPrefix === 'season') storefrontName = 'BRSeasonStorefront';
    else if (sectionPrefix === 'standalone') storefrontName = 'BRStandaloneStorefront';
    if (sectionMeta && useSectionSuffix) storefrontName = `${storefrontName}_${sectionMeta.sectionName.replace(/[^a-z0-9]+/gi, '_')}`;
    storefrontsToReset.add(storefrontName);
}
for (const storefrontName of storefrontsToReset) {
    const existingStorefront = catalog.storefronts.find(p => p.name === storefrontName);
    if (existingStorefront) existingStorefront.catalogEntries = [];
    else catalog.storefronts.push({ name: storefrontName, catalogEntries: [] });
}
const errors = [];
for (let value in CatalogConfig) {
    try {
        if (!Array.isArray(CatalogConfig[value].itemGrants)) continue;
        if (CatalogConfig[value].itemGrants.length == 0) continue;
        const normalizedName = value.toLowerCase();
        const { sectionPrefix, sectionKey } = parseShopSectionKey(value);
        const sectionMeta = sectionDefinitions.find(section => section.sectionKey === sectionKey) || sectionDefinitions[0];
        let storefrontName = 'BRDailyStorefront';
        if (sectionPrefix === 'featured') storefrontName = 'BRFeaturedStorefront';
        else if (sectionPrefix === 'weekly') storefrontName = 'BRWeeklyStorefront';
        else if (sectionPrefix === 'season') storefrontName = 'BRSeasonStorefront';
        else if (sectionPrefix === 'standalone') storefrontName = 'BRStandaloneStorefront';
        if (sectionMeta && useSectionSuffix) storefrontName = `${storefrontName}_${sectionMeta.sectionName.replace(/[^a-z0-9]+/gi, '_')}`;
        const CatalogEntry = {
            devName: '',
            offerId: '',
            fulfillmentIds: [],
            dailyLimit: -1,
            weeklyLimit: -1,
            monthlyLimit: -1,
            categories: [],
            prices: [{ currencyType: 'MtxCurrency', currencySubType: '', regularPrice: 0, finalPrice: 0, saleExpiration: 'TBD', basePrice: 0 }],
            meta: { SectionId: CatalogConfig[value].SectionId || (sectionPrefix === 'featured' ? 'Featured' : (sectionMeta ? sectionMeta.sectionName : 'Daily')), TileSize: 'Small' },
            matchFilter: '',
            filterWeight: 0,
            appStoreId: [],
            requirements: [],
            offerType: 'StaticPrice',
            giftInfo: { bIsEnabled: true, forcedGiftBoxTemplateId: '', purchaseRequirements: [], giftRecordIds: [] },
            refundable: false,
            metaInfo: [ { key: 'SectionId', value: CatalogConfig[value].SectionId || (sectionPrefix === 'featured' ? 'Featured' : (sectionMeta ? sectionMeta.sectionName : 'Daily')) }, { key: 'TileSize', value: 'Small' } ],
            displayAssetPath: '',
            itemGrants: [],
            sortPriority: normalizedName.startsWith('daily') ? -1 : 0,
            catalogGroupPriority: 0
        };
        if (CatalogConfig[value].SectionId) {
            CatalogEntry.meta.SectionId = CatalogConfig[value].SectionId;
            const sectionMeta2 = CatalogEntry.metaInfo.find(m => m.key === 'SectionId');
            if (sectionMeta2) sectionMeta2.value = CatalogConfig[value].SectionId;
        }
        if (CatalogConfig[value].TileSize) {
            CatalogEntry.meta.TileSize = CatalogConfig[value].TileSize;
            const tileMeta = CatalogEntry.metaInfo.find(m => m.key === 'TileSize');
            if (tileMeta) tileMeta.value = CatalogConfig[value].TileSize;
        }
        for (let itemGrant of CatalogConfig[value].itemGrants) {
            if (typeof itemGrant != 'string') continue;
            if (itemGrant.length == 0) continue;
            CatalogEntry.requirements.push({ requirementType: 'DenyOnItemOwnership', requiredId: itemGrant, minQuantity: 1 });
            CatalogEntry.itemGrants.push({ templateId: itemGrant, quantity: 1 });
        }
        const storefront = catalog.storefronts.find(p => p.name === storefrontName);
        if (!storefront) {
            console.error('MISSING STORE', value, storefrontName);
        } else {
            storefront.catalogEntries.push(CatalogEntry);
        }
    } catch (err) {
        errors.push({value, err: err.message});
    }
}
console.log('errors', errors);
console.log('counts', catalog.storefronts.map(s=>({name:s.name,count:s.catalogEntries.length})));