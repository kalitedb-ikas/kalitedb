import type { ReportPeriod } from "@kalitedb/shared";
import { FilterBar, MetaChip } from "@kalitedb/ui";

export function PeriodFilters(props: {
  periods: ReportPeriod[];
  periodId: string | undefined;
  compareToPeriodId: string | undefined;
  onPeriodChange: (value: string) => void;
  onCompareChange: (value: string) => void;
  title?: string;
  supportingText?: string;
}) {
  const selectedPeriod = props.periods.find((period) => period.id === props.periodId);
  const selectedComparison = props.periods.find((period) => period.id === props.compareToPeriodId);

  return (
    <FilterBar
      inlineSummary={
        <>
          <MetaChip>Dönem: {selectedPeriod?.title ?? "Seçilmedi"}</MetaChip>
          <MetaChip>Karşılaştırma: {selectedComparison?.title ?? "Yok"}</MetaChip>
        </>
      }
      supportingText={props.supportingText ?? "Dönemler arası karşılaştırmayı değiştirerek aynı ekran üzerinde farklı görünümü inceleyin."}
      title={props.title ?? "Dönem filtresi"}
    >
      <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-medium text-slate-600">
        Dönem
        <select
          className="h-11 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition focus:border-primary/40 focus:outline-none"
          onChange={(event) => props.onPeriodChange(event.target.value)}
          value={props.periodId ?? ""}
        >
          <option value="">Seçin</option>
          {props.periods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.title}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-medium text-slate-600">
        Karşılaştırma dönemi
        <select
          className="h-11 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition focus:border-primary/40 focus:outline-none"
          onChange={(event) => props.onCompareChange(event.target.value)}
          value={props.compareToPeriodId ?? ""}
        >
          <option value="">Seçin</option>
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
