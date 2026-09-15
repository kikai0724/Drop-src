const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'Config', 'config.json'), 'utf8'));
const CatalogConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'Config', 'catalog_config.json'), 'utf8'));
const catalogTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, 'responses', 'catalog.json'), 'utf8'));
const sectionDefinitions = (Array.isArray(config.bShopSections) && config.bShopSections.length > 0)
  ? config.bShopSections.map((section,index) => ({
      sectionName: section.sectionName || `Section ${index+1}`,
      sectionKey: (section.sectionId || section.sectionName || `section${index+1}`).toString().toLowerCase().replace(/[^a-z0-9]+/g,'_')
    }))
  : [{ sectionName: 'Section 1', sectionKey: 'section1' }];
console.log('sectionDefinitions=', JSON.stringify(sectionDefinitions));
const parseShopSectionKey = (value) => {
  const normalizedName = value.toLowerCase();
  const defaultResult = { sectionPrefix: 'daily', sectionKey: 'section1' };
  const match = normalizedName.match(/^(daily|featured|weekly|season|standalone)_(section_?(\d+))/);
  if (!match) return defaultResult;
  return { sectionPrefix: match[1], sectionKey: `section_${match[2].replace(/^section_?/, '')}` };
};
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
  if (sectionMeta && sectionKey !== 'section1') storefrontName = `${storefrontName}_${sectionMeta.sectionName.replace(/[^a-z0-9]+/gi, '_')}`;
  storefrontsToReset.add(storefrontName);
}
console.log('storefrontsToReset=', JSON.stringify(Array.from(storefrontsToReset)));
for (const storefrontName of storefrontsToReset) {
  const existingStorefront = catalogTemplate.storefronts.find(p => p.name === storefrontName);
  if (existingStorefront) {
    existingStorefront.catalogEntries = [];
  } else {
    catalogTemplate.storefronts.push({ name: storefrontName, catalogEntries: [] });
  }
}
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
  if (sectionMeta && sectionKey !== 'section1') storefrontName = `${storefrontName}_${sectionMeta.sectionName.replace(/[^a-z0-9]+/gi, '_')}`;
  const storefront = catalogTemplate.storefronts.find(p => p.name === storefrontName);
  if (!storefront) console.log('MISSING storefront for', value, storefrontName);
  else {
    console.log('FOUND storefront for', value, storefrontName);
    console.log('  before count=', storefront.catalogEntries.length);
    const entry = { itemGrants: ['AthenaCharacter:CID_028_Athena_Commando_F'], price: 0, SectionId: CatalogConfig[value].SectionId, TileSize:'Small' };
    storefront.catalogEntries.push(entry);
    console.log('  after count=', storefront.catalogEntries.length);
  }
}
console.log('section storefront counts:', catalogTemplate.storefronts.filter(s=>s.name.includes('Section')).map(s=>({name:s.name,count:s.catalogEntries.length})));
