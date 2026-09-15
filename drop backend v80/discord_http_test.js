const axios = require('axios');
const FormData = require('form-data');
const { Jimp } = require('jimp');

(async () => {
  try {
    const img = new Jimp({ width: 64, height: 64, color: 0x0000ffff });
    const buf = await new Promise((resolve, reject) => {
      img.getBuffer('image/png', (err, buffer) => err ? reject(err) : resolve(buffer));
    });
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ content: 'test from node' }));
    form.append('file', buf, { filename: 'test.png', contentType: 'image/png' });

    const url = 'https://discord.com/api/webhooks/REPLACE_WITH_YOUR_WEBHOOK_URL';
    console.log('posting to', url);
    const res = await axios.post(url, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000,
      validateStatus: () => true
    });
    console.log('status', res.status);
    console.log('data', JSON.stringify(res.data));
  } catch (e) {
    console.error('ERR', e.message);
    if (e.response) console.error(JSON.stringify(e.response.data));
  }
})();
