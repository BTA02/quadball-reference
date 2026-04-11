const fs = require('fs');

try {
  let appTsx = fs.readFileSync('src/App.tsx', 'utf-8');

  // 1. Remove demoData useState block
  const stateRegex = /\/\/ Demo data for when Firestore is unavailable\s*const \[demoData, setDemoData\] = useState<\{[\s\S]*?\} \| null>\(null\);/m;
  appTsx = appTsx.replace(stateRegex, '');

  // 2. Normalize stats mapping
  appTsx = appTsx.replace('const statsPlayers = demoData ? demoData.players : allPlayers;', 'const statsPlayers = allPlayers;');
  appTsx = appTsx.replace('const statsEventsRaw = demoData ? demoData.events : allEvents;', 'const statsEventsRaw = allEvents;');
  appTsx = appTsx.replace('const statsTeams = demoData ? demoData.teams : teams;', 'const statsTeams = teams;');
  appTsx = appTsx.replace('const statsGamesRaw = demoData ? demoData.games : games;', 'const statsGamesRaw = games;');
  appTsx = appTsx.replace('const statsSeasons = demoData ? demoData.seasons : seasons;', 'const statsSeasons = seasons;');
  appTsx = appTsx.replace('const statsVideos = demoData && demoData.videos.length > 0 ? demoData.videos : videos;', 'const statsVideos = videos;');

  appTsx = appTsx.replace('// Resolve which data to use for stats: demo data takes priority\n', '// Direct hooks to all unified Firebase stores\n');

  // 3. Remove demoId from useMemos for statsGames and statsEvents
  // I will just replace `const demoId = (import.meta as any).env?.VITE_DEMO_GAME_ID || 'demo-game-id';` with nothing
  // and `if (g.id === demoId) return true;` with nothing
  appTsx = appTsx.replace(/const demoId = \(import\.meta as any\)\.env\?\.VITE_DEMO_GAME_ID \|\| 'demo-game-id';\s*/g, '');
  appTsx = appTsx.replace(/\s*if \(g\.id === demoId\) return true;/g, '');
  appTsx = appTsx.replace(/\s*if \(e\.gameId === demoId\) return true;/g, '');

  // 4. In fetch events, we need to remove demo overrides
  // We have something like:
  /*
      const demoId = (import.meta as any).env?.VITE_DEMO_GAME_ID || 'demo-game-id';
      let eventDocs: QueryDocumentSnapshot[] = [];

      if (!user && currentVideo.gameId !== demoId) {
        // Unauthorized users (unauthenticated OR signed in without permissions) only get demo
        const eventsSnap = await getDoc(doc(db, 'gameEvents', demoId));
  */
  // Let's replace `if (!user && currentVideo.gameId !== demoId) {` with `if (!user) {`
  appTsx = appTsx.replace(/if \(!user && currentVideo\.gameId !== demoId\) \{/g, 'if (!user) {');
  appTsx = appTsx.replace(/\.filter\(e => e\.gameId === demoId \|\| !e\.userId \|\| e\.userId === uId\)/g, '.filter(e => !e.userId || e.userId === uId)');

  // 5. Remove 'setDemoData' and the file drop UI code
  const uploadUI1 = /<span className=\{demoData \? 'text-amber-500' : 'text-green-500'\}>● \{demoData \? 'Demo CSV' : 'Firestore'\}<\/span>/;
  appTsx = appTsx.replace(uploadUI1, '<span className="text-green-500">● Firestore</span>');

  const fileDropBlock = /\{!demoData && \(\s*<label[\s\S]*?<\/label>\s*\)\}/;
  appTsx = appTsx.replace(fileDropBlock, '');

  fs.writeFileSync('src/App.tsx', appTsx);
  console.log("App.tsx demo removal processed.");
} catch(e) {
  console.error(e);
}
