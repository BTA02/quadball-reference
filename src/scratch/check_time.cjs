const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const csvContent = fs.readFileSync(path.join(__dirname, '../example/Stats.csv'), 'utf8');
const records = parse(csvContent, { columns: true, skip_empty_lines: true });

let allZeros = true;
for (const r of records) {
  if (parseInt(r.videoTime) > 0) {
    allZeros = false;
    break;
  }
}
console.log("All videoTimes are 0?", allZeros);
console.log("First 3 records videoTime:", records.slice(0,3).map(r => r.videoTime));
