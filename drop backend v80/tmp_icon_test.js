const autorotate = require('./structs/autorotate');

(async () => {
  const items = [
    { id: 'EID_PoutyClap', name: 'Sad Claps', images: { icon: 'https://fortnite-api.com/images/cosmetics/br/eid_poutyclap/icon.png' } },
    { id: 'EID_Unknown', name: 'Unknown' }
  ];

  for (const item of items) {
    const url = await autorotate.getItemImageUrl(item);
    console.log('item', item.name, 'id', item.id, 'url', url);
    if (url) {
      const buf = await autorotate.fetchBuffer(url);
      console.log('  buf', buf ? buf.length : null, Buffer.isBuffer(buf));
    }
  }
})();
