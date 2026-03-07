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

const BYPASS_USERS: Record<string, AuthUser> = {
  "dev-admin": { uid: "dev-admin", email: "admin@local.dev", displayName: "Dev Admin", role: "admin" },
  "dev-team": { uid: "dev-team", email: "team@local.dev", displayName: "Dev Team", role: "team" },
  "dev-ceo": { uid: "dev-ceo", email: "ceo@local.dev", displayName: "Dev CEO", role: "ceo" }
};

function getBypassUser(token: string | undefined): AuthUser | undefined {
  if (process.env.APP_AUTH_BYPASS !== "true" || !token) {
    return undefined;
  }

  return BYPASS_USERS[token];
}

export async function requireAuth(request: NextRequest, allowedRoles?: Role[]): Promise<AuthUser> {
  const token = getBearerToken(request);
  const bypassUser = getBypassUser(token);

  if (bypassUser) {
    if (allowedRoles && !allowedRoles.includes(bypassUser.role)) {
      throw new ApiError(403, "Bu işlem için yetkiniz yok.");
    }

    return bypassUser;
  }

  if (!token) {
    throw new ApiError(401, "Yetkilendirme bilgisi eksik.");
  }

  const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
  const email = decoded.email;
  if (!email) {
    throw new ApiError(401, "E-posta bilgisi bulunamadı.");
  }

  const repository = await getRepository();
  const mappedRole = (decoded.role as Role | undefined) ?? (await repository.findRoleByEmail(email));

  if (!mappedRole) {
    throw new ApiError(403, "Kullanıcı rol tanımı bulunamadı.");
  }

  if (allowedRoles && !allowedRoles.includes(mappedRole)) {
    throw new ApiError(403, "Bu işlem için yetkiniz yok.");
  }

  return {
    uid: decoded.uid,
    email,
    displayName: decoded.name ?? email,
    role: mappedRole
  };
}
