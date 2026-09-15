const assert = require('assert');
const autorotate = require('../structs/autorotate.js');

assert.strictEqual(typeof autorotate.getUTCTimeFromLocal, 'function', 'getUTCTimeFromLocal should be exported');
assert.strictEqual(typeof autorotate.milisecstillnextrotation, 'function', 'milisecstillnextrotation should be exported');

const target = autorotate.getUTCTimeFromLocal(9, 0);
assert.strictEqual(target.getUTCHours(), 0, '9:00 JST should resolve to 00:00 UTC');

console.log('autorotate schedule API test passed');
