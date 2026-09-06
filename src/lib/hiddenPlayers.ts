// Player opt-out from the public stat aggregation pages.
//
// A player can ask to be left off the leaderboards. Their events, and every stat computed
// from them, are untouched — the opt-out is a front-end filter, applied when the rows are
// rendered, so team and league aggregates stay correct and nothing has to be re-tracked if
// they change their mind. Admins always see every player.
//
// The list lives in one world-readable doc rather than a flag on each player, for the same
// reason the moderator list does (see appConfig/roles): the public client reads players from
// the denormalised `aggregated/players` blob, whose entries are rewritten by exact-match
// arrayUnion/arrayRemove pairs, so an extra field there would silently duplicate rows the
// first time a name was edited. One doc, one read, admin-only writes.
import { doc, getDoc, setDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

export const HIDDEN_PLAYERS_COLLECTION = 'appConfig';
export const HIDDEN_PLAYERS_DOC_ID = 'hiddenPlayers';

const hiddenPlayersRef = () => doc(db, HIDDEN_PLAYERS_COLLECTION, HIDDEN_PLAYERS_DOC_ID);

/** Player ids currently opted out of the public stat pages. */
export async function fetchHiddenPlayerIds(): Promise<string[]> {
  const snap = await getDoc(hiddenPlayersRef());
  const ids = snap.data()?.playerIds;
  return Array.isArray(ids) ? ids.filter((id: unknown): id is string => typeof id === 'string') : [];
}

/** Admin-only. The rules layer enforces this too — see firestore.rules, appConfig. */
export async function setPlayerHidden(playerId: string, hidden: boolean): Promise<void> {
  await setDoc(
    hiddenPlayersRef(),
    { playerIds: hidden ? arrayUnion(playerId) : arrayRemove(playerId) },
    { merge: true },
  );
}
