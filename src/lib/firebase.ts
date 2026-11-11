"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// NEXT_PUBLIC_* values are inlined at build time, so they must be referenced literally.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Without Firebase env vars the app runs in demo mode (data in this browser only). */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured");
  if (services) return services;
  const fresh = getApps().length === 0;
  const app = fresh ? initializeApp(config) : getApp();
  let db: Firestore;
  try {
    // Offline persistence: reads come from the IndexedDB cache and writes are
    // queued while offline, then synced when the connection returns.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    db = getFirestore(app); // already initialized (fast refresh)
  }
  services = { app, auth: getAuth(app), db, storage: getStorage(app) };
  return services;
}
