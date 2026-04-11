const fs = require('fs');

try {
  let code = fs.readFileSync('src/App.tsx', 'utf-8');

  // Remove 'legacy' from the statsFilter useState type
  code = code.replace(
    "const [statsFilter, setStatsFilter] = useState<'all' | 'verified' | 'legacy'>('all');",
    "const [statsFilter, setStatsFilter] = useState<'all' | 'verified'>('all');"
  );
  
  // Also remove it from the selector tabs on Watch and Contribute (line ~3097)
  code = code.replace(
    "{(['verified', 'all', 'legacy'] as const).map(option => (",
    "{(['verified', 'all'] as const).map(option => ("
  );

  // Remove the rendering of "(legacy)" in stats length text
  code = code.replace(
    "{statsEvents.length.toLocaleString()} events{statsFilter === 'verified' ? ' (verified)' : statsFilter === 'legacy' ? ' (legacy)' : ''}",
    "{statsEvents.length.toLocaleString()} events{statsFilter === 'verified' ? ' (verified)' : ''}"
  );

  // Update legacySeasonIds: everything before 2021 is legacy. (already <= 2020)
  
  // 1. Unsigned in users can't add any games
  // Wrapping "Start Tracking New Video" conditionally.
  // Look for: {/* Start New Video */}
  const startVideoIdx = code.indexOf('{/* Start New Video */}');
  const startPanelRegex = /<div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">[\s\S]*?(?=<\/div>\n\n\s*\{\/\*(?: Continue Existing| Verified Games)\b)/;
  
  const startMatch = code.match(startPanelRegex);
  if (startMatch) {
    const wrappedStr = `
                {effectiveRole === 'author' || effectiveRole === 'trusted' ? (
                  ${startMatch[0].replace(/\n/g, '\n                  ')}
                ) : (
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-8 flex flex-col justify-center items-center text-center">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Want to Contribute?</h3>
                    <p className="text-sm text-gray-500 mb-6 font-medium">Log in to start tracking new games and uploading events.</p>
                    <button onClick={() => setShowAuthModal(true)} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-sm">
                      Sign In to Track
                    </button>
                  </div>
                )}`;
    // Only replace the actual element
    code = code.replace(startMatch[0], wrappedStr);
  }

  // 3 & 4: Modern seasons and current season logic
  // Update statsGames and statsEvents
  const gamesLogicRegex = /const statsGames = useMemo\(\(\) => \{[\s\S]*?\}, \[statsGamesRaw, statsFilter, legacySeasonIds\]\);/;
  const eventsLogicRegex = /const statsEvents = useMemo\(\(\) => \{[\s\S]*?\}, \[statsEventsRaw, statsFilter, statsGames, user, userRoles\]\);/;
  
  const targetGamesLogic = `const statsGames = useMemo(() => {
    // legacy filter always active implicitly since we removed the option from UI
    return statsGamesRaw.filter(g => !legacySeasonIds.has(g.seasonId));
  }, [statsGamesRaw, legacySeasonIds]);`;

  const targetEventsLogic = `const statsEvents = useMemo(() => {
    let evs = Array.from(statsEventsRaw.values());
    if (statsFilter === 'verified') evs = evs.filter(e => e.status === 'verified');

    const validGameIds = new Set(statsGames.map(g => g.id));
    evs = evs.filter(e => validGameIds.has(e.gameId));

    const demoId = (import.meta as any).env?.VITE_DEMO_GAME_ID || 'demo-game-id';
    const currentSeasonId = "2024-2025"; // Hardcoded assumption based on quadball context
    
    // We filter individually explicitly for Current Season.
    // Modern seasons (< Current Season) are public.
    if (!user) {
      evs = evs.filter(e => {
        const game = statsGames.find(g => g.id === e.gameId);
        // public if it's the demo game
        if (e.gameId === demoId) return true;
        // public if it's a past modern season
        if (game && game.seasonId !== currentSeasonId) return true;
        return false;
      });
    } else {
      const isTrusted = userRoles.trusted?.includes(user.email || '');
      if (!isTrusted) {
        evs = evs.filter(e => {
          const game = statsGames.find(g => g.id === e.gameId);
          if (e.gameId === demoId) return true;
          if (e.userId === user.uid) return true; // authors can see their own
          if (game && game.seasonId !== currentSeasonId) return true; // public past stats
          return false;
        });
      }
    }

    return evs;
  }, [statsEventsRaw, statsFilter, statsGames, user, userRoles]);`;

  code = code.replace(gamesLogicRegex, targetGamesLogic);
  code = code.replace(eventsLogicRegex, targetEventsLogic);

  fs.writeFileSync('src/App.tsx', code);
  console.log("App.tsx rewritten");
} catch(e) {
  console.error(e);
}
