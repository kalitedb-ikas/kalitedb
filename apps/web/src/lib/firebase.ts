import { initializeApp, getApps } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

export const firebaseApp = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : undefined;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : undefined;
export const googleProvider = firebaseApp ? new GoogleAuthProvider() : undefined;

