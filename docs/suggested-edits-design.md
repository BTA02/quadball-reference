# Suggested Edits — Design

Status: draft for iteration
Branch: `claude/suggest-edit-feature-d08a4e`

## 1. Problem

Today the only way to disagree with a recorded event is to downvote it and author a
competing event. That produces vague negative signal, duplicate events, and no path from
"this is wrong" to "this is fixed". We want a **suggest fix / suggest update** flow where
anyone watching — signed in or not — can propose a correction that moderators review.

## 2. Governing principles

1. **No identity, anywhere.** No display names, no handles, no profiles, no user-supplied
   text in any identity field. Sign-in exists solely so a bad actor can be traced and
   blocked. See §4.
2. **No automation on trust decisions.** Nothing is auto-verified or auto-accepted. Every
   state change affecting the dataset is made by a human moderator. See §7.
3. **Permissions are enforced in rules, not in the UI.** Hiding a button is not a permission.
   See §5.2.

Privacy ships first. Everything in Phase 0 (§13) is independent of the suggest feature and
should land on its own.

## 3. Constraints from the current architecture

1. **Events are not documents.** Modern events live as an array field on
   `gameEvents/{gameId}` (`src/App.tsx`, `onSnapshot` on that doc). Every edit is a
   read-modify-write of the whole array.
2. **No Cloud Functions.** No `functions/` directory. All writes are client-side, so
   `firestore.rules` is the only enforcement layer. Principle §2.2 means this costs nothing
   today — there is no threshold logic a server would have had to enforce. See §12.
3. **Rules already strain against the array.** `isOwnEventEditOrVote()` uses set-difference
   tricks because rules cannot loop a list, and only validates single-element diffs.
4. **Anonymous voting is broken today.** `voterId` falls back to a localStorage `deviceId`,
   but every `gameEvents` update branch requires `isAuthenticated()`. Anonymous users see an
   optimistic vote, then a "Vote failed" toast. Fixed by §6.

## 4. Identity: derived labels, no stored names

**A user is displayed as `User 048293` — digits derived deterministically from their Firebase
uid.** Nothing is stored, nothing is chosen, nothing is editable.

### 4.1 Digits, not alphanumeric

Alphanumeric is *worse* for the "nothing unpleasant" requirement, not better.

The usual mitigation for accidental words is excluding vowels from the alphabet — but
leetspeak defeats that completely. `D1CK`, `C0CK`, `5H1T`, `TW4T`, `5LUT`, `F4G`, `B00B`
contain no vowels at all, because `0 1 3 4 5` substitute for them. Any consonant-plus-digit
alphabet still needs a profanity blocklist, which is exactly the risk surface we are trying
to eliminate.

**Pure digits cannot spell anything.** They can still land on loaded numbers, so the
generator rejects a short blocklist and re-hashes deterministically:

```ts
// No wordlist. No alphabet. No user input. No AI. No stored field.
const BLOCKED = ['69', '420', '666', '88', '1488', '187', '911', '80085', '5318008'];

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export function userLabel(uid: string): string {
  for (let salt = 0; salt < 100; salt++) {
    const s = String(fnv1a(uid + (salt || '')) % 1_000_000).padStart(6, '0');
    if (!BLOCKED.some(b => s.includes(b))) return `User ${s}`;
  }
  return `User ${String(fnv1a(uid) % 1_000_000).padStart(6, '0')}`;   // unreachable in practice
}
```

The blocklist rejects roughly 15–18% of candidates; re-hashing absorbs that and the loss of
address space is negligible. The list is data, not logic — extend it any time.

### 4.2 How many digits

**Six, uniform for every tier.** One million values; a 50% chance of any collision at around
1,180 uids.

Two notes on that choice:

- **Do not vary length by tier.** Giving anonymous users longer numbers would publicly leak
  who is anonymous, which contradicts §2.1. Moderators see an `anon` badge in the review
  queue; the public label is identical in form for everyone.
- **Anonymous uids churn.** Firebase mints a new anonymous uid per browser profile and again
  whenever storage is cleared, so uid count grows much faster than person count. If that
  churn looks heavy in practice, widening to eight digits is a one-constant change (100M
  values, 50% at ~11,800) at the cost of a longer, less readable label.

Collisions are cosmetic regardless: **moderation always keys off the real uid, never the
label.** Two colliding labels only matter if both users appear in the same review queue,
which is vanishingly unlikely.

### 4.3 Properties

- **No `profiles` collection.** Nothing to secure, migrate, or moderate.
- **No handle changes**, because there is no handle — the label is a pure function of the uid.
- **No free-text field anywhere in the identity path**, so there is nothing to abuse and no
  naming decision is delegated to a generator.
- Email and real name never reach Firestore. Email stays inside the auth token, where the
  admin check still reads it.

### 4.4 Existing leaks this must fix

| Leak | Where | Fix |
|---|---|---|
| Real Google display name written into every event as `userName`, in a world-readable doc, permanently | `src/App.tsx` — `userName: user.displayName` | Drop the field. Render `userLabel(userId)` instead. Needs migration (§4.5). |
| `appConfig/roles` is `allow read: if true` and holds role tiers as **email arrays** — anyone can harvest the full contributor email list | `firestore.rules`, read in `src/App.tsx` | Re-key to uids (§5.1). |
| `teams.emails` is a world-readable email array | `firestore.rules` `isValidTeam` | Replace with `memberUids`. |
| Community leaderboard ranks by real display name | `LeaderboardView` in `src/App.tsx` | Renders derived labels. Already moderator-scoped — see §5.2. |

### 4.5 Migration

One-time script (follow the existing root-level `.cjs` pattern), **run against a backup**:

1. Strip `userName` from every element of every `events` array in `gameEvents`.
2. Rewrite `appConfig/roles` to a single uid-keyed `moderators` list.
3. Rewrite `teams.emails` to `teams.memberUids`.

Step 1 is irreversible by design — leaving `userName` as a fallback *is* the leak.

## 5. Permissions

Four tiers. `trusted` is deleted.

| | User | Author | Moderator | Admin |
|---|---|---|---|---|
| **Who** | anonymous auth | any Google sign-in | `appConfig/roles.moderators` | `andrew.axtell@gmail.com` |
| Suggest edits, upvote / downvote | yes | yes | yes | yes |
| Create events on games | no | yes | yes | yes |
| Edit / delete **own unverified** event | — | yes | yes | yes |
| Edit / delete a **verified** event | no | **no** | no — unverify first | yes |
| Edit / delete **someone else's** event | no | no | yes | yes |
| Verify / unverify | no | **no** | **yes — only** | yes |
| Accept / reject a suggestion | no | own unverified events only | yes | yes |
| **Create tab** — teams, players, rosters, seasons, games | no | no | yes | yes |
| **Grant / revoke moderator access** | no | no | **no** | **yes — only** |
| **Manage tab** | no | no | no | yes |

Role derivation needs no `authors` list — the tier falls out of the auth state:

```ts
const effectiveRole =
    isAdmin                              ? 'admin'
  : moderatorUids.includes(user?.uid)    ? 'moderator'
  : user && !user.isAnonymous            ? 'author'
  :                                        'user';
```

So `appConfig/roles` collapses from three email arrays to one uid array:
`{ moderators: [uid, ...] }`. It can stay world-readable — uids are opaque and un-spammable.

**Verified is a latch.** Once verified, an event is frozen to its author. Only a moderator can
unverify it, and only then does it become editable again. Trivial to express in rules, and it
gives the shield badge real meaning.

**Moderators cannot promote each other.** Granting and revoking moderator access is admin-only,
enforced in three places: the "Make moderator" action on the leaderboard is only wired up for
the admin, `handleAddRole`/`handleRemoveRole` re-check it, and `appConfig` is `allow write: if
isAdmin()`. A moderator viewing the leaderboard sees who holds which role and no way to change
it. Covered by the rules test "a moderator may NOT grant moderator access".

**Assumption to confirm:** an author may accept a suggestion on their own *unverified* event.
They can already edit that event freely, so blocking it is friction with no security benefit.

### 5.1 The Create tab is not actually gated

`canUseCreateTools` hides the nav button, but the render is a bare `view === 'create'` with no
role check, and `view` is settable from the URL. The `manage` view redirects non-admins;
`create` does not. The rules do not compensate — `games`, `players`, `seasons` and `rosters`
all `allow create: if isAuthenticated()`.

**Any signed-in user can reach the moderator creation tools and successfully write.** Phase 0
fixes both halves: a redirect guard mirroring the `manage` one, and `isModerator()` on those
four collections in rules. This is principle §2.3 — the UI check was never a permission.

### 5.2 Leaderboard

Already lives inside `CreateView`'s activity tab ("Moderator - Creation Tools"), so it is
moderator-scoped as soon as §5.1 lands. It only needs `userLabel()` swapped in for `userName`.

## 6. Anonymous participation

Anyone watching can suggest and vote, via **Firebase anonymous auth** (`signInAnonymously()`),
called silently on first load. Not truly-unauthenticated writes.

Why: `allow create: if true` with no Functions to clean up and no server-side rate limiting is
a spam magnet you cannot mop up. Anonymous auth costs the user zero friction — no prompt, no
UI — while giving a real `request.auth.uid` for rules, per-user vote validation, and the
ability to block a bad actor. That traceability is the entire reason sign-in exists (§2.1).

It also **fixes the currently-broken anonymous voting for free**, and `linkWithCredential()`
carries an anonymous account's history over when the user later signs in with Google —
which is also the User → Author upgrade path in §5.

## 7. What votes are for

With auto-accept and auto-verification both removed, **votes are triage signal, not a
mechanism.** They never change a status by themselves. Their only jobs are:

- ordering the moderator review queue by contention
- surfacing games that need attention on the activity board (§9)

Stating this plainly simplifies everything downstream: no weighting, no reputation, no
thresholds, and no place where a client could forge a consensus it did not have.

## 8. Suggestions

**Suggestions are their own documents, and they store a patch, not an event.**

```
gameEvents/{gameId}/suggestions/{suggestionId}
gameEvents/{gameId}/revisions/{revisionId}
```

A suggestion is a *proposal about* an event, never an event itself. Materializing proposals
into the `events` array would force `statsComputations.ts`, the box score, momentum view and
every aggregate to filter them out — and one missed filter double-counts a goal. Proposals
become event data only when a moderator accepts them.

A **sparse patch** rather than a replacement event means "the player was #7, not #12" is a
one-field document that renders as a one-line diff, two non-overlapping suggestions on one
event can both be accepted, and staleness is detectable per-field.

### 8.1 Schema

```ts
interface EventSuggestion {
  id: string;
  gameId: string;
  videoId: string;

  kind: 'edit' | 'delete' | 'add';
  targetEventId: string | null;        // null only when kind === 'add'

  patch: Partial<Pick<GameEvent,
    'type' | 'videoTime' | 'playerId' | 'subPlayerId' |
    'teamId' | 'position' | 'color' | 'relatedEventId'>>;
  baseline: Partial<GameEvent>;        // values of exactly the patched keys, at suggest time

  note?: string;                       // required for 'delete', optional otherwise, max 280
  authorId: string;                    // uid only. Never a name, label, or email.
  createdAt: Timestamp;

  status: 'open' | 'accepted' | 'rejected' | 'superseded' | 'withdrawn';
  resolvedBy?: string;                 // uid
  resolvedAt?: Timestamp;

  upvoterIds: string[];
  downvoterIds: string[];
  score: number;                       // up - down, for ordering the review queue
}
```

`note` is the one free-text field in the feature. It attaches to a *suggestion*, never to an
identity, caps at 280 chars, and needs a moderator delete path (§10).

`baseline` does the heavy lifting. On accept, compare the live event's values for the patched
keys against `baseline`; if they have drifted, mark `superseded` and warn the reviewer rather
than silently clobbering. A per-event `rev` counter would be simpler but coarser — it would
invalidate a player-name fix because someone nudged a timestamp.

`kind: 'delete'` is what downvoting should have been. A downvote says "something is wrong"; a
delete-suggestion says "this did not happen, here is why", and is actionable.

`kind: 'add'` covers missing events. **Scope note:** most likely candidate to cut if the UI
gets busy — the compact view in §11.3 is the primary mitigation.

**Document IDs** are deterministic: `${targetEventId}__${authorId}__${kind}` (random for
`add`). Double-suggesting becomes structurally impossible, and "have I already suggested
here?" is a local lookup rather than a query.

### 8.2 Accept

Moderator, or the event's own author on their own unverified event. Client transaction over
`gameEvents/{gameId}`:

1. Re-read the doc, locate the target event, verify `baseline` still matches the live values.
   If drifted → `status: 'superseded'`, abort.
2. Reject if the target is `verified` — it must be unverified first. Keeps §5's latch honest.
3. Apply the patch / remove the element / append the new event.
4. Set suggestion `status: 'accepted'`, `resolvedBy`, `resolvedAt`.
5. Append to `gameEvents/{gameId}/revisions/{id}`: before, after, suggester uid, accepter uid,
   timestamp.
6. **Wipe the target event's vote arrays** and stamp `votesResetAt`. Content changed, so prior
   votes no longer refer to what is on screen — force a re-vote.

Build the revision trail in Phase 1 even though nothing reads it yet. It is the undo path, and
"this call was corrected and reviewed" is a credibility asset for a stats site.

## 9. Activity board

`RecentEventsView` currently detects activity only via `createdAt` on newly authored events,
so a game that received votes or suggestions but no new events is invisible. It should
surface **any game with recent authoring, voting, or suggestion activity.**

| Signal | How it becomes queryable |
|---|---|
| New events | Already works — `createdAt` on the array element. |
| Votes | **Add `lastVoteAt` to the event element**, written by `handleVote`, which already rewrites that element — so it is free. |
| Suggestions | `collectionGroup('suggestions')` ordered by `createdAt`, filtered to `status == 'open'`. |

New columns: **New Stats · Unverified · Contested · Suggestions · Review**, where *Contested*
counts events carrying any downvotes. Sort by most recent activity of any kind, so a game with
five open suggestions and no new events rises to the top.

**Performance note:** the file already carries a comment explaining that timestamps inside an
array field are unqueryable, forcing a full download of `gameEvents`. The suggestions half
does *not* have that problem — a `collectionGroup` query indexed on `createdAt` is cheap and
bounded. It needs a collection-group read rule (§10).

This board is the primary moderator work queue now that nothing resolves itself.

## 10. Rules sketch

Per-document suggestions make vote rules genuinely enforceable — something the array-based
path fundamentally cannot do.

```
function isModerator() {
  return isAuthenticated() && exists(/databases/$(database)/documents/appConfig/roles)
      && get(/databases/$(database)/documents/appConfig/roles)
           .data.moderators.hasAny([request.auth.uid]);
}

match /gameEvents/{gameId}/suggestions/{suggestionId} {
  allow read: if true;

  allow create: if isAuthenticated()
    && request.resource.data.authorId == request.auth.uid
    && request.resource.data.status == 'open'
    && request.resource.data.upvoterIds.size() == 0
    && request.resource.data.downvoterIds.size() == 0
    && (!('note' in request.resource.data) || request.resource.data.note.size() <= 280);

  // vote: only your own id may enter or leave the arrays
  allow update: if isAuthenticated() && isSelfVoteOnly();

  // resolve
  allow update: if isModerator()
                || isOwnUnverifiedTarget(gameId, resource.data.targetEventId);

  // withdraw your own open suggestion; moderators can remove abusive notes
  allow delete: if isModerator()
                || (isOwner(resource.data.authorId) && resource.data.status == 'open');
}

// required for the activity board's cross-game query
match /{path=**}/suggestions/{suggestionId} {
  allow read: if true;
}

match /gameEvents/{gameId}/revisions/{revisionId} {
  allow read: if true;
  allow create: if isAuthenticated();
  allow update, delete: if isAdmin();      // append-only audit trail
}
```

`isSelfVoteOnly()` is expressible via
`request.resource.data.upvoterIds.toSet().difference(resource.data.upvoterIds.toSet()).hasOnly([request.auth.uid])`
plus the mirrors for downvotes and removals.

`gameEvents` also tightens to match §5: verification changes require `isModerator()`, an
author's edit or delete of their own event is denied when the stored status is `verified`, and
event creation requires a non-anonymous account. And per §5.1, `games` / `players` / `seasons`
/ `rosters` creation moves from `isAuthenticated()` to `isModerator()`.

## 11. UI

### 11.1 Entry points

**Reuse the existing draft-event editor.** "Suggest fix" opens the *same* form the author
uses, pre-filled with current values, in proposal mode: amber header reading "Suggest a fix",
changed fields highlighted, submit button reading "Submit suggestion". No new form to build,
and the patch derives from diffing against the pre-fill.

The action sits beside the existing vote buttons and is visible to **everyone** — not gated
behind `evt.userId === user?.uid` the way the current edit/delete pair is.

**Rewire the downvote.** Keep it as the low-effort signal, but on click surface
"Know what's wrong? → Suggest a fix". That converts vague negative signal into actionable
proposals, which is the thesis of the feature.

### 11.2 Display

- Events with open suggestions get an amber left border and a `2 suggested fixes` chip.
- Expanding shows suggestion cards: strikethrough-old → bold-new pairs (`goal → shot`,
  `J. Smith → K. Lee`), `User 048293`, note, vote buttons, Accept/Reject for moderators.
- **Per-game review queue** tab beside the event feed: open suggestions sorted by score, each
  with seek-to-timestamp so a moderator checks the video in one click and resolves without
  leaving the queue. Inline cards are for discovery; the queue is for throughput.
- **Global moderator inbox**: the activity board (§9) in the existing moderator Activity tab.

### 11.3 Event density modes (Watch → Events tab)

A density control so the events feed can shed the voting and suggesting chrome entirely.

| Mode | Shows |
|---|---|
| **Full** | Everything — votes, suggest, verify shield, seek, suggestion cards |
| **Compact** | Time, label, player/team, seek. Voting and suggesting hidden; open-suggestion count collapses to a small amber dot. Actions appear on row hover. |
| **Minimal** | One line: `12:34 · GOAL · J. Smith`. No indicators, no actions. |

- Persist in `localStorage` and mirror into the URL params alongside the existing
  `statsFilter` sync, so a shared link preserves density.
- Actions are *hidden, not removed* — hover reveals them in Compact, so the feature stays
  reachable without shouting.
- This is also the escape hatch for §8.1's `add`-kind scope risk: if suggest-missing-event
  makes the feed too busy, Compact absorbs it before we cut the feature.

## 12. Follow-up: Cloud Function for vote consolidation

Deferred, not rejected. A single Function could consolidate upvotes and downvotes across
events and suggestions and auto-accept above a threshold — the one thing a client genuinely
cannot do securely, because rules cannot sum values across N referenced documents.

If it happens, two constraints from the earlier draft still hold:

- suggestions must keep storing **raw `upvoterIds` only**, never a client-computed weighted
  score, so a malicious client can only ever cast its own vote
- any per-uid reputation weight must be **server-written**, or users self-promote

The current schema already satisfies both, so adding this later requires no migration.

## 13. Phasing

**Phase 0 — Privacy and permissions.** Ships alone, ahead of the feature. **Implemented** —
see §15 for the deploy runbook.
Anonymous auth; `userLabel()` replacing every display name; migration stripping `userName`;
`appConfig/roles` re-keyed to a single uid `moderators` list; `teams.emails` → `memberUids`;
`trusted` deleted; Create tab gated in both the router and the rules (§5.1); verified-is-a-latch.

**Phase 1 — Suggest.**
Suggestions subcollection, `edit` + `delete` kinds, suggest-mode editor, inline diff cards,
moderator accept/reject, revision trail, vote wipe on accept.

**Phase 2 — Review at scale.**
Per-game review queue, activity board rebuild (§9) including `lastVoteAt`, `add` kind,
density modes (§11.3).

**Phase 3 — Deferred.** §12.

## 14. Open questions

- **Confirm:** authors may accept suggestions on their own unverified events (§5).
- Does a rejected suggestion stay visible on the event for transparency, or disappear?
- Six digits or eight (§4.2) — revisit once anonymous uid churn is observable.

## 15. Phase 0 deploy runbook

Order matters. The new rules read fields the migration creates, so migrating first avoids a
window where moderators and team managers lose access.

**Before anything:** enable anonymous sign-in — Firebase console → Authentication → Sign-in
method → Anonymous. Without it `ensureAnonymousSession()` logs a clear error and the app still
works for signed-in users, but nobody else can vote or suggest.

1. **Back up Firestore.** Step 2 is irreversible by design.
2. **Get an Admin key.** Firebase console → gear icon → Project settings → Service accounts →
   "Generate new private key", saved as `service-account.json` in the repo root. The filename
   is covered by `.gitignore`; it grants full project access, so delete it once the migration
   is done and revoke it from that same tab if it is ever exposed. `SERVICE_ACCOUNT_PATH`
   overrides the location if you would rather keep it outside the repo. Running the migration
   without a key prints these steps.
3. **Run the migration:**
   `node migrate_privacy.cjs` (dry run), then `node migrate_privacy.cjs --commit`.
   It strips `userName` from every event, normalises the vote arrays the new rules read,
   rewrites `appConfig/roles` to uids, and converts `teams.emails` to `memberUids` in both the
   team docs and the `aggregated/teams` mirror. Anyone who had access but never signed in
   cannot be resolved to a uid and is listed at the end for you to re-add by hand.
4. **Deploy rules and app together.** Between the migration and the deploy, the live app reads
   a `userName` that no longer exists and falls back to "Anonymous" in the leaderboard.

### Verification

Two emulator-backed suites:

- `npm run test:rules` — 30 behavioural tests against the real rules: the verified latch,
  anonymous voting, vote tampering, and moderator gating on every collection.
- `npm run test:migration` — seeds representative pre-migration data, runs the real migration
  with `--commit`, and asserts every trace of PII is gone and access carried over. Re-runs it
  afterwards to confirm it is idempotent.

Both need a **JDK 21+** on PATH for firebase-tools 15. This machine has only 18 and 11, so the
suites were run for this change against `firebase-tools@14`, which still accepts 18:

    npx firebase-tools@14 emulators:exec --only firestore,auth --project demo-rules-check \
      "node scripts/test_firestore_rules.mjs"

Note that `emulators:exec` alone does **not** validate rules — it runs the script happily with
a syntactically broken rules file. Real compilation goes through the emulator's
`:securityRules` REST endpoint, which is what the suites exercise.

### Node version

`migrate_privacy.cjs` deliberately avoids `firebase-admin/auth`. That module pulls in
jwks-rsa v4 to jose v6, which is ESM-only, and Node below 20.19 cannot `require()` an ESM
module — it dies at import time, before any of the migration runs. `firebase-admin/firestore`
has no such dependency. The email lookup therefore calls the same Identity Toolkit endpoint
firebase-admin would have used, authenticated with the same service account through
`google-auth-library`, batched 100 addresses at a time. Upgrading Node past 20.19 would also
clear the original error, but the REST path removes the dependency instead of pinning a
version to it.

Setting `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` points the whole migration
at the emulators and drops the service-account requirement, so a run can be rehearsed against
a snapshot before it is aimed at production.

### Notes for whoever picks this up

- `isValidGame` / `isValidPlayer` / `isValidVideo` / `isValidSeason` read their optional keys
  directly (`data.foo == null`), and reading an absent key in rules **raises** rather than
  returning null. Every write must therefore include every optional key, explicitly null.
  This predates Phase 0 and is left alone, but it is why the tests send complete payloads.
- Pure appends to the `events` array stay unvalidated per-element — rules cannot loop a list,
  and tightening it would break bulk import. The guard that matters is that anonymous sessions
  cannot reach that branch at all.
- Moderator promotion has no email path by design. A user copies their own ID from the header
  chip, or the admin promotes them from the leaderboard on the Create tab.
