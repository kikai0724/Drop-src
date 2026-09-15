const fs = require('fs');
const functions = require('./structs/functions');

const shop = functions.getItemShop();

console.log('=== All Storefronts in Catalog ===');
shop.storefronts.forEach(sf => {
  console.log(`${sf.name}: ${(sf.catalogEntries || []).length} entries`);
  if ((sf.catalogEntries || []).length > 0) {
    const uniqueSectionIds = [...new Set((sf.catalogEntries || []).map(e => e.meta && e.meta.SectionId).filter(Boolean))];
    console.log(`  SectionIds: ${uniqueSectionIds.join(', ')}`);
  }
});

console.log('\n=== BRWeeklyStorefront detailed ===');
const weekly = shop.storefronts.find(s => s.name === 'BRWeeklyStorefront');
if (weekly) {
  const bySection = {};
  weekly.catalogEntries.forEach(e => {
    const sid = e.meta && e.meta.SectionId || 'NONE';
    bySection[sid] = (bySection[sid] || 0) + 1;
  });
  console.log('Entries per SectionId:', bySection);
}

console.log('\n=== Catalog Entries Sample ===');
weekly.catalogEntries.slice(0, 5).forEach((e, i) => {
  console.log(`${i}: SectionId="${e.meta.SectionId}" LayoutId="${e.meta.LayoutId}" TileSize="${e.meta.TileSize}" sortPriority=${e.sortPriority}`);
});
