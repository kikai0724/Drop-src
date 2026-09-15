const functions = require('./structs/functions');
const shop = functions.getItemShop();
const weekly = shop.storefronts.find(s => s.name === 'BRWeeklyStorefront');
if (!weekly) { console.error('BRWeeklyStorefront not found'); process.exit(1); }
console.log('total entries:', weekly.catalogEntries.length);
const meta = weekly.catalogEntries.map(e => ({ SectionId: e.meta && e.meta.SectionId, LayoutId: e.meta && e.meta.LayoutId, TileSize: e.meta && e.meta.TileSize, sortPriority: e.sortPriority, offerId: e.offerId }));
console.log('first entries:', JSON.stringify(meta.slice(0, 40), null, 2));
const groups = {};
weekly.catalogEntries.forEach(e => {
  const sid = e.meta && e.meta.SectionId || 'NONE';
  const lid = e.meta && e.meta.LayoutId || 'NONE';
  groups[sid] = groups[sid] || { count: 0, layouts: {} };
  groups[sid].count++;
  groups[sid].layouts[lid] = (groups[sid].layouts[lid] || 0) + 1;
});
console.log('groups:', JSON.stringify(groups, null, 2));
