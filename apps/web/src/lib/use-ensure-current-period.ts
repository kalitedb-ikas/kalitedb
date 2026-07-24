import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api, type AuthenticatedUser } from "./api";
import { useAuth } from "./auth";
import {
  formatPeriodTitle,
  getCurrentMonth,
  READ_ONLY_ROLES,
  selectMissingPeriods
} from "./period-bootstrap";

// Aynı oturumda ikinci bir deneme yapılmasın: dönem listesi cache'i tazelenene
// kadar sayfa geçişi bileşeni yeniden mount edebilir.
const attempted = new Set<string>();

/**
 * İçinde bulunulan ayın dönem kaydı yoksa otomatik oluşturur; böylece her ay
 * elle "dönem oluştur" adımına gerek kalmaz.
 */
export function useEnsureCurrentPeriods(currentUser: AuthenticatedUser | undefined) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const periods = periodsQuery.data;
  const isReady = periodsQuery.isSuccess;
  const role = currentUser?.role;

  useEffect(() => {
    if (!isReady || !periods || !role || READ_ONLY_ROLES.has(role)) {
      return;
    }

    const month = getCurrentMonth();
    const missing = selectMissingPeriods(periods, month).filter(
      (entry) => !attempted.has(`${entry.department}:${month}`)
    );

    if (missing.length === 0) {
      return;
    }

    missing.forEach((entry) => attempted.add(`${entry.department}:${month}`));

    void Promise.all(
      missing.map((entry) =>
        api
          .createPeriod(auth.token, {
            month,
            title: formatPeriodTitle(month, entry.department),
            department: entry.department,
            ...(entry.compareToPeriodId ? { compareToPeriodId: entry.compareToPeriodId } : {})
          })
          .catch((error: unknown) => {
            // Yetki/bağlantı hatası akışı kesmemeli; ay elle de açılabilir.
            // Anahtar `attempted` içinde kalır: aksi hâlde aşağıdaki invalidate
            // effect'i yeniden tetikleyip sonsuz deneme döngüsü kurar.
            console.warn(
              `[KaliteDB] ${month} ${entry.department} dönemi otomatik oluşturulamadı.`,
              error
            );
          })
      )
    ).then(() => queryClient.invalidateQueries({ queryKey: ["periods", auth.token] }));
  }, [auth.token, isReady, periods, queryClient, role]);
}
