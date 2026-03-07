import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function assertFirebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin ayarları eksik.");
  }

  return {
    projectId,
    clientEmail,
    privateKey
  };
}

export function getFirebaseAdminApp(): App {
  if (getApps().length) {
    return getApps()[0]!;
  }

  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  const config = assertFirebaseConfig();

  return initializeApp({
    credential: cert(config),
    projectId: config.projectId,
    ...(bucket ? { storageBucket: bucket } : {})
  });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}

export function getFirebaseAdminStorage() {
  return getStorage(getFirebaseAdminApp());
}
