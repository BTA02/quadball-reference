const fs = require('fs');
let code = fs.readFileSync('src/components/PlayerProfileView.tsx', 'utf-8');

// 1. Re-order Quadball tabs
code = code.replace(
  '<StatsTabButton active={quadTab === \'advanced\'} onClick={() => setQuadTab(\'advanced\')} label="Advanced" />\n                <StatsTabButton active={quadTab === \'plusminus\'} onClick={() => setQuadTab(\'plusminus\')} label="Plus/Minus" />',
  '<StatsTabButton active={quadTab === \'plusminus\'} onClick={() => setQuadTab(\'plusminus\')} label="Plus/Minus" />\n                <StatsTabButton active={quadTab === \'advanced\'} onClick={() => setQuadTab(\'advanced\')} label="Advanced" />'
);

// 2. Headers: Remove eOFF and eDEF, Add RAPM
const oldAdvHeaders = `<QuadHeaderCell label="NET" sortKey="netRtg" />
                      <QuadHeaderCell label="eOFF" sortKey="eOff" />
                      <QuadHeaderCell label="eDEF" sortKey="eDef" />
                      <QuadHeaderCell label="GmSc" sortKey="gameScore" />`;

const newAdvHeaders = `<QuadHeaderCell label="NET" sortKey="netRtg" />
                      <QuadHeaderCell label="RAPM" sortKey="rapm" />
                      <QuadHeaderCell label="GmSc" sortKey="gameScore" />`;

code = code.replace(oldAdvHeaders, newAdvHeaders);

// 3. Cells: Remove eOff and eDef, Add RAPM
const oldAdvCells = `<QuadCell sortKey="netRtg" value={quadStats.netRtg} bold highlight={quadStats.netRtg > 0 ? 'pos' : quadStats.netRtg < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="eOff" value={quadStats.eOff} highlight={quadStats.eOff > 45 ? 'pos' : undefined} />
                      <QuadCell sortKey="eDef" value={quadStats.eDef} highlight={quadStats.eDef < 30 ? 'pos' : quadStats.eDef > 50 ? 'neg' : undefined} />
                      <QuadCell sortKey="gameScore" value={quadStats.gameScore} />`;

const newAdvCells = `<QuadCell sortKey="netRtg" value={quadStats.netRtg} bold highlight={quadStats.netRtg > 0 ? 'pos' : quadStats.netRtg < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="rapm" value={quadStats.rapm} bold highlight={quadStats.rapm > 0 ? 'pos' : quadStats.rapm < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="gameScore" value={quadStats.gameScore} />`;

code = code.replace(oldAdvCells, newAdvCells);

fs.writeFileSync('src/components/PlayerProfileView.tsx', code);
console.log('Fixed PlayerProfileView.');
