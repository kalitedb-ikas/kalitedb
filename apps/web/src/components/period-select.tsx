import type { ReportPeriod } from "@kalitedb/shared";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import { useQuery } from "@tanstack/react-query";
import { startTransition, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPeriodMonth } from "../lib/format";
import { FancySelect } from "./fancy-select";

type Department = "cs" | "sales" | "quality";

function getDepartment(pathname: string): Department {
  if (pathname.startsWith("/quality")) return "quality";
  if (pathname.startsWith("/sales")) return "sales";
  return "cs";
}

export function PeriodSelect() {
  const auth = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const department = getDepartment(location.pathname);

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  // Kalite sekmesi şimdilik CS dönemlerini kullanır
  const effectiveDepartment: Department = department === "quality" ? "cs" : department;

  const departmentPeriods = useMemo(
    () => (periodsQuery.data ?? []).filter((p: ReportPeriod) => (p.department ?? "cs") === effectiveDepartment),
    [periodsQuery.data, effectiveDepartment]
  );

  const activePeriodId = searchParams.get("periodId") ?? selectDefaultReportPeriod(departmentPeriods)?.id ?? "";

  const options = useMemo(
    () =>
      departmentPeriods.map((period) => ({
        value: period.id,
        label: formatPeriodMonth(period.month)
      })),
    [departmentPeriods]
  );

  const handleChange = (periodId: string) => {
    const next = new URLSearchParams(searchParams);
    if (periodId) {
      next.set("periodId", periodId);
    } else {
      next.delete("periodId");
    }
    startTransition(() => setSearchParams(next));
  };

  if (departmentPeriods.length === 0) return null;

  return (
    <FancySelect
      options={options}
      value={activePeriodId}
      onChange={handleChange}
      placeholder="Dönem seçin"
      panelWidthClass="w-44"
    />
  );
}
