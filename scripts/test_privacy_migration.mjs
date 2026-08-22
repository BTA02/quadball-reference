/**
 * End-to-end rehearsal of migrate_privacy.cjs against the emulators.
 *
 * Run:  npm run test:migration
 * Seeds representative pre-migration data, runs the real script with --commit, and asserts
 * that every trace of PII is gone and that access carried over.
 */
import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-rules-check';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

const db = getFirestore(initializeApp({ projectId: PROJECT_ID }));

const MOD_EMAIL = 'mod@example.com';
const TRUSTED_EMAIL = 'trusted@example.com';
const COACH_EMAIL = 'coach@example.com';
const GHOST_EMAIL = 'never-signed-in@example.com';

// Create real accounts in the Auth emulator so the lookup has something to resolve.
async function createUser(email) {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ email, password: 'password123' }),
    },
  );
  if (!res.ok) throw new Error(`could not create ${email}: ${await res.text()}`);
  return (await res.json()).localId;
}

const modUid = await createUser(MOD_EMAIL);
const trustedUid = await createUser(TRUSTED_EMAIL);
const coachUid = await createUser(COACH_EMAIL);

await db.doc('appConfig/roles').set({
  trusted: [TRUSTED_EMAIL],
  moderators: [MOD_EMAIL],
  authors: ['someone@example.com', 'another@example.com'],
});

await db.doc('teams/team1').set({
  name: 'Test Team',
  emails: [COACH_EMAIL, GHOST_EMAIL],
});

await db.doc('aggregated/teams').set({
  data: [{ id: 'team1', name: 'Test Team', emails: [COACH_EMAIL, GHOST_EMAIL] }],
});

await db.doc('gameEvents/game1').set({
  events: [
    // A normal event carrying a real display name.
    { id: 'e1', gameId: 'game1', userId: 'u1', userName: 'Jane Q. Realname', type: 'goal',
      videoTime: 10, votes: 0, upvotes: 0, downvotes: 0, upvoterIds: [], downvoterIds: [], status: 'unverified' },
    // An event with no vote arrays at all — the new rules read them directly, so it would be
    // permanently unvotable if the migration missed it.
    { id: 'e2', gameId: 'game1', userId: 'u2', userName: 'Bob Realname', type: 'shot',
      videoTime: 20, votes: 0, status: 'verified' },
    // Votes cast against the old localStorage device id, plus counters that disagree.
    { id: 'e3', gameId: 'game1', userId: 'u3', type: 'foul', videoTime: 30,
      votes: 99, upvotes: 99, downvotes: 0,
      upvoterIds: ['anon_abc-123', 'real-uid-1'], downvoterIds: [] },
  ],
});

console.log('seeded. running migration...\n');
execFileSync('node', ['migrate_privacy.cjs', '--commit'], { stdio: 'inherit' });

// ---------------------------------------------------------------- assertions

const failures = [];
let passed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok  ${name}`); }
  else { failures.push(name); console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}

console.log('\nassertions');

const events = (await db.doc('gameEvents/game1').get()).data().events;
const byId = Object.fromEntries(events.map(e => [e.id, e]));

check('no event retains a display name', events.every(e => !('userName' in e)),
  JSON.stringify(events.filter(e => 'userName' in e)));
check('every event has upvoterIds', events.every(e => Array.isArray(e.upvoterIds)));
check('every event has downvoterIds', events.every(e => Array.isArray(e.downvoterIds)));
check('device-id votes were dropped', !byId.e3.upvoterIds.some(id => id.startsWith('anon_')));
check('a real voter survived the cleanup', byId.e3.upvoterIds.includes('real-uid-1'));
check('vote counters were recomputed', byId.e3.upvotes === 1 && byId.e3.votes === 1,
  `upvotes=${byId.e3.upvotes} votes=${byId.e3.votes}`);
check('unrelated event fields are untouched', byId.e1.type === 'goal' && byId.e1.videoTime === 10);
check('event status is preserved', byId.e2.status === 'verified');

const roles = (await db.doc('appConfig/roles').get()).data();
check('roles hold no email addresses', !JSON.stringify(roles).includes('@'), JSON.stringify(roles));
check('trusted was folded into moderators', roles.moderators.includes(trustedUid));
check('existing moderators carried over', roles.moderators.includes(modUid));
check('the authors list is gone', !('authors' in roles) && !('trusted' in roles));

const team = (await db.doc('teams/team1').get()).data();
check('team emails are deleted', !('emails' in team), JSON.stringify(team));
check('the coach carried over as a uid', (team.memberUids || []).includes(coachUid));
check('team name is untouched', team.name === 'Test Team');

const agg = (await db.doc('aggregated/teams').get()).data().data;
check('the aggregated mirror leaks no emails', !JSON.stringify(agg).includes('@'), JSON.stringify(agg));
check('the aggregated mirror carries memberUids', (agg[0].memberUids || []).includes(coachUid));

console.log('\nre-running to confirm the migration is idempotent...\n');
execFileSync('node', ['migrate_privacy.cjs', '--commit'], { stdio: 'inherit' });
const rolesAgain = (await db.doc('appConfig/roles').get()).data();
check('a second run does not drop moderators',
  rolesAgain.moderators.includes(modUid) && rolesAgain.moderators.includes(trustedUid),
  JSON.stringify(rolesAgain));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
