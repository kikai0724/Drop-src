const assert = require('assert');
const { calculateEliminationVbucks } = require('../structs/functions.js');

assert.strictEqual(calculateEliminationVbucks(1), 50);
assert.strictEqual(calculateEliminationVbucks(3), 150);
assert.strictEqual(calculateEliminationVbucks(0), 0);
console.log('elimination reward tests passed');
