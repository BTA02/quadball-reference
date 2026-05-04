const fs = require('fs');
let code = fs.readFileSync('src/components/PlayerProfileView.tsx', 'utf-8');

// Advanced Headers
code = code.replace(
  /<QuadHeaderCell label="MIN" sortKey="minutesPlayed" \/>\s*<QuadHeaderCell label="POSS" sortKey="possessions" \/>\s*<QuadHeaderCell label="USG%" sortKey="usgPct" \/>\s*<QuadHeaderCell label="oRTG" sortKey="oRtg" \/>\s*<QuadHeaderCell label="dRTG" sortKey="dRtg" \/>\s*<QuadHeaderCell label="NET" sortKey="netRtg" \/>\s*<QuadHeaderCell label="eOff" sortKey="eOff" \/>\s*<QuadHeaderCell label="eDef" sortKey="eDef" \/>\s*<QuadHeaderCell label="GmSc" sortKey="gameScore" \/>/g,
  `<QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="POSS" sortKey="teamPossessions" />
                      <QuadHeaderCell label="USG%" sortKey="usgPct" />
                      <QuadHeaderCell label="ORTG" sortKey="oRtg" />
                      <QuadHeaderCell label="DRTG" sortKey="dRtg" />
                      <QuadHeaderCell label="NET" sortKey="netRtg" />
                      <QuadHeaderCell label="eOFF" sortKey="eOff" />
                      <QuadHeaderCell label="eDEF" sortKey="eDef" />
                      <QuadHeaderCell label="GmSc" sortKey="gameScore" />`
);

// Advanced Cells
code = code.replace(
  /<QuadCell sortKey="minutesPlayed" value=\{quadStats\.minutesPlayed\} \/>\s*<QuadCell sortKey="possessions" value=\{quadStats\.possessions\} \/>\s*<QuadCell sortKey="usgPct" value=\{quadStats\.usgPct\} \/>\s*<QuadCell sortKey="oRtg" value=\{quadStats\.oRtg\} \/>\s*<QuadCell sortKey="dRtg" value=\{quadStats\.dRtg\} \/>\s*<QuadCell sortKey="netRtg" value=\{quadStats\.netRtg\} bold highlight=\{quadStats\.netRtg > 0 \? 'pos' : quadStats\.netRtg < 0 \? 'neg' : undefined\} \/>\s*<QuadCell sortKey="eOff" value=\{quadStats\.eOff\} highlight=\{quadStats\.eOff > 45 \? 'pos' : undefined\} \/>\s*<QuadCell sortKey="eDef" value=\{quadStats\.eDef\} highlight=\{quadStats\.eDef < 30 \? 'pos' : quadStats\.eDef > 50 \? 'neg' : undefined\} \/>\s*<QuadCell sortKey="gameScore" value=\{quadStats\.gameScore\} \/>/g,
  `<QuadCell sortKey="minutesPlayed" value={quadStats.minutesPlayed} />
                      <QuadCell sortKey="teamPossessions" value={quadStats.teamPossessions} />
                      <QuadCell sortKey="usgPct" value={quadStats.usgPct} />
                      <QuadCell sortKey="oRtg" value={quadStats.oRtg} />
                      <QuadCell sortKey="dRtg" value={quadStats.dRtg} />
                      <QuadCell sortKey="netRtg" value={quadStats.netRtg} bold highlight={quadStats.netRtg > 0 ? 'pos' : quadStats.netRtg < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="eOff" value={quadStats.eOff} highlight={quadStats.eOff > 45 ? 'pos' : undefined} />
                      <QuadCell sortKey="eDef" value={quadStats.eDef} highlight={quadStats.eDef < 30 ? 'pos' : quadStats.eDef > 50 ? 'neg' : undefined} />
                      <QuadCell sortKey="gameScore" value={quadStats.gameScore} />`
);

// PlusMinus Headers
code = code.replace(
  /<QuadHeaderCell label="MIN" sortKey="minutesPlayed" \/>\s*<QuadHeaderCell label="GF" sortKey="goalsFor" \/>\s*<QuadHeaderCell label="GA" sortKey="goalsAgainst" \/>\s*<QuadHeaderCell label="\+" sortKey="plus" \/>\s*<QuadHeaderCell label="-" sortKey="minus" \/>\s*<QuadHeaderCell label="\+\/-" sortKey="plusMinus" \/>\s*<QuadHeaderCell label="\+\/- \/ 20" sortKey="plusMinusPerTwenty" \/>\s*<QuadHeaderCell label="EPR" sortKey="epr" \/>\s*<QuadHeaderCell label="fEPR" sortKey="fEpr" \/>/g,
  `<QuadHeaderCell label="MIN" sortKey="minutesPlayed" />
                      <QuadHeaderCell label="+" sortKey="plus" />
                      <QuadHeaderCell label="−" sortKey="minus" />
                      <QuadHeaderCell label="+/−" sortKey="plusMinus" />
                      <QuadHeaderCell label="RATIO" sortKey="plusMinusRatio" />
                      <QuadHeaderCell label="OFF +/−" sortKey="offPlusMinus" />
                      <QuadHeaderCell label="ON/OFF" sortKey="onOffDt" />
                      <QuadHeaderCell label="REL RATIO" sortKey="relPlusMinusRatio" />
                      <QuadHeaderCell label="EPR" sortKey="epr" />
                      <QuadHeaderCell label="fEPR" sortKey="fEpr" />`
);

// PlusMinus Cells
code = code.replace(
  /<QuadCell sortKey="minutesPlayed" value=\{quadStats\.minutesPlayed\} \/>\s*<QuadCell sortKey="goalsFor" value=\{quadStats\.goalsFor\} \/>\s*<QuadCell sortKey="goalsAgainst" value=\{quadStats\.goalsAgainst\} \/>\s*<QuadCell sortKey="plus" value=\{quadStats\.plus\} \/>\s*<QuadCell sortKey="minus" value=\{quadStats\.minus\} \/>\s*<QuadCell sortKey="plusMinus" value=\{quadStats\.plusMinus\} bold highlight=\{quadStats\.plusMinus > 0 \? 'pos' : quadStats\.plusMinus < 0 \? 'neg' : undefined\} \/>\s*<QuadCell sortKey="plusMinusPerTwenty" value=\{quadStats\.plusMinusPerTwenty\} \/>\s*<QuadCell sortKey="epr" value=\{quadStats\.epr\} \/>\s*<QuadCell sortKey="fEpr" value=\{quadStats\.fEpr\} \/>/g,
  `<QuadCell sortKey="minutesPlayed" value={quadStats.minutesPlayed} />
                      <QuadCell sortKey="plus" value={quadStats.plus} />
                      <QuadCell sortKey="minus" value={quadStats.minus} />
                      <QuadCell sortKey="plusMinus" value={quadStats.plusMinus} bold highlight={quadStats.plusMinus > 0 ? 'pos' : quadStats.plusMinus < 0 ? 'neg' : undefined} />
                      <QuadCell sortKey="plusMinusRatio" value={quadStats.plusMinusRatio} />
                      <QuadCell sortKey="offPlusMinus" value={quadStats.offPlusMinus} />
                      <QuadCell sortKey="onOffDt" value={quadStats.onOffDt} />
                      <QuadCell sortKey="relPlusMinusRatio" value={quadStats.relPlusMinusRatio} />
                      <QuadCell sortKey="epr" value={quadStats.epr} />
                      <QuadCell sortKey="fEpr" value={quadStats.fEpr} />`
);

fs.writeFileSync('src/components/PlayerProfileView.tsx', code);
console.log('Fixed profile view columns');
