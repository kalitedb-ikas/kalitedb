import { buildDashboardSnapshot } from "@kalitedb/shared";
import type { DashboardSnapshot, RepresentativeExclusionSurface } from "@kalitedb/shared";
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

/**
 * Belirli bir CS yüzeyinden ("audit" | "csat" | "dashboard") hariç tutulan
 * temsilci key'lerini döner. İşaret temsilci yönetimindeki "Dahil Olduğu
 * Alanlar" toggle'larından gelir; hariç tutulan temsilci o sayfada tablo,
 * ortalama ve grafiklerden TAMAMEN çıkar (satici_operasyon gizlemesinden
 * farklı — o özet hesaplarında kalır).
 */
export function useRepresentativeKeysExcludedFrom(surface: RepresentativeExclusionSurface): Set<string> {
  const auth = useAuth();

  const query = useQuery({
    queryKey: ["representatives", auth.token],
    queryFn: () => api.getRepresentatives(auth.token),
    staleTime: 10 * 60 * 1000
  });

  return useMemo(() => {
    const reps = query.data ?? [];
    return new Set(reps.filter((r) => (r.exclusions ?? []).includes(surface)).map((r) => r.key));
  }, [query.data, surface]);
}

/**
 * Snapshot'tan hariç tutulan temsilcileri düşürüp özeti yeniden hesaplar.
 * Küme boşsa snapshot'a dokunmaz (aylık görünümde sunucu özeti korunur).
 */
export function excludeAgentsFromSnapshot(
  snapshot: DashboardSnapshot | undefined,
  excludedKeys: Set<string>
): DashboardSnapshot | undefined {
  if (!snapshot || excludedKeys.size === 0) return snapshot;
  return buildDashboardSnapshot({
    period: snapshot.period,
    datasets: {
      ...snapshot.datasets,
      agentMetrics: snapshot.datasets.agentMetrics.filter((a) => !excludedKeys.has(a.agentKey)),
      auditMetrics: snapshot.datasets.auditMetrics.filter((a) => !excludedKeys.has(a.agentKey))
    },
    thresholds: snapshot.thresholds
  });
}
