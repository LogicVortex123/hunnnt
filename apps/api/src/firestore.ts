import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let db: Firestore | null = null;

/** True when Firestore credentials are configured in the environment. */
export function isFirestoreConfigured(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

/**
 * Lazily initialise firebase-admin and return the Firestore client.
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS (service-account JSON path, never committed).
 */
export function getDb(): Firestore {
  if (db) return db;
  if (!isFirestoreConfigured()) {
    throw new Error("Firestore is not configured: set FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS");
  }
  const app: App =
    getApps()[0] ??
    initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  db = getFirestore(app);
  return db;
}
