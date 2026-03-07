import type { ReportPeriod } from "@kalitedb/shared";
import { FilterBar } from "@kalitedb/ui";

export function PeriodFilters(props: {
  periods: ReportPeriod[];
  periodId: string | undefined;
  compareToPeriodId: string | undefined;
  onPeriodChange: (value: string) => void;
  onCompareChange: (value: string) => void;
}) {
  return (
    <FilterBar>
      <label className="flex min-w-56 flex-col gap-2 text-sm font-medium text-slate-700">
        Dönem
        <select
          className="rounded-2xl border border-slate-200 px-3 py-2"
          onChange={(event) => props.onPeriodChange(event.target.value)}
          value={props.periodId ?? ""}
        >
          <option value="">Seçiniz</option>
          {props.periods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.title}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-56 flex-col gap-2 text-sm font-medium text-slate-700">
        Karşılaştırılan ay
        <select
          className="rounded-2xl border border-slate-200 px-3 py-2"
          onChange={(event) => props.onCompareChange(event.target.value)}
          value={props.compareToPeriodId ?? ""}
        >
          <option value="">Seçiniz</option>
          {props.periods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.title}
            </option>
          ))}
        </select>
      </label>
    </FilterBar>
  );
}
