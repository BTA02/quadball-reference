const fs = require('fs');
const events = JSON.parse(fs.readFileSync('ai_extracted_events.json'));
let digmannGames = new Set();
let digmannStints = [];
events.forEach(e => {
  if (e.playerId && e.playerId.toLowerCase().includes('digman')) {
    digmannGames.add(e.gameId);
    if (e.type === 'sub_in' || e.type === 'sub_out') {
      digmannStints.push(e);
    }
  }
});
console.log("Digmann true game count:", digmannGames.size);
console.log("Games:", Array.from(digmannGames));
