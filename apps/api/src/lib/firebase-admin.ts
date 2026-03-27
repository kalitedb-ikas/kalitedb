import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT
  );
}

function getPrivateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function hasServiceAccountConfig() {
  return Boolean(getProjectId() && process.env.FIREBASE_CLIENT_EMAIL && getPrivateKey());
}

function isEmulatorEnabled() {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST
  );
}

export function isFirebaseAdminAvailable() {
  return Boolean(
    hasServiceAccountConfig() ||
      isEmulatorEnabled() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

function assertFirebaseConfig() {
  const projectId = getProjectId();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

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
  const projectId = getProjectId();

  if (hasServiceAccountConfig()) {
    const config = assertFirebaseConfig();
    return initializeApp({
      credential: cert(config),
      projectId: config.projectId,
      ...(bucket ? { storageBucket: bucket } : {})
    });
  }

  if (isEmulatorEnabled()) {
    if (!projectId) {
      throw new Error("Firebase emulator kullanımı için FIREBASE_PROJECT_ID gerekli.");
    }

    return initializeApp({
      projectId,
      ...(bucket ? { storageBucket: bucket } : {})
    });
  }

  if (!projectId) {
    throw new Error("Firebase Admin için proje kimliği bulunamadı.");
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId,
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
