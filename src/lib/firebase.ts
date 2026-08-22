import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInAnonymously, signInWithPopup, signInWithRedirect, signOut, linkWithPopup } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { toast } from 'sonner';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
}, firebaseConfig.firestoreDatabaseId ? firebaseConfig.firestoreDatabaseId : undefined);
export const googleProvider = new GoogleAuthProvider();

/**
 * Every visitor gets a real Firebase uid, silently, on first load. Nothing is shown to them.
 *
 * This exists so that suggesting an edit and voting work for people who aren't signed in,
 * while still giving the rules layer a `request.auth.uid` to validate against and a handle to
 * block a bad actor with. It also repairs voting, which previously wrote a localStorage
 * device id into gameEvents — a doc whose update rules require auth, so those writes always
 * failed.
 */
let anonymousSignIn: Promise<unknown> | null = null;

export const ensureAnonymousSession = async () => {
  if (auth.currentUser) return;
  if (anonymousSignIn) return anonymousSignIn;
  try {
    anonymousSignIn = signInAnonymously(auth);
    await anonymousSignIn;
  } catch (error: any) {
    // Anonymous sign-in has to be enabled in Firebase console > Authentication > Sign-in
    // method. Without it the app still works for signed-in users, but nobody else can vote
    // or suggest, so make the cause obvious rather than failing silently at every write.
    if (error?.code === 'auth/operation-not-allowed') {
      console.error('Anonymous auth is disabled for this Firebase project. Enable it under Authentication > Sign-in method.');
      return;
    }
    console.error('Anonymous sign-in failed:', error);
  } finally {
    anonymousSignIn = null;
  }
};

export const signIn = async () => {
  try {
    const current = auth.currentUser;
    // Upgrade the anonymous session in place so the user keeps everything they already
    // suggested and voted on, rather than silently starting over under a new uid.
    if (current?.isAnonymous) {
      try {
        await linkWithPopup(current, googleProvider);
        return;
      } catch (error: any) {
        // The Google account is already a user here. Nothing to merge onto — sign in to the
        // existing account instead and leave the anonymous contributions where they are.
        const recoverable = ['auth/credential-already-in-use', 'auth/email-already-in-use', 'auth/provider-already-linked'];
        if (!recoverable.includes(error?.code)) throw error;
      }
    }
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Login failed:", error);
    toast.error("Sign in failed. Please try again or check your browser settings.");
  }
};

// Signing out drops back to a fresh anonymous session rather than to no session at all, so
// voting and suggesting keep working.
export const logOut = async () => {
  await signOut(auth);
  await ensureAnonymousSession();
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  userMessage?: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  const rawMsg = error instanceof Error ? error.message : String(error);
  const isPermission = rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('unauthorized');
  
  const errInfo: FirestoreErrorInfo = {
    error: rawMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  console.error('Firestore Error: ', JSON.stringify(errInfo));

  // Build a user-friendly message for toast
  const friendlyOp = operationType === 'list' ? 'load' : operationType;
  const friendlyPath = path ? ` (${path})` : '';
  const userMessage = isPermission
    ? `Permission denied: You don't have access to ${friendlyOp}${friendlyPath}. Check your role or sign in again.`
    : `Failed to ${friendlyOp}${friendlyPath}: ${rawMsg}`;
  
  errInfo.userMessage = userMessage;

  // Show a popup for the user
  toast.error(userMessage, {
    description: isPermission ? "Role mismatch or session expired." : "Please try again or contact support.",
    duration: 5000,
  });

  return errInfo;
}
