const fs = require('fs');
let code = fs.readFileSync('src/components/QuadballStatsView.tsx', 'utf-8');

// 1. Reorder Tabs and rename "Advanced Ratings" to "Advanced"
code = code.replace(
  '<StatsTabButton active={tab === \'advanced\'} onClick={() => { setTab(\'advanced\'); setSortKey(\'gameScore\'); setSortDir(\'desc\'); }} label="Advanced Ratings" />\n            <StatsTabButton active={tab === \'plusminus\'} onClick={() => { setTab(\'plusminus\'); setSortKey(\'plusMinus\'); setSortDir(\'desc\'); }} label="Plus/Minus" />',
  '<StatsTabButton active={tab === \'plusminus\'} onClick={() => { setTab(\'plusminus\'); setSortKey(\'plusMinus\'); setSortDir(\'desc\'); }} label="Plus/Minus" />\n            <StatsTabButton active={tab === \'advanced\'} onClick={() => { setTab(\'advanced\'); setSortKey(\'gameScore\'); setSortDir(\'desc\'); }} label="Advanced" />'
);

// 2. Remove eOFF and eDEF from Headers, Add RAPM
const oldAdvHeaders = `<HeaderCell label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Net Rating" />
                  <HeaderCell label="eOFF" sortKey="eOff" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Expected Offense (Possession Score)" />
                  <HeaderCell label="eDEF" sortKey="eDef" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Expected Defense (Opponent Possession Score)" />
                  <HeaderCell label="GmSc" sortKey="gameScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Game Score Rating per 20 Minutes" />`;

const newAdvHeaders = `<HeaderCell label="NET" sortKey="netRtg" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Net Rating" />
                  <HeaderCell label="RAPM" sortKey="rapm" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Regularized Adjusted Plus-Minus" />
                  <HeaderCell label="GmSc" sortKey="gameScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} tooltip="Game Score Rating per 20 Minutes" />`;

code = code.replace(oldAdvHeaders, newAdvHeaders);

// 3. Remove eOff and eDef from Cells, Add RAPM
const oldAdvCells = `<Cell sortKey="netRtg" value={s.netRtg} bold highlight={s.netRtg > 0 ? 'pos' : s.netRtg < 0 ? 'neg' : undefined} />
                    <Cell sortKey="eOff" value={s.eOff} highlight={s.eOff > 45 ? 'pos' : undefined} />
                    <Cell sortKey="eDef" value={s.eDef} highlight={s.eDef < 30 ? 'pos' : s.eDef > 50 ? 'neg' : undefined} />
                    <Cell sortKey="gameScore" value={s.gameScore} />`;

const newAdvCells = `<Cell sortKey="netRtg" value={s.netRtg} bold highlight={s.netRtg > 0 ? 'pos' : s.netRtg < 0 ? 'neg' : undefined} />
                    <Cell sortKey="rapm" value={s.rapm} bold highlight={s.rapm > 0 ? 'pos' : s.rapm < 0 ? 'neg' : undefined} />
                    <Cell sortKey="gameScore" value={s.gameScore} />`;

code = code.replace(oldAdvCells, newAdvCells);

fs.writeFileSync('src/components/QuadballStatsView.tsx', code);
console.log('Fixed QuadballStatsView.');
