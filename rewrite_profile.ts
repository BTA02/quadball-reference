import fs from 'fs';

const code = fs.readFileSync('src/components/PlayerProfileView.tsx', 'utf-8');

// Replace imports
let newCode = code.replace(
  "import { computeAdvancedStats, computeTeamQuadballStats, computeBeaterSoloStats, computeSeekerStats, AdvancedPlayerStats, getScoreboardName } from '../lib/statsComputations';",
  "import { computeAdvancedStats, computeTeamQuadballStats, computeBeaterSoloStats, computeBeaterPairStats, computeSeekerStats, AdvancedPlayerStats, getScoreboardName } from '../lib/statsComputations';"
);

newCode = newCode.replace(
  "import { \n  cn, SortDir, sortBy, SortHeader, Cell,\n  StatsTabSelector, StatsTabButton\n} from './ui/StatsTable';",
  "import { \n  cn, SortDir, sortBy, SortHeader, Cell, SplitHeader, SplitCell,\n  StatsTabSelector, StatsTabButton\n} from './ui/StatsTable';"
);

fs.writeFileSync('src/components/PlayerProfileView.tsx', newCode);
console.log('Imports updated');
