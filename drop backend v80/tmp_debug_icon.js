const autorotate = require('./structs/autorotate');
const Jimp = require('jimp');

(async () => {
  const url = 'https://fortnite-api.com/images/cosmetics/br/CID_949_Athena_Commando_M_Football20Referee_C_SMMEY/icon.png';
  console.log('url', url);
  try {
    const buffer = await autorotate.fetchBuffer(url);
    console.log('fetchBuffer result type', typeof buffer, 'isBuffer', Buffer.isBuffer(buffer));
    if (buffer) {
      console.log('buffer len', buffer.length, 'constructor', buffer.constructor.name);
      const img = await Jimp.Jimp.read(buffer);
      console.log('Jimp read success', img.bitmap.width, img.bitmap.height);
    }
  } catch (e) {
    console.error('error', e);
  }
})();
