/**
 * Behavioural tests for firestore.rules — the Phase 0 permission model.
 *
 * Run:  npm run test:rules
 * (starts the Firestore emulator, which needs a JDK 21+ on PATH for firebase-tools 15)
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-rules-check';
const ADMIN_EMAIL = 'andrew.axtell@gmail.com';

const GAME_ID = 'game1';
const MOD_UID = 'mod-uid';
const AUTHOR_UID = 'author-uid';
const OTHER_UID = 'other-author-uid';
const ANON_UID = 'anon-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

// A Google sign-in. Anything that is not explicitly anonymous counts as an author.
const asAuthor = (uid = AUTHOR_UID) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
// A silent anonymous session — may vote, may not author.
const asAnon = () =>
  testEnv.authenticatedContext(ANON_UID, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const asModerator = () =>
  testEnv.authenticatedContext(MOD_UID, { firebase: { sign_in_provider: 'google.com' } }).firestore();
const asAdmin = () =>
  testEnv.authenticatedContext('admin-uid', {
    email: ADMIN_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();

function makeEvent(overrides = {}) {
  return {
    id: 'e1',
    videoId: 'v1',
    gameId: GAME_ID,
    userId: AUTHOR_UID,
    type: 'goal',
    videoTime: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    votes: 0,
    upvotes: 0,
    downvotes: 0,
    upvoterIds: [],
    downvoterIds: [],
    status: 'unverified',
    ...overrides,
  };
}

async function seedEvents(events) {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'gameEvents', GAME_ID), { events });
  });
}

let passed = 0;
const failures = [];

async function it(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`FAIL  ${name}\n        ${err.message.split('\n')[0]}`);
  }
}

// Moderator list and a team, seeded past the rules.
await testEnv.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'appConfig', 'roles'), { moderators: [MOD_UID] });
  await setDoc(doc(ctx.firestore(), 'teams', 'team1'), { name: 'Test Team', memberUids: [] });
});

console.log('\nauthoring events');

await it('an author may append their own event', async () => {
  await seedEvents([]);
  await assertSucceeds(updateDoc(doc(asAuthor(), 'gameEvents', GAME_ID), { events: [makeEvent()] }));
});

await it('an anonymous session may NOT append an event', async () => {
  await seedEvents([]);
  await assertFails(updateDoc(doc(asAnon(), 'gameEvents', GAME_ID), { events: [makeEvent({ userId: ANON_UID })] }));
});

await it('an author may edit their own unverified event', async () => {
  await seedEvents([makeEvent()]);
  await assertSucceeds(updateDoc(doc(asAuthor(), 'gameEvents', GAME_ID), { events: [makeEvent({ videoTime: 99 })] }));
});

await it('an author may NOT edit another author\'s event', async () => {
  await seedEvents([makeEvent({ userId: OTHER_UID })]);
  await assertFails(updateDoc(doc(asAuthor(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ userId: OTHER_UID, videoTime: 99 })],
  }));
});

await it('an author may delete their own unverified event', async () => {
  await seedEvents([makeEvent()]);
  await assertSucceeds(updateDoc(doc(asAuthor(), 'gameEvents', GAME_ID), { events: [] }));
});

console.log('\nverified is a latch');

await it('an author may NOT edit their own VERIFIED event', async () => {
  await seedEvents([makeEvent({ status: 'verified' })]);
  await assertFails(updateDoc(doc(asAuthor(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ status: 'verified', videoTime: 99 })],
  }));
});

await it('an author may NOT delete their own VERIFIED event', async () => {
  await seedEvents([makeEvent({ status: 'verified' })]);
  await assertFails(updateDoc(doc(asAuthor(), 'gameEvents', GAME_ID), { events: [] }));
});

await it('an author may NOT verify their own event', async () => {
  await seedEvents([makeEvent()]);
  await assertFails(updateDoc(doc(asAuthor(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ status: 'verified' })],
  }));
});

await it('a moderator may verify an event', async () => {
  await seedEvents([makeEvent()]);
  await assertSucceeds(updateDoc(doc(asModerator(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ status: 'verified' })],
  }));
});

await it('a moderator may edit a verified event', async () => {
  await seedEvents([makeEvent({ status: 'verified' })]);
  await assertSucceeds(updateDoc(doc(asModerator(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ status: 'verified', videoTime: 99 })],
  }));
});

console.log('\nvoting');

await it('an anonymous session may upvote', async () => {
  await seedEvents([makeEvent()]);
  await assertSucceeds(updateDoc(doc(asAnon(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ upvoterIds: [ANON_UID], upvotes: 1, votes: 1 })],
  }));
});

await it('an anonymous session may vote on a VERIFIED event', async () => {
  await seedEvents([makeEvent({ status: 'verified' })]);
  await assertSucceeds(updateDoc(doc(asAnon(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ status: 'verified', downvoterIds: [ANON_UID], downvotes: 1, votes: -1 })],
  }));
});

await it('a voter may NOT stuff someone else\'s uid into the vote arrays', async () => {
  await seedEvents([makeEvent()]);
  await assertFails(updateDoc(doc(asAnon(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ upvoterIds: ['someone-else'], upvotes: 1, votes: 1 })],
  }));
});

await it('a voter may NOT remove another voter', async () => {
  await seedEvents([makeEvent({ upvoterIds: [OTHER_UID], upvotes: 1, votes: 1 })]);
  await assertFails(updateDoc(doc(asAnon(), 'gameEvents', GAME_ID), { events: [makeEvent()] }));
});

await it('a vote may NOT smuggle an edit to another field', async () => {
  await seedEvents([makeEvent()]);
  await assertFails(updateDoc(doc(asAnon(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ upvoterIds: [ANON_UID], upvotes: 1, votes: 1, playerId: 'injected' })],
  }));
});

await it('a vote may NOT smuggle a status change', async () => {
  await seedEvents([makeEvent()]);
  await assertFails(updateDoc(doc(asAnon(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ upvoterIds: [ANON_UID], upvotes: 1, votes: 1, status: 'verified' })],
  }));
});

console.log('\nmoderator-only collections');

for (const [name, payload] of [
  ['games', { id: 'g2', seasonId: 's1', homeTeamId: 'team1', awayTeamId: 'team2', authorTeamId: null, isVerified: false, createdAt: null }],
  ['players', { firstName: 'A', lastName: 'B', preferredName: null, nickname: null, gender: null, createdAt: null }],
  ['seasons', { name: 'Season 1', createdAt: null }],
  ['videos', { videoId: 'v9', gameId: GAME_ID, youtubeId: 'yt1', title: 'T', createdAt: null }],
]) {
  await it(`an author may NOT create ${name}`, async () => {
    await assertFails(setDoc(doc(asAuthor(), name, 'new-doc'), payload));
  });
  await it(`a moderator may create ${name}`, async () => {
    await assertSucceeds(setDoc(doc(asModerator(), name, `mod-${name}`), payload));
  });
}

await it('an author may NOT write aggregated data', async () => {
  await assertFails(setDoc(doc(asAuthor(), 'aggregated', 'games'), { data: [] }));
});

console.log('\nroles');

await it('appConfig/roles is publicly readable (uids only, no addresses)', async () => {
  await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'appConfig', 'roles')));
});

await it('a moderator may NOT grant moderator access', async () => {
  await assertFails(updateDoc(doc(asModerator(), 'appConfig', 'roles'), { moderators: [MOD_UID, AUTHOR_UID] }));
});

await it('the admin may grant moderator access', async () => {
  await assertSucceeds(updateDoc(doc(asAdmin(), 'appConfig', 'roles'), { moderators: [MOD_UID, AUTHOR_UID] }));
});

console.log('\nteams');

await it('a non-member may NOT edit a team', async () => {
  await assertFails(updateDoc(doc(asAuthor(OTHER_UID), 'teams', 'team1'), { name: 'Hijacked' }));
});

await it('a team manager may edit their team', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'teams', 'team1'), { name: 'Test Team', memberUids: [AUTHOR_UID] });
  });
  await assertSucceeds(updateDoc(doc(asAuthor(), 'teams', 'team1'), { name: 'Renamed' }));
});

await testEnv.cleanup();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
