const fs = require('fs');
let code = fs.readFileSync('src/lib/statsComputations.ts', 'utf-8');

// There are two "const rapmScores = computeRAPM(events, players, games, filters);"
// Let's replace the first one inside computeAdvancedStats
const target = 'const rapmScores = computeRAPM(events, players, games, filters);\n  const playerMap = new Map<string, Player>();';
code = code.replace(target, 'const playerMap = new Map<string, Player>();');

fs.writeFileSync('src/lib/statsComputations.ts', code);
console.log('Fixed double rapm computation.');
