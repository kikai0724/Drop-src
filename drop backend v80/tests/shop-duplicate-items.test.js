const assert = require('assert');
const { deduplicateCatalogEntries, getItemShop } = require('../structs/functions.js');

const firstEntry = {
  offerId: 'offer-a',
  devName: 'dev-a',
  itemGrants: [{ templateId: 'AthenaCharacter:CID_1' }],
  meta: { SectionId: 'Section1Daily' }
};
const duplicateEntry = {
  offerId: 'offer-a',
  devName: 'dev-a',
  itemGrants: ['AthenaCharacter:CID_1'],
  meta: { SectionId: 'Section1Daily' }
};

const dedupedEntries = deduplicateCatalogEntries([firstEntry, duplicateEntry]);
assert.strictEqual(dedupedEntries.length, 1, 'Expected duplicate catalog entries to be removed');

const shop = getItemShop();
const duplicateStorefronts = [];
const itemLocations = new Map();

for (const storefront of Array.isArray(shop?.storefronts) ? shop.storefronts : []) {
  const seen = new Set();
  const duplicates = [];

  for (const entry of Array.isArray(storefront?.catalogEntries) ? storefront.catalogEntries : []) {
    const identity = entry?.__shopIdentity || entry?.offerId || entry?.devName || JSON.stringify(entry?.itemGrants || []);
    if (seen.has(identity)) {
      duplicates.push(identity);
    } else {
      seen.add(identity);
    }

    const grants = Array.isArray(entry?.itemGrants)
      ? entry.itemGrants.map(grant => typeof grant === 'string' ? grant : grant?.templateId).filter(Boolean)
      : [];
    if (grants.length > 0 && /^BR(?:Daily|Featured|Weekly|Standalone)Storefront/i.test(String(storefront?.name || ''))) {
      const grantIdentity = grants.map(grant => grant.toLowerCase()).sort().join('|');
      const locations = itemLocations.get(grantIdentity) || [];
      locations.push(storefront?.name);
      itemLocations.set(grantIdentity, locations);
    }
  }

  if (duplicates.length > 0) {
    duplicateStorefronts.push({ storefront: storefront?.name, count: duplicates.length });
  }
}

assert.strictEqual(duplicateStorefronts.length, 0, `duplicate storefront entries detected: ${JSON.stringify(duplicateStorefronts)}`);
const crossStorefrontDuplicates = [...itemLocations.entries()]
  .filter(([, storefronts]) => new Set(storefronts).size > 1);
assert.strictEqual(
  crossStorefrontDuplicates.length,
  0,
  `items published to multiple storefronts: ${JSON.stringify(crossStorefrontDuplicates.slice(0, 10))}`
);
console.log('shop duplicate item tests passed');
