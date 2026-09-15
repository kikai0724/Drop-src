const functions = require('./structs/functions');
const shop = functions.getItemShop();
const daily = shop.storefronts.find(s => s.name === 'BRDailyStorefront');
const featured = shop.storefronts.find(s => s.name === 'BRFeaturedStorefront');
console.log('BRDaily', daily ? daily.catalogEntries.length : 'none');
console.log('BRFeatured', featured ? featured.catalogEntries.length : 'none');
const sectionStores = shop.storefronts.filter(s => s.name.startsWith('BRDailyStorefront_') || s.name.startsWith('BRFeaturedStorefront_'));
sectionStores.forEach(s => {
  const ids = s.catalogEntries.slice(0, 4).map(e => ({ sectionId: e.meta?.SectionId, layout: e.meta?.LayoutId }));
  console.log(s.name, s.catalogEntries.length, ids);
});
const cp = functions.getContentPages({ headers: { 'accept-language': 'en' } });
console.log('content shopSections count', cp.shopSections?.sectionList?.sections?.length);
console.log(cp.shopSections?.sectionList?.sections?.map(s => ({ id: s.sectionId, name: s.sectionDisplayName, free: s.bFreeSection, hidden: s.bHidden, landingPriority: s.landingPriority, showTimer: s.bShowTimer })));
