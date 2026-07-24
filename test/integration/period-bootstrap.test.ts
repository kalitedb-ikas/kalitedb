import type { ReportPeriod } from "@kalitedb/shared";
import { describe, expect, it } from "vitest";

import {
  formatPeriodTitle,
  getCurrentMonth,
  selectMissingPeriods
} from "../../apps/web/src/lib/period-bootstrap";

function period(month: string, department: "cs" | "sales", id = `${department}-${month}`): ReportPeriod {
  return {
    id,
    month,
    title: `${department} ${month}`,
    status: "draft",
    department,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

describe("getCurrentMonth", () => {
  it("yerel takvime göre YYYY-MM üretir", () => {
    expect(getCurrentMonth(new Date(2026, 6, 24))).toBe("2026-07");
    expect(getCurrentMonth(new Date(2026, 0, 1))).toBe("2026-01");
    expect(getCurrentMonth(new Date(2026, 11, 31))).toBe("2026-12");
  });
});

describe("formatPeriodTitle", () => {
  it("departmana göre mevcut başlık düzenini korur", () => {
    expect(formatPeriodTitle("2026-07", "sales")).toBe("Satış Temmuz 2026 Audit Raporu");
    expect(formatPeriodTitle("2026-07", "cs")).toBe("Customer Success Temmuz 2026 CSAT Raporu");
  });
});

describe("selectMissingPeriods", () => {
  it("eksik ayı bir önceki dönemle karşılaştırmaya bağlar", () => {
    const periods = [period("2026-06", "sales", "haziran"), period("2026-07", "cs")];

    expect(selectMissingPeriods(periods, "2026-07")).toEqual([
      { department: "sales", compareToPeriodId: "haziran" }
    ]);
  });

  it("ay zaten varsa hiçbir şey döndürmez", () => {
    const periods = [period("2026-07", "sales"), period("2026-07", "cs")];

    expect(selectMissingPeriods(periods, "2026-07")).toEqual([]);
  });

  it("hiç dönemi olmayan departmanı kendiliğinden başlatmaz", () => {
    const periods = [period("2026-06", "cs")];

    expect(selectMissingPeriods(periods, "2026-07")).toEqual([
      { department: "cs", compareToPeriodId: "cs-2026-06" }
    ]);
  });

  it("bir önceki ay yoksa karşılaştırma dönemi boş kalır", () => {
    const periods = [period("2026-04", "sales", "nisan")];

    expect(selectMissingPeriods(periods, "2026-07")).toEqual([
      { department: "sales", compareToPeriodId: undefined }
    ]);
  });

  it("departmanı yazılmamış eski kayıtları cs sayar", () => {
    const legacy = { ...period("2026-06", "cs", "eski") } as ReportPeriod & { department?: string };
    delete legacy.department;
    const periods = [legacy as ReportPeriod];

    expect(selectMissingPeriods(periods, "2026-07")).toEqual([
      { department: "cs", compareToPeriodId: "eski" }
    ]);
  });

  it("yıl sınırında bir önceki ayı aralıkta bulur", () => {
    const periods = [period("2025-12", "sales", "aralik")];

    expect(selectMissingPeriods(periods, "2026-01")).toEqual([
      { department: "sales", compareToPeriodId: "aralik" }
    ]);
  });
});
