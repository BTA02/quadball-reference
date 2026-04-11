const fs = require('fs');

// 1. Fix GameCastView borders
let gameCast = fs.readFileSync('src/components/GameCastView.tsx', 'utf-8');
gameCast = gameCast.replace(
  '"flex flex-col text-xs p-2.5 rounded-lg shadow-sm border transition-all",\n                  poss.isHome ? "bg-red-50/50 border-red-100" : "bg-blue-50/50 border-blue-100"',
  '"flex flex-col text-xs p-2.5 rounded-lg shadow-sm bg-transparent border-l-4 border-r border-y border-r-gray-200 border-y-gray-200 transition-all",\n                  poss.isHome ? "border-l-red-500" : "border-l-blue-500"'
);
fs.writeFileSync('src/components/GameCastView.tsx', gameCast);

// 2. Fix App.tsx statsGames logic
let appTsx = fs.readFileSync('src/App.tsx', 'utf-8');

appTsx = appTsx.replace(
  'const targetGamesLogic = `const statsGames = useMemo(() => {', // wait, my previous node script was update_app.cjs which had const targetGamesLogic, but now I'm editing App.tsx directly.
  ''
);

// I will parse App.tsx instead
const currentSeasonRegex = /const currentSeasonId = "([^"]+)";/;
// Let's replace the whole statsGames and statsEvents blocks cleanly

const targetEventsBlock = `const statsEvents = useMemo(() => {
    let evs = Array.from(statsEventsRaw.values());
    if (statsFilter === 'verified') evs = evs.filter(e => e.status === 'verified');

    const demoId = (import.meta as any).env?.VITE_DEMO_GAME_ID || 'demo-game-id';
    
    // Dynamic resolution of the 2025 USQ season
    const currentSeasonObj = statsSeasons.find(s => (s.name || '').toLowerCase().includes('2025'));
    const currentSeasonId = currentSeasonObj ? currentSeasonObj.id : "2024-2025";
    
    if (!user) {
      evs = evs.filter(e => {
        const game = statsGames.find(g => g.id === e.gameId);
        if (e.gameId === demoId) return true;
        if (game && game.seasonId !== currentSeasonId) return true;
        return false;
      });
    } else {
      const isTrusted = userRoles.trusted?.includes(user.email || '');
      if (!isTrusted) {
        evs = evs.filter(e => {
          const game = statsGames.find(g => g.id === e.gameId);
          if (e.gameId === demoId) return true;
          if (e.userId === user.uid) return true;
          if (game && game.seasonId !== currentSeasonId) return true;
          return false;
        });
      }
    }

    const validGameIds = new Set(statsGames.map(g => g.id));
    return evs.filter(e => validGameIds.has(e.gameId));
  }, [statsEventsRaw, statsFilter, statsGames, user, userRoles, statsSeasons]);`;

const targetGamesBlock = `const statsGames = useMemo(() => {
    const demoId = (import.meta as any).env?.VITE_DEMO_GAME_ID || 'demo-game-id';
    
    // Dynamic resolution of the 2025 USQ season for game-level filtering
    const currentSeasonObj = statsSeasons.find(s => (s.name || '').toLowerCase().includes('2025'));
    const currentSeasonId = currentSeasonObj ? currentSeasonObj.id : "2024-2025";

    return statsGamesRaw.filter(g => {
      // 1. Strip legacy entirely
      if (legacySeasonIds.has(g.seasonId)) return false;

      // 2. Hide current season games from guests / non-authors
      if (!user) {
         if (g.id === demoId) return true;
         if (g.seasonId !== currentSeasonId) return true;
         return false; // hide current season completely from guests so it drops from Continue Tracking
      } else {
         const isTrusted = userRoles.trusted?.includes(user.email || '');
         if (!isTrusted) {
            if (g.id === demoId) return true;
            if (g.authorId === user.uid) return true; // Author can see their own
            if (g.seasonId !== currentSeasonId) return true;
            return false;
         }
      }
      return true; // Trusted admins see everything
    });
  }, [statsGamesRaw, legacySeasonIds, user, userRoles, statsSeasons]);`;

const eventsLogicRegex = /const statsEvents = useMemo\(\(\) => \{[\s\S]*?\}, \[statsEventsRaw, statsFilter, statsGames, user, userRoles\]\);/;
const gamesLogicRegex = /const statsGames = useMemo\(\(\) => \{[\s\S]*?\}, \[statsGamesRaw, legacySeasonIds\]\);/;

appTsx = appTsx.replace(eventsLogicRegex, targetEventsBlock);
appTsx = appTsx.replace(gamesLogicRegex, targetGamesBlock);

fs.writeFileSync('src/App.tsx', appTsx);
console.log("Patches applied!");
