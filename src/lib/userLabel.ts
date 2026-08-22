// Public identity for every contributor.
//
// There are no display names, handles, or profiles anywhere in this app. A user is shown as
// "User 048293", derived deterministically from their Firebase uid — nothing is stored,
// chosen, or editable, so there is no free-text field in the identity path to abuse.
//
// Digits rather than letters is a deliberate choice: alphanumeric labels can spell words by
// accident, and excluding vowels does not help because leetspeak substitutes for them
// (D1CK, 5H1T, TW4T all contain no vowels). Digits cannot spell anything.

// Numbers that read as something unpleasant. Purely data — extend freely.
const BLOCKED = ['69', '420', '666', '88', '1488', '187', '911', '80085', '5318008'];

const DIGITS = 6;
const MODULUS = 10 ** DIGITS;

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Stable public label for a uid, e.g. "User 048293".
 *
 * Collisions are possible (a 50% chance somewhere in the set at roughly 1,180 uids) and are
 * cosmetic only — moderation always keys off the raw uid, never the label.
 */
export function userLabel(uid: string | null | undefined): string {
  if (!uid) return 'Unknown user';
  // Re-hash with a salt until the digits avoid the blocklist. Roughly 15-18% of candidates
  // are rejected, so this almost always lands on the first pass.
  for (let salt = 0; salt < 100; salt++) {
    const digits = String(fnv1a(salt === 0 ? uid : `${uid}#${salt}`) % MODULUS).padStart(DIGITS, '0');
    if (!BLOCKED.some(blocked => digits.includes(blocked))) return `User ${digits}`;
  }
  return `User ${String(fnv1a(uid) % MODULUS).padStart(DIGITS, '0')}`;
}

/** Short form for dense UI — "048293". */
export function userLabelDigits(uid: string | null | undefined): string {
  return userLabel(uid).replace(/^User /, '');
}
