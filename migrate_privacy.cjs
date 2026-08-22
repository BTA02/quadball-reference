/**
 * Phase 0 privacy migration.
 *
 * Removes every piece of personally identifying information from world-readable documents:
 *
 *   1. gameEvents  — strips the denormalised Google display name (`userName`) out of every
 *                    event, and normalises the vote arrays the new rules depend on.
 *   2. appConfig   — rewrites the role lists from email addresses to uids, collapsing
 *                    `trusted` into `moderators` and dropping `authors` entirely (a Google
 *                    sign-in is now what makes someone an author).
 *   3. teams       — rewrites `emails` to `memberUids`, in both the team documents and the
 *                    aggregated/teams mirror.
 *
 * Emails are resolved to uids through the Admin Auth API. Anyone who never signed in has no
 * uid to resolve to and is reported so you can re-add them by hand afterwards.
 *
 * Usage:
 *   DRY RUN (default):  node migrate_privacy.cjs
 *   LIVE RUN:           node migrate_privacy.cjs --commit
 *
 * Requires a Firebase Admin key at ./service-account.json (override with SERVICE_ACCOUNT_PATH).
 * Running it prints step-by-step instructions if the key is missing. BACK UP FIRESTORE FIRST
 * — step 1 is irreversible, which is the point: leaving `userName` as a fallback is the leak.
 *
 * Note on the email lookup: this deliberately does NOT use `firebase-admin/auth`. That module
 * pulls in jwks-rsa v4 -> jose v6, which is ESM-only, and Node below 20.19 cannot require() an
 * ESM module. `firebase-admin/firestore` has no such dependency and loads fine. So the email
 * to uid lookup goes straight to the Identity Toolkit endpoint that firebase-admin would have
 * called anyway, authenticated with the same service account.
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

const COMMIT = process.argv.includes('--commit');

// The emulators ignore credentials entirely, so a rehearsal run needs no service account.
const USING_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

const KEY_PATH = process.env.SERVICE_ACCOUNT_PATH || './service-account.json';

if (!USING_EMULATOR && !fs.existsSync(KEY_PATH)) {
  console.error(`No service account key found at ${KEY_PATH}.`);
  console.error('');
  console.error('This migration rewrites world-readable documents and resolves email');
  console.error('addresses to uids, both of which need Admin credentials. To create a key:');
  console.error('');
  console.error('  1. https://console.firebase.google.com  ->  pick the project');
  console.error('  2. Gear icon > Project settings > Service accounts');
  console.error('  3. "Generate new private key" > Generate key');
  console.error('  4. Save the downloaded file as service-account.json in the repo root');
  console.error('');
  console.error('The filename is covered by .gitignore. It grants full project access, so');
  console.error('do not commit it, paste it anywhere, or leave it on a shared machine —');
  console.error('delete it once the migration is done, and revoke the key in that same');
  console.error('Service accounts tab if it is ever exposed.');
  console.error('');
  console.error('Set SERVICE_ACCOUNT_PATH to keep the key outside the repo instead.');
  process.exit(1);
}

const serviceAccount = USING_EMULATOR ? null : require(require('path').resolve(KEY_PATH));
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const projectId = process.env.GCLOUD_PROJECT || serviceAccount?.project_id || firebaseConfig.projectId;

const app = USING_EMULATOR
  ? initializeApp({ projectId })
  : initializeApp({ credential: cert(serviceAccount), projectId });
const db = USING_EMULATOR
  ? getFirestore(app)
  : getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

// Point at the Auth emulator when one is running, so the whole migration can be rehearsed
// against a snapshot before it is ever aimed at production.
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || null;
const IDENTITY_HOST = AUTH_EMULATOR
  ? `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com`
  : 'https://identitytoolkit.googleapis.com';

const googleAuth = AUTH_EMULATOR ? null : new GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const emailToUid = new Map();
const unresolved = [];

const normalise = email => String(email || '').trim().toLowerCase();

/**
 * Resolve every email in one pass, batched at the endpoint's 100-address limit.
 *
 * A failure here is reported loudly rather than swallowed: "this address has no account" and
 * "the lookup itself broke" lead to very different actions, and quietly conflating them would
 * silently drop every moderator and team manager on the floor.
 */
async function resolveAllEmails(emails) {
  const unique = [...new Set(emails.map(normalise).filter(Boolean))];
  if (unique.length === 0) return;

  console.log(`\nResolving ${unique.length} email address(es) to uids${AUTH_EMULATOR ? ' (emulator)' : ''}...`);
  const client = googleAuth ? await googleAuth.getClient() : null;
  const url = `${IDENTITY_HOST}/v1/projects/${projectId}/accounts:lookup`;

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    let users;
    if (client) {
      const res = await client.request({ url, method: 'POST', data: { email: batch } });
      users = res.data.users;
    } else {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ email: batch }),
      });
      if (!res.ok) throw new Error(`Identity lookup failed: ${res.status} ${await res.text()}`);
      users = (await res.json()).users;
    }
    for (const user of users || []) {
      if (user.email) emailToUid.set(normalise(user.email), user.localId);
    }
  }

  for (const email of unique) {
    if (!emailToUid.has(email)) unresolved.push(email);
  }
  console.log(`  resolved ${emailToUid.size}, no account for ${unresolved.length}`);
}

function resolveUid(email) {
  return emailToUid.get(normalise(email)) || null;
}

/** Every address the migration will need to translate, gathered before any writes happen. */
async function collectEmails() {
  const emails = [];

  const rolesSnap = await db.doc('appConfig/roles').get();
  if (rolesSnap.exists) {
    const data = rolesSnap.data() || {};
    for (const entry of [...(data.trusted || []), ...(data.moderators || [])]) {
      if (typeof entry === 'string' && entry.includes('@')) emails.push(entry);
    }
  }

  const teamsSnap = await db.collection('teams').get();
  for (const docSnap of teamsSnap.docs) {
    for (const email of docSnap.data().emails || []) emails.push(email);
  }

  return emails;
}

// ---------------------------------------------------------------- 1. gameEvents

async function migrateGameEvents() {
  console.log('\n--- 1. gameEvents: stripping display names ---');
  const snap = await db.collection('gameEvents').get();

  let docsTouched = 0;
  let namesStripped = 0;
  let votesNormalised = 0;
  let staleVoterIds = 0;

  for (const docSnap of snap.docs) {
    const events = docSnap.data().events || [];
    let changed = false;

    const cleaned = events.map(ev => {
      const next = { ...ev };

      if ('userName' in next) {
        delete next.userName;
        namesStripped++;
        changed = true;
      }

      // The new vote rule reads these arrays directly, so an event missing them would be
      // permanently unvotable.
      for (const field of ['upvoterIds', 'downvoterIds']) {
        if (!Array.isArray(next[field])) {
          next[field] = [];
          votesNormalised++;
          changed = true;
          continue;
        }
        // Votes cast against the old localStorage device id. These could never have been
        // written under the current rules, but drop any that predate them.
        const filtered = next[field].filter(id => typeof id === 'string' && !id.startsWith('anon_'));
        if (filtered.length !== next[field].length) {
          staleVoterIds += next[field].length - filtered.length;
          next[field] = filtered;
          changed = true;
        }
      }

      const up = next.upvoterIds.length;
      const down = next.downvoterIds.length;
      if (next.upvotes !== up || next.downvotes !== down || next.votes !== up - down) {
        next.upvotes = up;
        next.downvotes = down;
        next.votes = up - down;
        changed = true;
      }

      return next;
    });

    if (!changed) continue;
    docsTouched++;
    if (COMMIT) await docSnap.ref.update({ events: cleaned });
  }

  console.log(`  game docs to rewrite: ${docsTouched} of ${snap.size}`);
  console.log(`  display names stripped: ${namesStripped}`);
  console.log(`  vote arrays normalised: ${votesNormalised}`);
  console.log(`  stale device-id votes dropped: ${staleVoterIds}`);
}

// ---------------------------------------------------------------- 2. appConfig/roles

async function migrateRoles() {
  console.log('\n--- 2. appConfig/roles: emails to uids ---');
  const ref = db.doc('appConfig/roles');
  const snap = await ref.get();

  if (!snap.exists) {
    console.log('  no roles doc; nothing to do.');
    return;
  }

  const data = snap.data() || {};
  // Everyone who previously had elevated rights becomes a moderator. `authors` is dropped:
  // any Google sign-in can author events now, so there is no list to keep.
  const promoted = [...(data.trusted || []), ...(data.moderators || [])];
  const uids = [];

  for (const entry of promoted) {
    // Tolerate a re-run against already-migrated data.
    if (typeof entry === 'string' && !entry.includes('@')) {
      if (!uids.includes(entry)) uids.push(entry);
      continue;
    }
    const uid = resolveUid(entry);
    if (uid && !uids.includes(uid)) uids.push(uid);
  }

  console.log(`  ${promoted.length} previous trusted/moderator entries -> ${uids.length} uids`);
  console.log(`  dropping ${(data.authors || []).length} author entries (no longer a list)`);

  if (COMMIT) {
    await ref.set({ moderators: uids });
  }
}

// ---------------------------------------------------------------- 3. teams

async function migrateTeams() {
  console.log('\n--- 3. teams: emails to memberUids ---');
  const snap = await db.collection('teams').get();

  const resolvedByTeam = new Map();
  let teamsTouched = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!('emails' in data) && !('memberUids' in data)) continue;

    const emails = data.emails || [];
    const memberUids = [...(data.memberUids || [])];

    for (const email of emails) {
      const uid = resolveUid(email);
      if (uid && !memberUids.includes(uid)) memberUids.push(uid);
    }

    resolvedByTeam.set(docSnap.id, memberUids);
    teamsTouched++;
    console.log(`  ${data.name || docSnap.id}: ${emails.length} email(s) -> ${memberUids.length} uid(s)`);

    if (COMMIT) {
      await docSnap.ref.update({ memberUids, emails: FieldValue.delete() });
    }
  }

  console.log(`  teams to rewrite: ${teamsTouched}`);

  // The aggregated mirror holds a full copy of every team document, emails included, and is
  // what the app actually reads on load — so it leaks just as loudly as the source.
  const aggRef = db.doc('aggregated/teams');
  const aggSnap = await aggRef.get();
  if (!aggSnap.exists) return;

  const arr = aggSnap.data().data || [];
  const patched = arr.map(entry => {
    const next = { ...entry };
    delete next.emails;
    if (resolvedByTeam.has(next.id)) next.memberUids = resolvedByTeam.get(next.id);
    return next;
  });
  const leaking = arr.filter(e => Array.isArray(e.emails) && e.emails.length > 0).length;
  console.log(`  aggregated/teams entries carrying emails: ${leaking} (all cleared)`);

  if (COMMIT) await aggRef.update({ data: patched });
}

// ----------------------------------------------------------------

(async () => {
  console.log('=== Phase 0 privacy migration ===');
  console.log(COMMIT ? 'Mode: LIVE - changes WILL be written' : 'Mode: DRY RUN - nothing will be written');

  await resolveAllEmails(await collectEmails());

  await migrateGameEvents();
  await migrateRoles();
  await migrateTeams();

  if (unresolved.length) {
    console.log('\n--- Emails with no Firebase account ---');
    console.log('These had access but never signed in, so there is no uid to carry over.');
    console.log('Re-add them by uid once they sign in (they can copy their ID from the header):');
    [...new Set(unresolved)].forEach(e => console.log(`  ${e}`));
  }

  console.log(COMMIT ? '\nDone.' : '\nDry run complete. Re-run with --commit to apply.');
  process.exit(0);
})().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
