import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { getFunctions, type Functions } from 'firebase/functions'

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined
const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined

const app: FirebaseApp | null =
  apiKey && authDomain && projectId && storageBucket && appId
    ? initializeApp({
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId,
        appId,
      })
    : null

/**
 * Firebase services. When env vars are missing (local demo without a
 * backend), these are all null and services fall back to offline/IndexedDB-only mode.
 */
export const auth: Auth | null = app ? getAuth(app) : null

/** Persistent cache keeps reads working in the forest, where there is no signal. */
export const db: Firestore | null = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null
export const storage: FirebaseStorage | null = app ? getStorage(app) : null
export const functions: Functions | null = app ? getFunctions(app) : null

export function requireAuth(): Auth {
  if (!auth) {
    throw new Error(
      'Firebase nije konfigurisan. Postavite VITE_FIREBASE_* varijable u .env datoteci.',
    )
  }
  return auth
}

export function requireDb(): Firestore {
  if (!db) {
    throw new Error(
      'Firebase nije konfigurisan. Postavite VITE_FIREBASE_* varijable u .env datoteci.',
    )
  }
  return db
}

export function requireStorage(): FirebaseStorage {
  if (!storage) {
    throw new Error(
      'Firebase nije konfigurisan. Postavite VITE_FIREBASE_* varijable u .env datoteci.',
    )
  }
  return storage
}

export function requireFunctions(): Functions {
  if (!functions) {
    throw new Error(
      'Firebase nije konfigurisan. Postavite VITE_FIREBASE_* varijable u .env datoteci.',
    )
  }
  return functions
}
