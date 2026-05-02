const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Since we cannot easily require statsComputations (it is TS and has ES6 syntax),
// I will just use ts-node to run a ts file.
