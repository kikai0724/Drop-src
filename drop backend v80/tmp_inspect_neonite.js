const fs = require('fs');
const neon = JSON.parse(fs.readFileSync('../NeoniteV4/responses/catalog/shopv2.json', 'utf8'));
const metaInfo = e => ({SectionId: e.meta?.SectionId, LayoutId: e.meta?.LayoutId, TileSize: e.meta?.TileSize});
console.log('total storefronts', neon.storefronts.length);
const withEntries = neon.storefronts.filter(s => Array.isArray(s.catalogEntries) && s.catalogEntries.length > 0);
withEntries.forEach(s => {
  const sections = {};
  s.catalogEntries.forEach(e => {
    const id = e.meta?.SectionId || 'NONE';
    sections[id] = (sections[id] || 0) + 1;
  });
  console.log(`${s.name}: ${s.catalogEntries.length} entries, sections=${Object.keys(sections).length}`);
  if (Object.keys(sections).length > 0) console.log('  section keys', Object.keys(sections).slice(0,20));
});
const daily = neon.storefronts.find(s => s.name === 'BRDailyStorefront');
if (daily) console.log('--- BRDailyStorefront first 20 meta ---', daily.catalogEntries.length, daily.catalogEntries.slice(0,20).map(metaInfo));
const weekly = neon.storefronts.find(s => s.name === 'BRWeeklyStorefront');
if (weekly) console.log('--- BRWeeklyStorefront first 20 meta ---', weekly.catalogEntries.length, weekly.catalogEntries.slice(0,20).map(metaInfo));
