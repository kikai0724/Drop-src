const ar = require('./structs/autorotate');
const sections = ar.getShopSectionConfig().map((section, index) => ({
  ...section,
  dailyItems: [{ templateId: `AthenaCharacter:CID_TEST_DAILY_${index}` }],
  featuredItems: [{ templateId: `AthenaCharacter:CID_TEST_FEATURED_${index}` }]
}));
ar.updatecfgomg(sections);
console.log('generated catalog_config.json');
