import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { Department, Representative } from "@kalitedb/shared";

import { api, type AuthenticatedUser } from "./api";
import { useAuth } from "./auth";

export type RepScope = {
  isRepresentative: boolean;
  lockedKey: string | undefined;
  department: Department | undefined;
  repDoc: Representative | undefined;
  displayName: string | undefined;
};



/**
 * Mevcut kullanıcının "representative" rolündeyse hangi temsilciye kilitli
 * olduğunu döner. Diğer roller için boş scope.
 *
 * `currentUser` parametresi verilmezse hook kendi `getMe` çağrısını yapar;
 * her sayfada prop olarak elden geçirme zorunluluğunu ortadan kaldırır.
 */
export function useRepScope(currentUser?: AuthenticatedUser | null): RepScope {
  const auth = useAuth();

  const meQuery = useQuery({
    enabled: !currentUser && Boolean(auth.token),
    queryKey: ["me", auth.token],
    queryFn: () => api.getMe(auth.token),
    retry: false,
    staleTime: 5 * 60 * 1000
  });

  const effectiveUser = currentUser ?? (meQuery.isSuccess ? meQuery.data : undefined);
  const isRepresentative = effectiveUser?.role === "representative";
  const lockedKey = isRepresentative ? effectiveUser?.representativeKey ?? undefined : undefined;

  const repsQuery = useQuery({
    enabled: Boolean(lockedKey),
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 10 * 60 * 1000
  });

  return useMemo(() => {
    const repDoc = lockedKey ? repsQuery.data?.find((r) => r.key === lockedKey) : undefined;
    return {
      isRepresentative,
      lockedKey,
      department: repDoc?.department,
      repDoc,
      displayName: repDoc?.displayName
    };
  }, [isRepresentative, lockedKey, repsQuery.data]);
}
