import type { ReportPeriod } from "@kalitedb/shared";

import { formatPeriodMonth, getPreviousPeriod } from "./format";

export type PeriodDepartment = "cs" | "sales";

export type MissingPeriod = {
  department: PeriodDepartment;
  compareToPeriodId: string | undefined;
};

// Dönem üst dokümanı oluşturamayan roller (firestore.rules içindeki isWriter ile aynı).
export const READ_ONLY_ROLES = new Set(["viewer", "representative"]);

// Kalite sekmesi CS dönemlerini kullandığı için ayrı departmanı yok.
export const PERIOD_DEPARTMENTS: PeriodDepartment[] = ["cs", "sales"];

export function getCurrentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatPeriodTitle(month: string, department: PeriodDepartment) {
  const label = formatPeriodMonth(month, { includeYear: true });
  return department === "sales"
    ? `Satış ${label} Audit Raporu`
    : `Customer Success ${label} CSAT Raporu`;
}

/**
 * Verilen ay için hangi departmanların dönem kaydının eksik olduğunu döndürür.
 * Hiç dönemi olmayan departman atlanır (kullanılmayan departmanı kendiliğinden
 * başlatmamak için), mevcut ayı zaten olan departman da atlanır.
 */
export function selectMissingPeriods(periods: ReportPeriod[], month: string): MissingPeriod[] {
  const previousMonth = getPreviousPeriod(month);

  return PERIOD_DEPARTMENTS.flatMap((department) => {
    const departmentPeriods = periods.filter(
      (period) => (period.department ?? "cs") === department
    );
    if (departmentPeriods.length === 0) {
      return [];
    }
    if (departmentPeriods.some((period) => period.month === month)) {
      return [];
    }

    return [
      {
        department,
        compareToPeriodId: departmentPeriods.find((period) => period.month === previousMonth)?.id
      }
    ];
  });
}
