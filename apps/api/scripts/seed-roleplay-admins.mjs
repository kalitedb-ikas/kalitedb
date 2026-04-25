#!/usr/bin/env node
/**
 * 6 ikas çalışanını `roleplay_admin` rolüne yükseltir.
 *
 * Email listesi `ROLEPLAY_ADMIN_EMAILS` ortam değişkeninden CSV olarak alınır.
 * Yoksa script email'leri stdin'den ister. Her email için:
 *   1) Firestore `users/{emailKey}` dokümanını upsert eder (role: roleplay_admin)
 *   2) Auth kullanıcısı varsa custom claim ekler (`role: 'roleplay_admin'`) — yoksa
 *      kullanıcı ilk giriş yaptığında sales-admin-page üzerinden manuel atama gerekir.
 *
 * Kullanım:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   ROLEPLAY_ADMIN_EMAILS="zafer.coban@ikas.com,..." \
 *   node scripts/seed-roleplay-admins.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
let envBlock = "";
try {
  envBlock = readFileSync(envPath, "utf8");
} catch {
  // dosya yoksa süreç değişkenleri kullanılır
}
const fromEnv = (key) =>
  envBlock
    .split("\n")
    .find((l) => l.startsWith(key + "="))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim()
    .replace(/^"(.*)"$/, "$1");

const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? fromEnv("GOOGLE_APPLICATION_CREDENTIALS");
const projectId = process.env.FIREBASE_PROJECT_ID ?? fromEnv("FIREBASE_PROJECT_ID");

if (!credsPath || !projectId) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS ve FIREBASE_PROJECT_ID gerekli.");
  process.exit(1);
}

const sa = JSON.parse(readFileSync(credsPath, "utf8"));
initializeApp({
  credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
  projectId
});

const db = getFirestore();
const auth = getAuth();

const rawEmails = process.env.ROLEPLAY_ADMIN_EMAILS;
if (!rawEmails) {
  console.error(
    "ROLEPLAY_ADMIN_EMAILS ortam değişkeni gerekli. Örnek:\n" +
      '  ROLEPLAY_ADMIN_EMAILS="zafer.coban@ikas.com,yavuz.ali@ikas.com" node scripts/seed-roleplay-admins.mjs'
  );
  process.exit(1);
}

const emails = rawEmails
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (emails.length === 0) {
  console.error("Email listesi boş.");
  process.exit(1);
}

const now = new Date().toISOString();
const usersCollection = db.collection("users");

let firestoreOk = 0;
let claimsOk = 0;
let claimsMissing = 0;
const issues = [];

for (const email of emails) {
  if (!email.endsWith("@ikas.com")) {
    issues.push(`${email}: @ikas.com değil, atlandı.`);
    continue;
  }

  const emailKey = email.replace(/[^a-z0-9]/g, "_");
  const docRef = usersCollection.doc(emailKey);

  let uid;
  try {
    const userRecord = await auth.getUserByEmail(email);
    uid = userRecord.uid;
    await auth.setCustomUserClaims(uid, { role: "roleplay_admin" });
    claimsOk++;
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      claimsMissing++;
      issues.push(`${email}: Auth kullanıcısı yok. İlk Google girişinden sonra tekrar çalıştır.`);
    } else {
      issues.push(`${email}: Custom claim hatası — ${err.message}`);
    }
  }

  await docRef.set(
    {
      uid: uid ?? null,
      email,
      role: "roleplay_admin",
      roles: [{ role: "roleplay_admin" }],
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  );
  firestoreOk++;
  console.log(`ok  ${email}  (firestore + ${uid ? "claim" : "claim atlandı"})`);
}

console.log(
  `\nDone. Firestore upsert: ${firestoreOk}/${emails.length}. Custom claim set: ${claimsOk}, atlanan: ${claimsMissing}.`
);
if (issues.length) {
  console.log("\nNotlar:");
  for (const i of issues) console.log("  - " + i);
}

process.exit(0);
