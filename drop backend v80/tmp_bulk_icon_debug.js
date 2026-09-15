const axios = require('axios');
const Jimp = require('jimp');
const urls = [
  'https://fortnite-api.com/images/cosmetics/br/CID_949_Athena_Commando_M_Football20Referee_C_SMMEY/icon.png',
  'https://fortnite-api.com/images/cosmetics/br/CID_644_Athena_Commando_M_Cattus/icon.png',
  'https://fortnite-api.com/images/cosmetics/br/BID_623_BlackWidowJacket/icon.png',
  'https://fortnite-api.com/images/cosmetics/br/Character_BerryTartRiver/icon.png',
  'https://fortnite-api.com/images/cosmetics/br/Wrap_267_HightowerDate/icon.png',
  'https://fortnite-api.com/images/cosmetics/br/CID_798_Athena_Commando_M_JonesyVagabond/icon.png',
  'https://fortnite-api.com/images/cosmetics/br/EID_InfiniteDab/icon.png',
  'https://fortnite-api.com/images/cosmetics/br/CID_734_Athena_Commando_F_BannerRed/icon.png'
];

(async () => {
  for (const url of urls) {
    console.log('\n---', url);
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', validateStatus: () => true });
      console.log('status', resp.status, 'ctype', resp.headers['content-type'], 'len', resp.data.length);
      const buf = Buffer.from(resp.data);
      console.log('buffer type', Buffer.isBuffer(buf), 'length', buf.length);
      try {
        const img = await Jimp.Jimp.read(buf);
        console.log('read OK', img.bitmap.width, img.bitmap.height);
      } catch (e) {
        console.error('read error', e);
      }
    } catch (e) {
      console.error('fetch error', e && e.message);
    }
  }
})();
