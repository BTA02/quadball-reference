const fs = require('fs');

const code = fs.readFileSync('src/App.tsx', 'utf-8');

// The exact string where the grid starts
const gridStartStr = `            <div className={cn("grid grid-cols-1 gap-8 items-start", (effectiveRole === 'author' || effectiveRole === 'trusted') ? "lg:grid-cols-3 md:grid-cols-2" : "md:grid-cols-2 max-w-4xl mx-auto")}>`;

const searchStart = code.indexOf(gridStartStr);

if (searchStart === -1) {
  console.log("Error: Grid start not found");
  process.exit(1);
}

// Find all the blocks inside this grid
// Block 1: Start New Video
const start1 = searchStart + gridStartStr.length;
const startNewVideoRegex = /\s*\{\/\* Start New Video \*\/\}\n\s*\{\['author', 'trusted'\]\.includes\(effectiveRole\) && \([\s\S]*?(?=\s*\{\/\* Continue Existing \*\/\})/;
const match1 = code.match(startNewVideoRegex);

const continueRegex = /\s*\{\/\* Continue Existing \*\/\}\n\s*<div[\s\S]*?(?=\s*\{\/\* Verified Games \*\/\})/;
const match2 = code.match(continueRegex);

const verifiedRegex = /\s*\{\/\* Verified Games \*\/\}\n\s*<div[\s\S]*?(?=\s*<\/div>\n\s*<\/div>\n\n\s*\) : \()/;
const match3 = code.match(verifiedRegex);

if (!match1 || !match2 || !match3) {
  console.log("Error: Could not extract the three blocks.");
  process.exit(1);
}

// Rewriting Block 1 (Start New Video) to remove the restriction and add a note
let startNewVideoCleaned = match1[0]
  .replace(/\{\['author', 'trusted'\]\.includes\(effectiveRole\) && \(\n?/, '')
  .replace(/\n\s*\)\}\n?$/, '\n')
  .replace(
    'Paste a video link and set the matchup details.',
    'Paste a video link and set the matchup details. <strong>Please check the session list to ensure it doesn\'t already exist!</strong>'
  );

// New grid container string
const newGridStartStr = `            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">`;

const fullReplacementMap = gridStartStr + match1[0] + match2[0] + match3[0];

const newLayout = newGridStartStr + match2[0] + startNewVideoCleaned + match3[0];

const finalCode = code.replace(fullReplacementMap, newLayout);

fs.writeFileSync('src/App.tsx', finalCode);
console.log("Successfully rewrote Watch and Contribute layout.");

