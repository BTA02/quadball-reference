import * as fs from 'fs';
import * as csv from 'csv-parse/sync';
import * as path from 'path';

// Types
interface LegacyEvent {
  objectId: string;
  fall_year: string;
  vid_id: string;
  ACL: string;
  bludger_count: string;
  time: string;
  updatedAt: string;
  author_id: string;
  stat_name: string;
  player_in_id: string;
  player_id: string;
  createdAt: string;
  team_id: string;
}

const STATS_FILE = path.join(process.cwd(), 'src/example/Stats.csv');
const TEAMS_FILE = path.join(process.cwd(), '../src/example/Teams.csv');
const VIDEOS_FILE = path.join(process.cwd(), '../src/example/Videos.csv');

function loadCsv<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return csv.parse(content, { columns: true, skip_empty_lines: true }) as T[];
}

function runAudit() {
  console.log('--- LEGACY DATA AUDIT ---');
  
  const stats = loadCsv<LegacyEvent>(STATS_FILE);
  console.log(`Total Events Loaded: ${stats.length}`);

  const eventCounts: Record<string, number> = {};
  const takeawayTeams: Record<string, number> = {};
  let missingTeamIdCount = 0;
  let missingPlayerIdCount = 0;

  for (const event of stats) {
    const statName = event.stat_name || 'UNKNOWN';
    eventCounts[statName] = (eventCounts[statName] || 0) + 1;

    const teamId = event.team_id?.trim();
    if (!teamId) {
      missingTeamIdCount++;
    }

    const playerId = event.player_id?.trim();
    if (!playerId && statName !== 'START_CLOCK' && statName !== 'PAUSE_CLOCK' && statName !== 'AWAY_GOAL' && statName !== 'GAME_START') {
        missingPlayerIdCount++;
    }

    if (statName === 'TAKEAWAY') {
      const team = teamId || 'UNKNOWN_TEAM';
      takeawayTeams[team] = (takeawayTeams[team] || 0) + 1;
    }
  }

  console.log('\n--- Event Type Distribution ---');
  const sortedEvents = Object.entries(eventCounts).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedEvents) {
    console.log(`${type.padEnd(25)}: ${count}`);
  }

  console.log('\n--- Data Quality ---');
  console.log(`Events missing team_id: ${missingTeamIdCount}`);
  console.log(`Events unexpectedly missing player_id: ${missingPlayerIdCount}`);
  
  console.log('\n--- TAKEAWAY Analysis ---');
  console.log(`Total TAKEAWAYS: ${eventCounts['TAKEAWAY'] || 0}`);
  // We want to see if the team_id matches the player's team or the victim's team.
  // The user stated "TAKEAWAY events are recorded as the team that stole the ball, with the player_id being the player who made the steal."
  console.log(`Takeaway Team Contexts Found: ${Object.keys(takeawayTeams).length} distinct teams recorded a takeaway`);

  console.log('\nAudit Complete.');
}

runAudit();
