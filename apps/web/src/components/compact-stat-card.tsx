import type { ReactNode } from "react";

export function CompactStatCard(props: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Varsayılan `text-2xl`. Uzun metin/birden fazla isim göstereceksen `text-base` geç. */
  valueClassName?: string;
}) {
  const valueClass = props.valueClassName ?? "text-2xl font-semibold leading-tight";
  return (
    <div className="flex min-w-0 flex-col rounded-[10px] border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-slate-600/40 dark:bg-slate-800/60">
      <p className="text-sm text-slate-600 dark:text-slate-400">{props.label}</p>
      <div className={`mt-2 min-w-0 break-words text-slate-900 dark:text-slate-100 ${valueClass}`}>
        {props.value}
      </div>
      {props.hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{props.hint}</p>
      ) : null}
    </div>
  );
}
