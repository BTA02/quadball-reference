const fs = require('fs');

try {
  let code = fs.readFileSync('src/App.tsx', 'utf-8');

  // 1. Remove legacy from dropdown filter state
  code = code.replace(
    "const [statsFilter, setStatsFilter] = useState<'all' | 'verified' | 'legacy'>('all');",
    "const [statsFilter, setStatsFilter] = useState<'all' | 'verified'>('all');"
  );
  
  // 2. Remove from actual stats filter UI
  code = code.replace(
    "{(['verified', 'all', 'legacy'] as const).map(option => (",
    "{(['verified', 'all'] as const).map(option => ("
  );

  // 3. Remove "(legacy)" from text
  code = code.replace(
    "{statsEvents.length.toLocaleString()} events{statsFilter === 'verified' ? ' (verified)' : statsFilter === 'legacy' ? ' (legacy)' : ''}",
    "{statsEvents.length.toLocaleString()} events{statsFilter === 'verified' ? ' (verified)' : ''}"
  );

  // 4. Update the "Start New Video" div wrapper so auth logic works.
  const oldDivStart = '<div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">';
  const divRegex = /<div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">\s*<div className="bg-gray-50\/50 border-b border-gray-100 p-5">\s*<h3 className="text-xl font-bold text-gray-900 flex items-center gap-3"><Play className="w-5 h-5 text-red-600" \/> Start Tracking New Video<\/h3>/;
  
  const formStr = code.match(/<div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">[\s\S]*?Start Tracking\n\s*<\/button>\n\s*<\/div>\n\s*<\/div>/);
  if (formStr) {
    const wrappedForm = `
                {effectiveRole === 'author' || effectiveRole === 'trusted' ? (
                  ${formStr[0].split('\\n').join('\\n                  ')}
                ) : (
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-8 flex flex-col justify-center items-center text-center">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Want to Contribute?</h3>
                    <p className="text-sm text-gray-500 mb-6 font-medium">Sign in to start tracking new games and uploading events.</p>
                  </div>
                )}`;
    code = code.replace(formStr[0], wrappedForm);
  }

  // 5. Update statsGames and statsEvents
  const gamesLogicRegex = /const statsGames = useMemo\(\(\) => \{[\s\S]*?\}, \[statsGamesRaw, statsFilter, legacySeasonIds\]\);/;
  const eventsLogicRegex = /const statsEvents = useMemo\(\(\) => \{[\s\S]*?\}, \[statsEventsRaw, statsFilter, statsGames, user, userRoles\]\);/;
  
  const targetGamesLogic = `const statsGames = useMemo(() => {
    return statsGamesRaw.filter(g => !legacySeasonIds.has(g.seasonId));
  }, [statsGamesRaw, legacySeasonIds]);`;

  const targetEventsLogic = `const statsEvents = useMemo(() => {
    let evs = Array.from(statsEventsRaw.values());
    if (statsFilter === 'verified') evs = evs.filter(e => e.status === 'verified');

    const demoId = (import.meta as any).env?.VITE_DEMO_GAME_ID || 'demo-game-id';
    const currentSeasonId = "2024-2025"; // Hardcoded assumption based on quadball context
    
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
  }, [statsEventsRaw, statsFilter, statsGames, user, userRoles]);`;

  code = code.replace(gamesLogicRegex, targetGamesLogic);
  code = code.replace(eventsLogicRegex, targetEventsLogic);

  // 6. Update trackingDropdown to filter out Legacy years as requested ("only modern seasons should be on the drop down")
  // Let's modify trackingYears to exclude legacy
  const trackingYearsRegex = /const trackingYears = Array\.from\(new Set\(statsVideos\.map\(v => \{\s*const g = statsGames\.find\(g => g\.id === v\.gameId\);\s*return g\?\.seasonId \|\| '';\s*\}\)\)\)\.filter\(Boolean\);/;
  const newTrackingYearsLogic = `const trackingYears = Array.from(new Set(statsVideos.map(v => {
    const g = statsGames.find(g => g.id === v.gameId);
    return g?.seasonId || '';
  }))).filter(y => y && !legacySeasonIds.has(y));`;
  
  code = code.replace(trackingYearsRegex, newTrackingYearsLogic);

  fs.writeFileSync('src/App.tsx', code);
  console.log("App.tsx rewritten successfully!");
} catch(e) {
  console.error(e);
}
