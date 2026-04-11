const fs = require('fs');

try {
  let code = fs.readFileSync('src/App.tsx', 'utf-8');

  const s1 = '{/* Start New Video */}';
  const s2 = '{/* Continue Existing */}';
  const s3 = '{/* Verified Games */}';
  const s4 = '\n            </div>\n          </div>\n\n        ) : (\n          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">';

  let idx1 = code.indexOf(s1);
  let idx2 = code.indexOf(s2);
  let idx3 = code.indexOf(s3);
  let idx4 = code.indexOf(s4);

  if (idx1 === -1 || idx2 === -1 || idx3 === -1 || idx4 === -1) {
    console.log('Error: Could not find indices');
    process.exit(1);
  }

  const before = code.substring(0, idx1);
  const startTracking = code.substring(idx1, idx2);
  const continueTracking = code.substring(idx2, idx3);
  const verifiedGames = code.substring(idx3, idx4);
  const after = code.substring(idx4);

  let newStartTracking = startTracking.replace('{[\'author\', \'trusted\'].includes(effectiveRole) && (\\n', '');
  newStartTracking = newStartTracking.replace('{[\'author\', \'trusted\'].includes(effectiveRole) && (\n', '');
  newStartTracking = newStartTracking.replace(/\n\s*\)\}\n\s*$/, '\n              ');
  newStartTracking = newStartTracking.replace(
    'Paste a video link and set the matchup details.</p>',
    'Paste a link to start tracking. <strong className="text-red-600 font-bold block mt-1">Check existing sessions first!</strong></p>'
  );

  let newBefore = before.replace(
    '<div className={cn("grid grid-cols-1 gap-8 items-start", (effectiveRole === \'author\' || effectiveRole === \'trusted\') ? "lg:grid-cols-3 md:grid-cols-2" : "md:grid-cols-2 max-w-4xl mx-auto")}>',
    '<div className="grid grid-cols-1 lg:grid-cols-3 md:grid-cols-2 gap-8 items-start max-w-7xl mx-auto">'
  );

  const newCode = newBefore + continueTracking + verifiedGames + newStartTracking + after;

  fs.writeFileSync('src/App.tsx', newCode);
  console.log('Reordered UI blocks');
} catch (e) {
  console.log(e);
}
