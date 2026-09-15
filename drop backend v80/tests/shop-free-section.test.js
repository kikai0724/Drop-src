const assert = require('assert');
const { isFreeShopSection, getShopSectionDisplayName } = require('../structs/functions.js');

assert.strictEqual(isFreeShopSection({ sectionName: 'Section 7' }, 6), true);
assert.strictEqual(isFreeShopSection({ sectionName: 'Section 6' }, 5), false);
assert.strictEqual(getShopSectionDisplayName('Section7Daily'), 'Free Slot');
console.log('shop free section tests passed');
