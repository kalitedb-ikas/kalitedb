import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { PeriodRangeValue, PeriodViewMode } from "../components/period-range-filter";

type PeriodRangeSetter = (
  next: PeriodRangeValue | ((prev: PeriodRangeValue) => PeriodRangeValue)
) => void;

export function useUrlPeriodRange(
  defaults: PeriodRangeValue
): [PeriodRangeValue, PeriodRangeSetter] {
  const [params, setParams] = useSearchParams();

  const value = useMemo<PeriodRangeValue>(() => {
    const qRaw = params.get("quarter");
    return {
      year: params.get("year") ?? defaults.year,
      viewMode: ((params.get("view") as PeriodViewMode | null) ?? defaults.viewMode),
      monthPeriodId: params.get("month") ?? defaults.monthPeriodId,
      quarter: qRaw != null && qRaw !== "" ? Number(qRaw) : defaults.quarter
    };
  }, [params, defaults.year, defaults.viewMode, defaults.monthPeriodId, defaults.quarter]);

  const valueRef = useMemo(() => ({ current: value }), [value]);
  valueRef.current = value;

  const setValue = useCallback<PeriodRangeSetter>(
    (arg) => {
      setParams(
        (prev) => {
          const next = typeof arg === "function" ? arg(valueRef.current) : arg;
          const p = new URLSearchParams(prev);
          if (next.year) p.set("year", next.year);
          else p.delete("year");
          if (next.viewMode) p.set("view", next.viewMode);
          else p.delete("view");
          if (next.monthPeriodId) p.set("month", next.monthPeriodId);
          else p.delete("month");
          if (next.quarter != null) p.set("quarter", String(next.quarter));
          else p.delete("quarter");
          return p;
        },
        { replace: true }
      );
    },
    [setParams, valueRef]
  );

  return [value, setValue];
}

export function useUrlParam(
  key: string,
  defaultValue: string = ""
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? defaultValue;
  const setValue = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set(key, next);
          else p.delete(key);
          return p;
        },
        { replace: true }
      );
    },
    [setParams, key]
  );
  return [value, setValue];
}
