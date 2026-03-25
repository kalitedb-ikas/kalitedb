import type { NextRequest } from "next/server";

import type { Role } from "@kalitedb/shared";
import { getFirebaseAdminAuth } from "./firebase-admin";
import { getRepository } from "./repository";
import { ApiError } from "./responses";

export type AuthUser = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorization.slice("Bearer ".length).trim();
}

function getBypassUser(token: string | undefined): AuthUser | undefined {
  if (process.env.APP_AUTH_BYPASS !== "true" || !token) {
    return undefined;
  }

  const bypassUsers: Record<string, AuthUser> = {
    "dev-admin": {
      uid: "dev-admin",
      email: "admin@local.dev",
      displayName: "Dev Admin",
      role: "admin"
    },
    "dev-team": {
      uid: "dev-team",
      email: "team@local.dev",
      displayName: "Dev Team",
      role: "team"
    },
    "dev-ceo": {
      uid: "dev-ceo",
      email: "ceo@local.dev",
      displayName: "Dev CEO",
      role: "ceo"
    },
    "dev-qt": {
      uid: "dev-qt",
      email: "qt@local.dev",
      displayName: "Dev QT",
      role: "qt"
    }
  };

  return bypassUsers[token];
}

function canBootstrapFirstAdmin() {
  return process.env.APP_ALLOW_FIRST_ADMIN_BOOTSTRAP === "true";
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

  const repository = await getRepository();
  let mappedRole = (decoded.role as Role | undefined) ?? (await repository.findRoleByEmail(email));

  if (!mappedRole && canBootstrapFirstAdmin() && !(await repository.hasAnyUserRoles())) {
    const now = new Date().toISOString();
    const bootstrapAssignment = await repository.upsertUserRole({
      uid: decoded.uid,
      email,
      role: "admin",
      createdAt: now,
      updatedAt: now
    });
    mappedRole = bootstrapAssignment.role;
  }

  if (!mappedRole) {
    throw new ApiError(403, "Kullanıcı rol tanımı bulunamadı.");
  }

  return {
    uid: decoded.uid,
    email,
    displayName: decoded.name ?? email,
    role: mappedRole
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

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  return user;
}

export async function requireAuth(request: NextRequest, allowedRoles?: Role[]): Promise<AuthUser> {
  const token = getBearerToken(request);

  if (!token) {
    throw new ApiError(401, "Yetkilendirme bilgisi eksik.");
  }

  const user = await authenticateToken(token);
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new ApiError(403, "Bu işlem için yetkiniz yok.");
  }

  return user;
}
