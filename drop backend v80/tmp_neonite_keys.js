const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join('..','NeoniteV4','responses','catalog','shopv2.json'), 'utf8'));
console.log(Object.keys(data));
