const functions = require('./structs/functions');
const shop = functions.getItemShop();
if (!shop || !Array.isArray(shop.storefronts)) {
  console.error('No storefronts');
  process.exit(1);
}
console.log(JSON.stringify(shop.storefronts.map(s => ({name: s.name, count: (s.catalogEntries || []).length, firstSectionId: (s.catalogEntries || [])[0]?.meta?.SectionId || null})), null, 2));
