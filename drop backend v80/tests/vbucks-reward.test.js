const assert = require('assert');
const { calculateVbucksReward } = require('../structs/functions.js');

assert.strictEqual(calculateVbucksReward('elimination', 3), 450);
assert.strictEqual(calculateVbucksReward('elimination', 0), 0);
assert.strictEqual(calculateVbucksReward('victory'), 300);
console.log('vbucks reward tests passed');
