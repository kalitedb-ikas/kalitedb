import { SurfaceCard } from "@kalitedb/ui";
import { normalizeKey, type Representative } from "@kalitedb/shared";
import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

import { formatAuditScore, formatPercent } from "../lib/format";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";
import { RepNameCell } from "./rep-name-cell";

export const MONTH_LABELS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export type MonthlyAgentRow = {
  agentKey: string;
  agentName: string;
  /** 12 hücre, index 0 = Ocak. null = veri yok */
  months: (number | null)[];
};

export function isAuditSummaryRow(agentName: string) {
  return normalizeKey(agentName).includes("ortalama");
}

export function SummaryLine(props: { title: string; value: string; detail?: string | undefined }) {
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white/92 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] dark:border-slate-600/40 dark:bg-slate-800/60">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{props.title}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-slate-100">{props.value}</p>
      {props.detail ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{props.detail}</p> : null}
    </div>
  );
}

export function AuditTableBadge(props: { value: number | null | undefined; isPercent?: boolean }) {
  if (props.value === null || props.value === undefined) {
    return <span className="text-slate-400">-</span>;
  }

  const toneClass =
    props.value < 70
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400"
      : props.value < 85
        ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400"
        : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-600/40 dark:bg-emerald-900/40 dark:text-emerald-300";

  return (
    <span className={`inline-flex min-w-24 justify-center rounded-full border px-3 py-1.5 text-sm font-semibold ${toneClass}`}>
      {props.isPercent ? formatPercent(props.value) : formatAuditScore(props.value)}
    </span>
  );
}

export function buildAgentAvatar(name: string, index: number) {
  const repositoryPhoto = getRepresentativePhotoSrc(name);
  if (repositoryPhoto) {
    return repositoryPhoto;
  }

  const palettes: Array<{ start: string; end: string }> = [
    { start: "#fb923c", end: "#f97316" },
    { start: "#38bdf8", end: "#0ea5e9" },
    { start: "#34d399", end: "#10b981" },
    { start: "#a78bfa", end: "#8b5cf6" }
  ];
  const palette = palettes[index % palettes.length] || { start: "#fb923c", end: "#f97316" };
  const initials = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="40" fill="url(#bg)" />
      <text
        x="50%"
        y="54%"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="white"
        font-family="Inter, Arial, sans-serif"
        font-size="52"
        font-weight="700"
        letter-spacing="4"
      >
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/* ── Aylık Pivot Tablo Bileşeni ── */

export function MonthlyTable(props: {
  title: string;
  data: MonthlyAgentRow[];
  summaryMode: "total" | "average";
  emptyNote?: string;
  valueFormatter?: (value: number) => string;
  /** agentKey -> note (dönem bazlı). Not olan temsilcilerin satırında ikon gösterilir */
  noteMap?: Map<string, string>;
  /** Not ikonuna tıklandığında tetiklenir */
  onNoteClick?: (agentKey: string, agentName: string, currentNote: string) => void;
  /** Hücrelere değere göre renk uygula */
  colorScale?: "count";
  /** Kartın sağ üstüne yerleştirilecek aksiyon bölümü (örn. BadgeFilter) */
  actions?: ReactNode;
  /** agentKey -> Representative eşlemesi; verilirse "Ayrıldı" rozeti otomatik render edilir */
  repsMap?: Map<string, Representative>;
}) {
  const formatter = props.valueFormatter ?? String;
  const hasAnyData = props.data.some((row) => row.months.some((v) => v !== null));
  const isAvgMode = props.summaryMode === "average";
  const summaryLabel = isAvgMode ? "Ortalama" : "Toplam";

  /* Her ay için özet satırı: ortalama veya toplam */
  const monthlySummary = MONTH_LABELS.map((_, monthIdx) => {
    const values = props.data
      .map((row) => row.months[monthIdx])
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return isAvgMode
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : values.reduce((sum, v) => sum + v, 0);
  });

  return (
    <SurfaceCard
      title={props.title}
      variant="default"
      headerClassName="bg-emerald-800 border-emerald-700 dark:bg-emerald-900"
      titleClassName="text-white"
      actions={props.actions}
    >
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-800/80">
              <th className="sticky left-0 z-10 w-10 bg-slate-50/80 px-3 py-3 text-left text-sm font-semibold uppercase tracking-[0.16em] text-slate-400 dark:bg-slate-800/80">
                #
              </th>
              <th className="sticky left-10 z-10 min-w-[140px] bg-slate-50/80 px-3 py-3 text-left text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                Temsilci
              </th>
              {MONTH_LABELS.map((month) => (
                <th
                  key={month}
                  className="w-[60px] px-2 py-3 text-center text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400"
                >
                  {month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {props.data.map((row, index) => {
              return (
                <tr key={row.agentKey} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-700/30">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-medium text-slate-400 dark:bg-slate-800/90">
                    {index + 1}
                  </td>
                  <td className="sticky left-10 z-10 bg-white px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap dark:bg-slate-800/90 dark:text-slate-200">
                    <span className="inline-flex items-center gap-1.5">
                      {props.repsMap ? (
                        <RepNameCell name={row.agentName} rep={props.repsMap.get(row.agentKey)} />
                      ) : (
                        row.agentName
                      )}
                      {props.noteMap && (
                        <button
                          className={[
                            "inline-flex size-5 flex-shrink-0 items-center justify-center rounded-full transition",
                            props.noteMap.has(row.agentKey)
                              ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                              : "text-slate-300 hover:text-slate-400 hover:bg-slate-50 dark:text-slate-500 dark:hover:text-slate-400 dark:hover:bg-slate-700/50"
                          ].join(" ")}
                          onClick={() => props.onNoteClick?.(row.agentKey, row.agentName, props.noteMap?.get(row.agentKey) ?? "")}
                          title={props.noteMap.has(row.agentKey) ? "Notu görüntüle" : "Not ekle"}
                          type="button"
                        >
                          <MessageSquare size={12} />
                        </button>
                      )}
                    </span>
                  </td>
                  {row.months.map((value, monthIdx) => {
                    const cellColor = value !== null && props.colorScale === "count"
                      ? value === 0
                        ? "bg-slate-100 text-slate-400 dark:bg-slate-700/50 dark:text-slate-500"
                        : value === 1
                          ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                          : value === 2
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                            : value >= 3
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300";
                    return (
                      <td key={monthIdx} className="px-2 py-2.5 text-center tabular-nums">
                        {value !== null ? (
                          <span className={`inline-flex min-w-[36px] justify-center rounded-[10px] px-2 py-0.5 text-sm font-medium ${cellColor}`}>
                            {formatter(value)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-800/80">
              <td className="sticky left-0 z-10 bg-slate-50/80 px-3 py-3 dark:bg-slate-800/80" />
              <td className="sticky left-10 z-10 bg-slate-50/80 px-3 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                {summaryLabel}
              </td>
              {monthlySummary.map((val, monthIdx) => (
                <td key={monthIdx} className="px-2 py-3 text-center tabular-nums">
                  {val !== null ? (
                    <span className="inline-flex min-w-[36px] justify-center rounded-[10px] bg-slate-900 px-2 py-0.5 text-sm font-bold text-white dark:bg-slate-200 dark:text-slate-900">
                      {formatter(Number(val.toFixed(2)))}
                    </span>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">-</span>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {!hasAnyData && props.emptyNote ? (
        <p className="mt-3 text-xs italic text-slate-400">{props.emptyNote}</p>
      ) : null}
    </SurfaceCard>
  );
}
