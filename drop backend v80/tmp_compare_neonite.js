const fs = require('fs');
const path = require('path');
const neon = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'NeoniteV4', 'responses', 'catalog', 'shopv2.json'), 'utf8'));
const weekly = neon.storefronts.find(s => s.name === 'BRWeeklyStorefront');
if (!weekly) {
  console.error('no weekly');
  process.exit(1);
}
console.log('weekly count', weekly.catalogEntries.length);
for (let i = 0; i < Math.min(10, weekly.catalogEntries.length); i++) {
  const e = weekly.catalogEntries[i];
  console.log(i, JSON.stringify({
    SectionId: e.meta?.SectionId,
    LayoutId: e.meta?.LayoutId,
    TileSize: e.meta?.TileSize,
    sortPriority: e.sortPriority,
    catalogGroupPriority: e.catalogGroupPriority,
    metaInfo: e.metaInfo?.filter(m => ['SectionId', 'LayoutId', 'TileSize'].includes(m.key))
  }, null, 2));
}
console.log('--- samples');
const samples = {};
weekly.catalogEntries.forEach((e) => {
  const k = e.meta?.SectionId || 'NONE';
  samples[k] = samples[k] || [];
  if (samples[k].length < 2) samples[k].push({
    LayoutId: e.meta?.LayoutId,
    TileSize: e.meta?.TileSize,
    sortPriority: e.sortPriority,
    catalogGroupPriority: e.catalogGroupPriority
  });
});
console.log(JSON.stringify(samples, null, 2));
