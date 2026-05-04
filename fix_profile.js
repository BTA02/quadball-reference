const fs = require('fs');
let code = fs.readFileSync('src/components/PlayerProfileView.tsx', 'utf-8');

// Replace computeAdvancedStats with computeExtendedStats
code = code.replace(/computeAdvancedStats/g, 'computeExtendedStats');

// Fix styling of table wrapper to match QuadballStatsView
const oldWrapper = '<div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">';
const newWrapper = '<div className="border border-gray-200 rounded-lg overflow-hidden bg-white"><div className="overflow-x-auto">';

// we only want to change the one around "Season Stats"
// wait, the easiest is to just find "Season Stats"
code = code.replace(
  '{/* Season Stats */}\n        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">',
  '{/* Season Stats */}\n        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white flex flex-col">'
);

fs.writeFileSync('src/components/PlayerProfileView.tsx', code);
console.log('Fixed computeExtendedStats');
