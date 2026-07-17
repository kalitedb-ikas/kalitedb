import type { AuthenticatedUser } from "./api";

export type AppDepartment = "cs" | "sales" | "quality";

const ALL_DEPARTMENTS: AppDepartment[] = ["cs", "sales", "quality"];

/**
 * Kullanıcının erişebileceği departmanları döndürür.
 *
 * - admin / roleplay_admin / ceo: tüm departmanlar (global rol).
 * - Diğer roller: `user.departments` + `user.roles[].department` birleşimi.
 * - Hiç departman tanımı yoksa (eski kayıtlar): tüm departmanlar (geriye uyum).
 */
export function getAllowedDepartments(user: AuthenticatedUser | undefined | null): AppDepartment[] {
  if (!user) return [...ALL_DEPARTMENTS];

  if (user.role === "admin" || user.role === "ceo" || user.role === "roleplay_admin") {
    return [...ALL_DEPARTMENTS];
  }

  const collected = new Set<AppDepartment>();
  for (const dep of user.departments ?? []) {
    if (dep === "cs" || dep === "sales" || dep === "quality") collected.add(dep);
  }
  for (const entry of user.roles ?? []) {
    const dep = entry.department;
    if (dep === "cs" || dep === "sales" || dep === "quality") collected.add(dep);
  }

  // Hiç departman tanımlı değilse global erişim (eski kullanıcı kayıtları için).
  if (collected.size === 0) return [...ALL_DEPARTMENTS];
  return Array.from(collected);
}

export function canAccessDepartment(user: AuthenticatedUser | undefined | null, dep: AppDepartment): boolean {
  return getAllowedDepartments(user).includes(dep);
}

export function getDefaultDepartment(user: AuthenticatedUser | undefined | null): AppDepartment {
  const allowed = getAllowedDepartments(user);
  return allowed[0] ?? "cs";
}
