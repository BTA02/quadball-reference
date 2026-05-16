const fs = require('fs');
const csv = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const path = require('path');
const DATA_DIR = path.join(process.cwd(), 'src/example');
const STATS_FILE = path.join(DATA_DIR, 'Stats.csv');
const VIDEOS_FILE = path.join(DATA_DIR, 'Videos.csv');
const OUT_FILE = path.join(process.cwd(), 'scripts/CleanedStats.csv');
function loadCsv(filePath) {
    if (!fs.existsSync(filePath))
        return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    return csv.parse(content, { columns: true, skip_empty_lines: true });
}
function runMigration() {
    var _a, _b, _c;
    console.log('--- STARTING LEGACY DATA MIGRATION SIMULATION ---');
    const stats = loadCsv(STATS_FILE);
    const videosArray = loadCsv(VIDEOS_FILE);
    // Build game context map
    const videos = new Map();
    for (const v of videosArray) {
        videos.set(v.vid_id, v);
    }
    const cleanedEvents = [];
    let droppedCount = 0;
    let takeawayFlipCount = 0;
    let subSplitCount = 0;
    let teamInferredCount = 0;
    let gameEndGeneratedCount = 0;
    // Group events by video to allow timeline-based processing (like sorting by time)
    const eventsByVideo = new Map();
    for (const ev of stats) {
        if (!eventsByVideo.has(ev.vid_id))
            eventsByVideo.set(ev.vid_id, []);
        eventsByVideo.get(ev.vid_id).push(ev);
    }
    for (const [vid_id, gameEvents] of eventsByVideo.entries()) {
        const videoContext = videos.get(vid_id);
        const homeTeamId = ((_a = videoContext === null || videoContext === void 0 ? void 0 : videoContext.team_id) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        const awayTeamId = ((_b = videoContext === null || videoContext === void 0 ? void 0 : videoContext.opponent_id) === null || _b === void 0 ? void 0 : _b.trim()) || null;
        // Sort by time
        const sorted = [...gameEvents].sort((a, b) => parseFloat(a.time || '0') - parseFloat(b.time || '0'));
        let hasFlagCatch = false;
        let lastEventTime = 0;
        for (let i = 0; i < sorted.length; i++) {
            const ev = sorted[i];
            let statName = (ev.stat_name || '').trim();
            let teamId = (ev.team_id || '').trim();
            const time = parseFloat(ev.time || '0');
            lastEventTime = Math.max(lastEventTime, time);
            // 1. DROPS
            const DROP_TYPES = new Set(['DEFENSE', 'OFFENSE', 'SWAP', 'SEEKERS_RELEASED', 'ZERO_BLUDGERS_FORCED', 'ZERO_BLUDGERS_GIVEN', 'ZERO_BLUDGERS_SURRENDERED', 'LOSE_CONTROL', 'OFFENSIVE_DRIVE', 'DEFENSIVE_DRIVE']);
            if (DROP_TYPES.has(statName)) {
                droppedCount++;
                continue;
            }
            // 2. RENAMES & NORMALIZATION
            if (statName === 'START_CLOCK' || statName === 'GAME_START')
                statName = 'gameStart';
            if (statName === 'PAUSE_CLOCK')
                statName = 'gamePause';
            if (statName === 'TURNOVER')
                statName = 'turnover';
            if (statName === 'GAIN_CONTROL')
                statName = 'control_change';
            if (statName === 'ASSIST')
                statName = 'assist';
            if (statName === 'SHOT')
                statName = 'shot';
            if (statName === 'YELLOW_CARD')
                statName = 'card'; // Should add color='yellow'
            if (statName === 'RED_CARD')
                statName = 'card'; // Should add color='red'
            if (statName === 'GOAL')
                statName = 'goal';
            if (statName === 'AWAY_GOAL') {
                statName = 'goal';
                if (awayTeamId)
                    teamId = awayTeamId;
            }
            if (statName === 'SNITCH_CATCH') {
                statName = 'flag_catch';
                hasFlagCatch = true;
            }
            if (statName === 'AWAY_SNITCH_CATCH') {
                statName = 'flag_catch';
                hasFlagCatch = true;
                if (awayTeamId)
                    teamId = awayTeamId;
            }
            // Clear team/player for clock events
            if (statName === 'gameStart' || statName === 'gamePause' || statName === 'gameEnd') {
                ev.team_id = '';
                ev.player_id = '';
                ev.player_in_id = '';
                teamId = '';
            }
            // 3. BACKFILL MISSING TEAM IDs
            if (!teamId && homeTeamId && statName !== 'gameStart' && statName !== 'gamePause' && statName !== 'gameEnd') {
                // Simple heuristic: default to home team if missing (especially for goals)
                teamId = homeTeamId;
                teamInferredCount++;
            }
            // 4. TAKEAWAY -> turnover (flip team, drop player)
            if (statName === 'TAKEAWAY') {
                statName = 'turnover';
                // Flip team
                if (teamId === homeTeamId && awayTeamId) {
                    teamId = awayTeamId;
                    takeawayFlipCount++;
                }
                else if (teamId === awayTeamId && homeTeamId) {
                    teamId = homeTeamId;
                    takeawayFlipCount++;
                }
                // Drop player since we don't know who on the opposing team actually turned it over
                ev.player_id = '';
            }
            // 5. SUB SPLITTING
            if (statName === 'SUB') {
                subSplitCount++;
                const outPlayerId = (ev.player_id || '').trim();
                const inPlayerId = (ev.player_in_id || '').trim();
                // Resolve placeholders
                const isPlaceholder = ['chasera', 'chaserb', 'chaserc', 'keeper', 'beatera', 'beaterb', 'seeker'].includes(outPlayerId.toLowerCase());
                const resolvedPos = isPlaceholder ? outPlayerId.toLowerCase().replace(/[abc]$/, '') : '';
                // Create SUB_OUT
                if (outPlayerId && !isPlaceholder) {
                    cleanedEvents.push(Object.assign(Object.assign({}, ev), { objectId: ev.objectId + '_out', stat_name: 'sub_out', team_id: teamId, player_id: outPlayerId, player_in_id: '', position: resolvedPos }));
                }
                // Create SUB_IN
                if (inPlayerId) {
                    cleanedEvents.push(Object.assign(Object.assign({}, ev), { objectId: ev.objectId + '_in', stat_name: 'sub_in', team_id: teamId, player_id: inPlayerId, player_in_id: '', position: resolvedPos }));
                }
                continue; // Skip pushing the original SUB event
            }
            // Add normal event
            cleanedEvents.push(Object.assign(Object.assign({}, ev), { stat_name: statName, team_id: teamId, color: ev.stat_name === 'YELLOW_CARD' ? 'yellow' : ev.stat_name === 'RED_CARD' ? 'red' : undefined }));
        }
        // 6. GENERATE GAME_END
        if (hasFlagCatch) {
            cleanedEvents.push({
                objectId: `sim_end_${vid_id}`,
                vid_id: vid_id,
                fall_year: (_c = gameEvents[0]) === null || _c === void 0 ? void 0 : _c.fall_year,
                time: (lastEventTime + 5).toString(), // 5 seconds after last event
                stat_name: 'gameEnd',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                team_id: '',
                player_id: '',
                player_in_id: '',
            });
            gameEndGeneratedCount++;
        }
    }
    // Write out cleaned data
    const outputContent = stringify(cleanedEvents, { header: true });
    fs.writeFileSync(OUT_FILE, outputContent);
    console.log('\\n--- MIGRATION RESULTS ---');
    console.log(`Original Events: ${stats.length}`);
    console.log(`Events Dropped : ${droppedCount}`);
    console.log(`SUBs Split     : ${subSplitCount}`);
    console.log(`Takeaways Flip : ${takeawayFlipCount}`);
    console.log(`Teams Inferred : ${teamInferredCount}`);
    console.log(`GameEnds Gen   : ${gameEndGeneratedCount}`);
    console.log(`Final Events   : ${cleanedEvents.length}`);
    console.log(`\\nCleaned CSV written to: ${OUT_FILE}`);
}
runMigration();
