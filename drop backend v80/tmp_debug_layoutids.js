const functions = require('./structs/functions');
const shop = functions.getItemShop();
['BRDailyStorefront','BRFeaturedStorefront'].forEach(name => {
  const sf = shop.storefronts.find(s => s.name === name);
  if (!sf) return console.log('missing', name);
  const layoutIds = sf.catalogEntries.map(e => e.meta?.LayoutId || 'NONE');
  const uniqueLayoutIds = new Set(layoutIds);
  const sectionIds = sf.catalogEntries.map(e => e.meta?.SectionId || 'NONE');
  const uniqueSectionIds = new Set(sectionIds);
  console.log(name, 'total', sf.catalogEntries.length, 'uniqueLayout', uniqueLayoutIds.size, 'uniqueSection', uniqueSectionIds.size, 'sections', Array.from(uniqueSectionIds).sort());
  const dupLayouts = layoutIds.filter((id, idx) => layoutIds.indexOf(id) !== idx);
  console.log(name, 'dup layouts count', dupLayouts.length, dupLayouts.slice(0,20));
  const duplicateSectionIds = sectionIds.filter((id, idx) => sectionIds.indexOf(id) !== idx);
  console.log(name, 'duplicate section count', duplicateSectionIds.length, duplicateSectionIds.slice(0,20));
});
