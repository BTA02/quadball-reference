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

await it('a moderator may set per-team completion on a game', async () => {
  await assertSucceeds(setDoc(doc(asModerator(), 'games', 'completion-ok'), {
    id: 'completion-ok', seasonId: 's1', homeTeamId: 'team1', awayTeamId: 'team2', authorTeamId: null,
    isVerified: false, homeCompletion: 'complete', awayCompletion: 'complete_no_subs', createdAt: null,
  }));
});

await it('a game may NOT carry an unknown completion value', async () => {
  await assertFails(setDoc(doc(asModerator(), 'games', 'completion-bad'), {
    id: 'completion-bad', seasonId: 's1', homeTeamId: 'team1', awayTeamId: 'team2', authorTeamId: null,
    isVerified: false, homeCompletion: 'mostly', awayCompletion: 'none', createdAt: null,
  }));
});

// Mirrors exactly what handleSetTeamCompletion in App.tsx sends: a moderator seeds a full
// game doc (as the Create tab would), then patches it with a *partial* updateDoc carrying
// only the one changed completion field plus the mirrored isVerified flag — never the whole
// document. The setDoc-only coverage above wouldn't have caught a rule that only worked for
// a full document.
await it('a moderator may PATCH a game with just one completion field (update, not set)', async () => {
  const modDb = asModerator();
  await setDoc(doc(modDb, 'games', 'completion-patch'), {
    id: 'completion-patch', seasonId: 's1', homeTeamId: 'team1', awayTeamId: 'team2', authorTeamId: null,
    isVerified: false, homeCompletion: 'none', awayCompletion: 'none', createdAt: null,
  });
  await assertSucceeds(updateDoc(doc(modDb, 'games', 'completion-patch'), {
    homeCompletion: 'complete', isVerified: false,
  }));
});

// handleSetTeamCompletion uses set(..., {merge:true}) instead of update() specifically so
// that marking a team complete works even when the game's local state entry exists but its
// Firestore doc hasn't been written yet (new games are added to local state before the
// background Firestore sync completes) — update() would throw "no document to update" here.
await it('a moderator may self-heal a missing game doc via merge-set completion patch', async () => {
  await assertSucceeds(setDoc(
    doc(asModerator(), 'games', 'completion-self-heal'),
    { id: 'completion-self-heal', homeCompletion: 'complete', isVerified: false },
    { merge: true }
  ));
});

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

console.log('\nsuggestions: creating');

// The admin test above promoted AUTHOR_UID to moderator — reset to a clean single-moderator
// roster so the suggestion tests are not accidentally exercising moderator rights.
await testEnv.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'appConfig', 'roles'), { moderators: [MOD_UID] });
  await setDoc(doc(ctx.firestore(), 'gameEvents', GAME_ID), {
    events: [makeEvent({ id: 'e1', userId: OTHER_UID })],
  });
});

function makeSuggestion(overrides = {}) {
  return {
    gameId: GAME_ID,
    videoId: 'v1',
    kind: 'edit',
    targetEventId: 'e1',
    patch: { videoTime: 15 },
    baseline: { videoTime: 10 },
    authorId: AUTHOR_UID,
    status: 'open',
    upvoterIds: [],
    downvoterIds: [],
    score: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const suggDoc = (ctxDb, id = 'sugg1') => doc(ctxDb, 'gameEvents', GAME_ID, 'suggestions', id);

await it('an author may suggest an edit', async () => {
  await assertSucceeds(setDoc(suggDoc(asAuthor()), makeSuggestion()));
});

await it('an anonymous session may suggest an edit', async () => {
  await assertSucceeds(setDoc(suggDoc(asAnon(), 'sugg-anon'), makeSuggestion({ authorId: ANON_UID })));
});

await it('a suggestion may NOT be created under someone else\'s authorId', async () => {
  await assertFails(setDoc(suggDoc(asAuthor(), 'sugg-forged'), makeSuggestion({ authorId: OTHER_UID })));
});

await it('a suggestion may NOT arrive pre-voted', async () => {
  await assertFails(setDoc(suggDoc(asAuthor(), 'sugg-prevoted'), makeSuggestion({ upvoterIds: [AUTHOR_UID] })));
});

// No free text anywhere in this document — `reason` is a closed set of four fixed strings,
// required only for 'delete' and forbidden everywhere else.
await it('a "delete" suggestion needs a reason', async () => {
  await assertFails(setDoc(suggDoc(asAuthor(), 'sugg-del-noreason'), makeSuggestion({ kind: 'delete', targetEventId: 'e1', patch: {}, baseline: {} })));
});

await it('a "delete" suggestion with an arbitrary reason string is rejected', async () => {
  await assertFails(setDoc(suggDoc(asAuthor(), 'sugg-del-freetext'), makeSuggestion({ kind: 'delete', targetEventId: 'e1', patch: {}, baseline: {}, reason: 'wrong player was credited here' })));
});

await it('a "delete" suggestion with a reason from the closed set succeeds', async () => {
  await assertSucceeds(setDoc(suggDoc(asAuthor(), 'sugg-del-ok'), makeSuggestion({ kind: 'delete', targetEventId: 'e1', patch: {}, baseline: {}, reason: 'did_not_happen' })));
});

await it('an "edit" suggestion may NOT carry a reason field at all', async () => {
  await assertFails(setDoc(suggDoc(asAuthor(), 'sugg-edit-reason'), makeSuggestion({ reason: 'did_not_happen' })));
});

await it('an unrecognised extra field is rejected', async () => {
  await assertFails(setDoc(suggDoc(asAuthor(), 'sugg-extra'), { ...makeSuggestion(), weight: 5 }));
});

console.log('\nsuggestions: voting');

await it('an anonymous session may upvote a suggestion', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertSucceeds(updateDoc(suggDoc(asAnon()), { upvoterIds: [ANON_UID], score: 1 }));
});

await it('a voter may NOT stuff another uid into a suggestion\'s vote arrays', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertFails(updateDoc(suggDoc(asAnon()), { upvoterIds: ['someone-else'], score: 1 }));
});

await it('a vote may NOT smuggle a patch change alongside it', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertFails(updateDoc(suggDoc(asAnon()), { upvoterIds: [ANON_UID], score: 1, patch: { videoTime: 999 } }));
});

console.log('\nsuggestions: resolving');

await it('the suggestion\'s own author may NOT accept it', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertFails(updateDoc(suggDoc(asAuthor()), { status: 'accepted', resolvedBy: AUTHOR_UID }));
});

await it('the target event\'s author may NOT accept a suggestion on their own event', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  // e1 is authored by OTHER_UID; confirm even the event's own author has no special path in.
  await assertFails(updateDoc(suggDoc(asAuthor(OTHER_UID)), { status: 'accepted', resolvedBy: OTHER_UID }));
});

await it('a moderator may accept a suggestion', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertSucceeds(updateDoc(suggDoc(asModerator()), { status: 'accepted', resolvedBy: MOD_UID, resolvedAt: '2026-01-02T00:00:00.000Z' }));
});

await it('a moderator may reject a suggestion', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertSucceeds(updateDoc(suggDoc(asModerator()), { status: 'rejected', resolvedBy: MOD_UID, resolvedAt: '2026-01-02T00:00:00.000Z' }));
});

console.log('\nsuggestions: withdrawing / removing');

await it('the author may withdraw their own OPEN suggestion', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertSucceeds(deleteDoc(suggDoc(asAuthor())));
});

await it('the author may NOT withdraw it once it is no longer open', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion({ status: 'rejected' })); });
  await assertFails(deleteDoc(suggDoc(asAuthor())));
});

await it('another author may NOT delete someone else\'s suggestion', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertFails(deleteDoc(suggDoc(asAuthor(OTHER_UID))));
});

await it('a moderator may delete any suggestion', async () => {
  await testEnv.withSecurityRulesDisabled(async ctx => { await setDoc(suggDoc(ctx.firestore()), makeSuggestion()); });
  await assertSucceeds(deleteDoc(suggDoc(asModerator())));
});

console.log('\nrevisions');

const revDoc = (ctxDb, id = 'rev1') => doc(ctxDb, 'gameEvents', GAME_ID, 'revisions', id);
const makeRevision = () => ({
  gameId: GAME_ID, targetEventId: 'e1', before: { videoTime: 10 }, after: { videoTime: 15 },
  suggestionId: 'sugg1', suggestedBy: AUTHOR_UID, resolvedBy: MOD_UID, createdAt: '2026-01-02T00:00:00.000Z',
});

await it('an author may NOT write a revision', async () => {
  await assertFails(setDoc(revDoc(asAuthor()), makeRevision()));
});

await it('a moderator may write a revision', async () => {
  await assertSucceeds(setDoc(revDoc(asModerator()), makeRevision()));
});

await it('revisions are publicly readable', async () => {
  await assertSucceeds(getDoc(revDoc(testEnv.unauthenticatedContext().firestore())));
});

await testEnv.cleanup();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
