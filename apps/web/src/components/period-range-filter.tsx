import type { ReportPeriod } from "@kalitedb/shared";
import { useMemo } from "react";

import { formatPeriodMonth } from "../lib/format";
import { QUARTER_LABELS, derivePeriodRangeSelectors } from "../lib/period-aggregation";
import { FancySelect } from "./fancy-select";

export type PeriodViewMode = "aylik" | "ceyreklik" | "yillik";

export type PeriodRangeValue = {
  year: string;
  viewMode: PeriodViewMode;
  monthPeriodId?: string | undefined;
  quarter?: number | undefined;
};

export type PeriodRangeFilterProps = {
  periods: ReportPeriod[];
  value: PeriodRangeValue;
  onChange: (next: PeriodRangeValue) => void;
};

/**
 * Yıl pill'leri + Aylık/Çeyreklik/Yıllık toggle + Ay/Çeyrek dropdown içeren
 * reusable dönem filtresi. Controlled komponenttir — state yönetimi çağıran tarafta.
 */
export function PeriodRangeFilter(props: PeriodRangeFilterProps) {
  const { periods, value, onChange } = props;

  const { availableYears, yearPeriods, availableQuarters } = useMemo(
    () => derivePeriodRangeSelectors(periods, value.year),
    [periods, value.year]
  );

  const handleYearChange = (nextYear: string) => {
    // Yıl değiştiğinde monthPeriodId ve quarter'ı yeniden hesapla
    const { yearPeriods: nextYearPeriods, availableQuarters: nextQuarters } =
      derivePeriodRangeSelectors(periods, nextYear);
    const nextMonth = nextYearPeriods[nextYearPeriods.length - 1]?.id;
    const nextQuarter = nextQuarters[nextQuarters.length - 1] ?? 1;
    onChange({
      year: nextYear,
      viewMode: value.viewMode,
      monthPeriodId: nextMonth,
      quarter: nextQuarter
    });
  };

  const handleViewModeChange = (nextMode: PeriodViewMode) => {
    onChange({ ...value, viewMode: nextMode });
  };

  const handleMonthChange = (nextId: string) => {
    onChange({ ...value, monthPeriodId: nextId });
  };

  const handleQuarterChange = (nextQuarter: number) => {
    onChange({ ...value, quarter: nextQuarter });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Yıl seçici */}
      <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-600 dark:bg-slate-800/80">
        {availableYears.map((year) => (
          <button
            key={year}
            className={[
              "flex min-h-7 items-center rounded-full px-3 text-xs font-semibold transition",
              year === value.year
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            ].join(" ")}
            onClick={() => handleYearChange(year)}
            type="button"
          >
            {year}
          </button>
        ))}
      </div>

      {/* Görünüm modu seçici */}
      <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-600 dark:bg-slate-800/80">
        {(["aylik", "ceyreklik", "yillik"] as const).map((mode) => (
          <button
            key={mode}
            className={[
              "flex min-h-7 items-center rounded-full px-3 text-xs font-semibold transition",
              mode === value.viewMode
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            ].join(" ")}
            onClick={() => handleViewModeChange(mode)}
            type="button"
          >
            {mode === "aylik" ? "Aylık" : mode === "ceyreklik" ? "Çeyreklik" : "Yıllık"}
          </button>
        ))}
      </div>

      {/* Aylık dropdown */}
      {value.viewMode === "aylik" ? (
        <FancySelect
          size="sm"
          disabled={yearPeriods.length === 0}
          value={value.monthPeriodId ?? ""}
          onChange={(v) => handleMonthChange(v)}
          options={yearPeriods.map((p) => ({ value: p.id, label: formatPeriodMonth(p.month) }))}
          placeholder={yearPeriods.length === 0 ? "Dönem yok" : "Ay seçin"}
          panelWidthClass="w-44"
        />
      ) : null}

      {/* Çeyreklik dropdown */}
      {value.viewMode === "ceyreklik" ? (
        <FancySelect
          size="sm"
          disabled={availableQuarters.length === 0}
          value={value.quarter != null ? String(value.quarter) : ""}
          onChange={(v) => handleQuarterChange(Number(v))}
          options={availableQuarters.map((q) => ({ value: String(q), label: QUARTER_LABELS[q - 1] ?? `Q${q}` }))}
          placeholder={availableQuarters.length === 0 ? "Çeyrek yok" : "Çeyrek seçin"}
          panelWidthClass="w-44"
        />
      ) : null}
    </div>
  );
}
