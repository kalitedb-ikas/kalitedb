/**
 * Migration: userRoles → users
 *
 * Bu script şunları yapar:
 * 1. Mevcut `userRoles` koleksiyonunu okur
 * 2. Her kaydı yeni `users` koleksiyonu formatına dönüştürür
 * 3. `users` koleksiyonuna yazar
 * 4. Department alanı olmayan `reportPeriods` dökümanlarına `department: "cs"` ekler
 *
 * Çalıştırmak için:
 *   GOOGLE_APPLICATION_CREDENTIALS=... npx tsx src/scripts/migrate-users.ts
 *
 * NOT: Mevcut `userRoles` koleksiyonu silinmez (geriye dönük uyumluluk korunur).
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Role, UserRoleEntry } from "@kalitedb/shared";

const LEGACY_TO_NEW_ROLE: Record<string, Role> = {
  admin: "admin",
  team: "team_leader",
  ceo: "manager",
  qt: "quality",
  manager: "manager",
  team_leader: "team_leader",
  quality: "quality",
  representative: "representative"
};

function buildRoleEntries(legacyRole: Role): UserRoleEntry[] {
  switch (legacyRole) {
    case "admin":
      return [{ role: "admin" }];
    case "team":
    case "team_leader":
      return [{ department: "cs", role: "team_leader" }];
    case "ceo":
      return [{ department: "cs", role: "manager", level: "senior" }];
    case "qt":
    case "quality":
      return [{ department: "cs", role: "quality" }];
    default:
      return [{ department: "cs", role: legacyRole }];
  }
}

async function main() {
  const app = initializeApp({
    credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "")
  });

  const db = getFirestore(app);

  console.log("1/2 — userRoles → users migrasyonu başlıyor...");

  const userRolesSnapshot = await db.collection("userRoles").get();
  let migratedCount = 0;
  let skippedCount = 0;

  for (const doc of userRolesSnapshot.docs) {
    const data = doc.data();
    const legacyRole = data.role as Role;
    const newRole = LEGACY_TO_NEW_ROLE[legacyRole] ?? legacyRole;
    const roleEntries = buildRoleEntries(legacyRole);

    const existingUser = await db.collection("users").doc(doc.id).get();
    if (existingUser.exists) {
      console.log(`  Atlandı (zaten mevcut): ${doc.id}`);
      skippedCount++;
      continue;
    }

    const now = new Date().toISOString();
    await db.collection("users").doc(doc.id).set({
      uid: data.uid ?? null,
      email: doc.id,
      displayName: data.displayName ?? null,
      role: newRole,
      roles: roleEntries,
      createdAt: data.createdAt ?? now,
      updatedAt: now
    });

    console.log(`  Migrate edildi: ${doc.id} | ${legacyRole} → ${newRole}`);
    migratedCount++;
  }

  console.log(`\n  Tamamlandı: ${migratedCount} migrate edildi, ${skippedCount} atlandı.`);

  console.log("\n2/2 — reportPeriods department alanı ekleniyor...");

  const periodsSnapshot = await db.collection("reportPeriods").get();
  let updatedPeriods = 0;

  for (const doc of periodsSnapshot.docs) {
    const data = doc.data();
    if (!data.department) {
      await db.collection("reportPeriods").doc(doc.id).update({ department: "cs" });
      console.log(`  Güncellendi: ${doc.id} (${data.title ?? "isimsiz"})`);
      updatedPeriods++;
    }
  }

  console.log(`\n  Tamamlandı: ${updatedPeriods} dönem güncellendi.`);
  console.log("\nMigrasyon başarıyla tamamlandı.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migrasyon hatası:", err);
  process.exit(1);
});
