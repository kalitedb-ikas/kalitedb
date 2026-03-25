import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { initializeApp, getApps } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";

const firebaseCoreConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseOptionalConfig = {
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const firebaseConfig = {
  ...firebaseCoreConfig,
  ...(firebaseOptionalConfig.storageBucket ? { storageBucket: firebaseOptionalConfig.storageBucket } : {}),
  ...(firebaseOptionalConfig.messagingSenderId
    ? { messagingSenderId: firebaseOptionalConfig.messagingSenderId }
    : {}),
  ...(firebaseOptionalConfig.measurementId ? { measurementId: firebaseOptionalConfig.measurementId } : {})
};

export const isFirebaseConfigured = Object.values(firebaseCoreConfig).every(Boolean);

export const firebaseApp = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : undefined;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : undefined;
export const googleProvider = firebaseApp ? new GoogleAuthProvider() : undefined;
export const firebaseAnalyticsPromise: Promise<Analytics | undefined> =
  typeof window !== "undefined" && firebaseApp && firebaseOptionalConfig.measurementId
    ? isSupported().then((supported) => (supported && firebaseApp ? getAnalytics(firebaseApp) : undefined))
    : Promise.resolve(undefined);
