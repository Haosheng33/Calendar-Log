// Firebase modular SDK (v10+)
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Config is injected via Vite env vars (VITE_*). These values are not secret,
// but missing values will break the app at runtime, so we surface a clear error.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const missing = Object.entries(firebaseConfig)
  .filter(([, v]) => !String(v ?? '').trim())
  .map(([k]) => k)

export const firebaseConfigError =
  missing.length > 0
    ? `Firebase is not configured. Missing: ${missing.join(', ')}. Fill these in your .env (local) or hosting provider env vars.`
    : null

export const firebaseApp = firebaseConfigError ? null : initializeApp(firebaseConfig)
export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const googleProvider = firebaseApp ? new GoogleAuthProvider() : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null

