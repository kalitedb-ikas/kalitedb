import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "./api";
import { useAuth } from "./auth";

/**
 * Aktif temsilcilerin key setini döner.
 * - `null`: henüz temsilci verisi populate edilmemiş → filtreleme yapılmaz (geriye uyumlu)
 * - `Set<string>`: sadece status=active olan temsilci key'leri
 */
export function useActiveRepresentativeKeys() {
  const auth = useAuth();

  const query = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 10 * 60 * 1000
  });

  const activeKeys = useMemo(() => {
    const reps = query.data;
    if (!reps || reps.length === 0) return null;
    return new Set(reps.filter((r) => r.status === "active").map((r) => r.key));
  }, [query.data]);

  return { activeKeys, isLoading: query.isLoading };
}

/**
 * Belirli bir etiket (badge) taşıyan temsilci key'lerini döner.
 * CS dashboard/CSAT/Audit sayfalarında "Satıcı Operasyon" etiketi olanları
 * listelerden gizleyip yine de özet/ortalama hesaplarında tutmak için kullanılır.
 */
export function useRepresentativeKeysWithBadge(badgeKey: string): Set<string> {
  const auth = useAuth();

  const query = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 10 * 60 * 1000
  });

  return useMemo(() => {
    const reps = query.data ?? [];
    return new Set(reps.filter((r) => (r.badges ?? []).includes(badgeKey)).map((r) => r.key));
  }, [query.data, badgeKey]);
}
