import type { ReportPeriod } from "@kalitedb/shared";
import { FilterBar, MetaChip } from "@kalitedb/ui";
import { useMemo } from "react";

import { FancySelect } from "./fancy-select";

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

  const options = useMemo(
    () => props.periods.map((period) => ({ value: period.id, label: period.title })),
    [props.periods]
  );

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
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-medium text-slate-600">
        <span>Dönem</span>
        <FancySelect
          options={options}
          value={props.periodId ?? ""}
          onChange={props.onPeriodChange}
          placeholder="Seçin"
          size="lg"
          className="w-full"
          panelWidthClass="w-60"
        />
      </div>

      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-medium text-slate-600">
        <span>Karşılaştırma dönemi</span>
        <FancySelect
          options={options}
          value={props.compareToPeriodId ?? ""}
          onChange={props.onCompareChange}
          placeholder="Seçin"
          size="lg"
          clearable
          clearLabel="Karşılaştırma yok"
          className="w-full"
          panelWidthClass="w-60"
        />
      </div>
    </FilterBar>
  );
}
