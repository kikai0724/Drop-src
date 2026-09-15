const { discordpost } = require('./structs/autorotate');
(async () => {
  console.log('before call');
  try {
    await discordpost({ sections:[{ name:'Section 1', featured:[], daily:[] }] });
    console.log('after call');
  } catch (e) {
    console.error('error', e);
    process.exit(1);
  }
})();
