const fs = require('fs');

const code = fs.readFileSync('src/App.tsx', 'utf-8');

const s1 = '              {/* Start New Video */}';
const s2 = '              {/* Continue Existing */}';
const s3 = '              {/* Verified Games */}';
const s4 = '            </div>\n          </div>\n\n        ) : (';

let idx1 = code.indexOf(s1);
let idx2 = code.indexOf(s2);
let idx3 = code.indexOf(s3);
let idx4 = code.indexOf(s4);

if (idx1 === -1 || idx2 === -1 || idx3 === -1 || idx4 === -1) {
  console.log("Could not find markers.", idx1, idx2, idx3, idx4);
  process.exit(1);
}

const beforeBlocks = code.substring(0, idx1);
const blockStart = code.substring(idx1, idx2);
const blockContinue = code.substring(idx2, idx3);
const blockVerified = code.substring(idx3, idx4);
const afterBlocks = code.substring(idx4);

// Clean up blockStart (Start New Video)
let newBlockStart = blockStart
  .replace('{[\'author\', \'trusted\'].includes(effectiveRole) && (\\n', '')
  .replace('{[\'author\', \'trusted\'].includes(effectiveRole) && (\n', '');
  
// We also need to remove the trailing `)}`
newBlockStart = newBlockStart.replace(/\n\s*\)\}\n\s*$/, '\n');

// Also update the note
newBlockStart = newBlockStart.replace(
  'Paste a video link and set the matchup details.</p>',
  'Paste a link to start tracking. <strong className="text-red-600">Check the sessions list first to see if it exists!</strong></p>'
);

// We need to rewrite the grid class in beforeBlocks
let newBeforeBlocks = beforeBlocks.replace(
  '<div className={cn("grid grid-cols-1 gap-8 items-start", (effectiveRole === \'author\' || effectiveRole === \'trusted\') ? "lg:grid-cols-3 md:grid-cols-2" : "md:grid-cols-2 max-w-4xl mx-auto")}>',
  '<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start max-w-7xl mx-auto">'
);

// Put them together in new order: Continue -> Verified -> Start
const newCode = newBeforeBlocks + blockContinue + blockVerified + newBlockStart + afterBlocks;

fs.writeFileSync('src/App.tsx', newCode);
console.log("Success");
