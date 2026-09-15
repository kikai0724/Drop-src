const axios = require('axios');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

(async () => {
  const itemId = 'EID_PoutyClap';
  const url = 'https://fortnite-api.com/images/cosmetics/br/' + encodeURIComponent(itemId) + '/icon.png';
  console.log('url', url);
  const resp = await axios.get(url, { responseType: 'arraybuffer', validateStatus: () => true });
  console.log('status', resp.status, 'content-type', resp.headers['content-type'], 'len', resp.data.length);
  const buf = Buffer.from(resp.data);
  console.log('buf is buffer', Buffer.isBuffer(buf), 'len', buf.length);
  try {
    const img = await Jimp.Jimp.read(buf);
    console.log('read ok', img.bitmap.width, img.bitmap.height, typeof img.print);
    const fontPath = path.join(__dirname, 'node_modules', '@jimp', 'plugin-print', 'fonts', 'open-sans', 'open-sans-16-white', 'open-sans-16-white.fnt');
    const font = await Jimp.loadFont(fontPath);
    console.log('font loaded', typeof font);
    img.print({ font, x: 10, y: 10, text: 'Sparkplug', alignmentX: Jimp.HorizontalAlign.CENTER, alignmentY: Jimp.VerticalAlign.TOP, maxWidth: 132, maxHeight: 40 });
    const buffer = await new Promise((resolve, reject) => img.getBuffer(Jimp.JimpMime.png, (err, buf) => err ? reject(err) : resolve(buf)));
    fs.writeFileSync('tmp_jimp_test.png', buffer);
    console.log('saved tmp_jimp_test.png');
  } catch (e) {
    console.error('JIMP ERROR', e);
  }
})();
