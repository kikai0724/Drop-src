const functions = require('./structs/functions');
const content = functions.getContentPages({ headers: { 'user-agent': 'test', 'accept-language': 'en-US' } });
console.log(JSON.stringify({ shopSectionsCount: content.shopSections.sectionList.sections.length, shopSections: content.shopSections.sectionList.sections }, null, 2));
