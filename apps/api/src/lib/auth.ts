import type { NextRequest } from "next/server";

import type { Department, Role, UserRoleEntry } from "@kalitedb/shared";
import { isDevelopment } from "./env";
import { getFirebaseAdminAuth } from "./firebase-admin";
import { getRepository } from "./repository";
import { ApiError } from "./responses";

export type AuthUser = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;              // birincil rol (geriye dönük uyumluluk)
  roles: UserRoleEntry[]; // tüm departman atamaları
  representativeKey?: string | undefined; // representative rolündeki kullanıcının eşleştiği temsilci
};

export function representativeKeyFor(user: AuthUser): string | undefined {
  return user.role === "representative" ? user.representativeKey : undefined;
}

export function isAdmin(user: AuthUser): boolean {
  return user.role === "admin";
}

export function hasRoleInDepartment(user: AuthUser, department: Department, roles: Role[]): boolean {
  if (isAdmin(user)) return true;
  return user.roles.some((entry) => entry.department === department && roles.includes(entry.role));
}

export function canManageReports(user: AuthUser, department?: Department): boolean {
  if (isAdmin(user)) return true;
  const managerRoles: Role[] = ["manager", "team_leader", "team"];
  if (!department) return user.roles.some((entry) => managerRoles.includes(entry.role));
  return hasRoleInDepartment(user, department, managerRoles);
}

export function canEnterData(user: AuthUser, department?: Department): boolean {
  if (canManageReports(user, department)) return true;
  const qualityRoles: Role[] = ["quality", "qt"];
  if (!department) return user.roles.some((entry) => qualityRoles.includes(entry.role));
  return hasRoleInDepartment(user, department, qualityRoles);
}

export function canManageRoleplayContent(user: AuthUser): boolean {
  if (isAdmin(user)) return true;
  if (user.role === "roleplay_admin") return true;
  return user.roles.some((entry) => entry.role === "roleplay_admin");
}

const DEFAULT_ALLOWED_EMAIL_DOMAINS = ["ikas.com"] as const;

function getAllowedEmailDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS;
  if (!raw) return [...DEFAULT_ALLOWED_EMAIL_DOMAINS];
  const parsed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_EMAIL_DOMAINS];
}

function isEmailDomainAllowed(email: string): boolean {
  const lower = email.toLowerCase();
  return getAllowedEmailDomains().some((domain) => lower.endsWith(`@${domain}`));
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorization.slice("Bearer ".length).trim();
}

function getBypassUser(token: string | undefined): AuthUser | undefined {
  if (!isDevelopment() || process.env.APP_AUTH_BYPASS !== "true" || !token) {
    return undefined;
  }

  const bypassUsers: Record<string, AuthUser> = {
    "dev-admin": {
      uid: "dev-admin",
      email: "admin@local.dev",
      displayName: "Dev Admin",
      role: "admin",
      roles: [{ role: "admin" }]
    },
    "dev-team": {
      uid: "dev-team",
      email: "team@local.dev",
      displayName: "Dev Team",
      role: "team_leader",
      roles: [{ department: "cs", role: "team_leader" }]
    },
    "dev-ceo": {
      uid: "dev-ceo",
      email: "ceo@local.dev",
      displayName: "Dev CEO",
      role: "manager",
      roles: [{ department: "cs", role: "manager", level: "senior" }]
    },
    "dev-qt": {
      uid: "dev-qt",
      email: "qt@local.dev",
      displayName: "Dev QT",
      role: "quality",
      roles: [{ department: "cs", role: "quality" }]
    },
    "dev-sales-manager": {
      uid: "dev-sales-manager",
      email: "sales-manager@local.dev",
      displayName: "Dev Sales Manager",
      role: "manager",
      roles: [{ department: "sales", role: "manager", level: "mid" }]
    },
    "dev-representative": {
      uid: "dev-representative",
      email: "rep@local.dev",
      displayName: "Dev Representative",
      role: "representative",
      roles: [{ department: "cs", role: "representative", representativeKey: "test-rep" }],
      representativeKey: "test-rep"
    }
  };

  return bypassUsers[token];
}

function canBootstrapFirstAdmin() {
  return isDevelopment() && process.env.APP_ALLOW_FIRST_ADMIN_BOOTSTRAP === "true";
}

async function authenticateToken(token: string): Promise<AuthUser> {
  const bypassUser = getBypassUser(token);

  if (bypassUser) {
    return bypassUser;
  }

  const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
  const email = decoded.email;
  if (!email) {
    throw new ApiError(401, "E-posta bilgisi bulunamadı.");
  }

  if (!isEmailDomainAllowed(email)) {
    throw new ApiError(403, "Bu uygulamaya yalnızca @ikas.com hesapları erişebilir.");
  }

  const repository = await getRepository();

  // Önce yeni users koleksiyonuna bak, yoksa eski userRoles'a düş
  let user = await repository.findUserByEmail(email);

  if (!user && canBootstrapFirstAdmin() && !(await repository.hasAnyUserRoles())) {
    const now = new Date().toISOString();
    user = await repository.upsertUser({
      uid: decoded.uid,
      email,
      role: "admin",
      roles: [{ role: "admin" }],
      createdAt: now,
      updatedAt: now
    });
    // Eski koleksiyona da yaz (geriye dönük uyumluluk)
    await repository.upsertUserRole({ uid: decoded.uid, email, role: "admin", departments: [], createdAt: now, updatedAt: now });
  }

  const mappedRole = (decoded.role as Role | undefined) ?? user?.role ?? (await repository.findRoleByEmail(email));

  if (!mappedRole) {
    throw new ApiError(403, "Kullanıcı rol tanımı bulunamadı.");
  }

  const claimRepKey = typeof decoded.representativeKey === "string" ? decoded.representativeKey : undefined;
  const userRepKey = user?.representativeKey;
  const roleEntryRepKey = user?.roles?.find((entry) => entry.role === "representative")?.representativeKey;
  const representativeKey = claimRepKey ?? userRepKey ?? roleEntryRepKey;

  if (mappedRole === "representative" && !representativeKey) {
    throw new ApiError(
      403,
      "Temsilci rolü için temsilci eşleşmesi atanmamış. Lütfen yöneticinizle iletişime geçin."
    );
  }

  return {
    uid: decoded.uid,
    email,
    displayName: decoded.name ?? email,
    role: mappedRole,
    roles: user?.roles ?? [],
    representativeKey
  };
}

export async function getOptionalAuth(request: NextRequest, allowedRoles?: Role[]): Promise<AuthUser | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  let user: AuthUser;
  try {
    user = await authenticateToken(token);
  } catch {
    return null;
  }

  // Tüm rollere admin yetkisi verildi — rol kısıtlaması devre dışı
  return user;
}

export async function requireAuth(request: NextRequest, allowedRoles?: Role[]): Promise<AuthUser> {
  const token = getBearerToken(request);

  if (!token) {
    throw new ApiError(401, "Yetkilendirme bilgisi eksik.");
  }

  const user = await authenticateToken(token);
  // Tüm rollere admin yetkisi verildi — rol kısıtlaması devre dışı
  return user;
}
