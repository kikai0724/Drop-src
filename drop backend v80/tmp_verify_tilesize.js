const fs = require('fs');
const functions = require('./structs/functions');

const shop = functions.getItemShop();
const weekly = shop.storefronts.find(s => s.name === 'BRWeeklyStorefront');

console.log('=== TileSize Distribution ===');
const tileSizeCount = {};
weekly.catalogEntries.forEach(e => {
  const ts = e.meta.TileSize;
  tileSizeCount[ts] = (tileSizeCount[ts] || 0) + 1;
});
console.log(tileSizeCount);

console.log('\n=== LayoutId Distribution ===');
const layoutCount = {};
weekly.catalogEntries.forEach(e => {
  const lid = e.meta.LayoutId;
  layoutCount[lid] = (layoutCount[lid] || 0) + 1;
});
console.log(layoutCount);

console.log('\n=== Full Entry Sample (Featured) ===');
const featured = weekly.catalogEntries.find(e => e.meta.SectionId.includes('Featured'));
console.log(JSON.stringify(featured, null, 2).substring(0, 500));
