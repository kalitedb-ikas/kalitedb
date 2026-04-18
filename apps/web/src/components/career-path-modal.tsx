import type { TimelineEvent, TimelineEventType } from "@kalitedb/shared";
import { Award, Circle, Rocket, Shuffle, TrendingUp, X } from "lucide-react";
import type { ReactNode } from "react";

import { formatDateLong, formatDuration } from "../lib/format";
import { BadgePill } from "./representative-detail-modal";

type IconProps = { size?: number };
type IconDef = { icon: (props: IconProps) => ReactNode; className: string };

const TYPE_ICONS: Record<TimelineEventType, IconDef> = {
  start: { icon: (p) => <Rocket size={p.size ?? 14} />, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  promotion: { icon: (p) => <TrendingUp size={p.size ?? 14} />, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  department_change: { icon: (p) => <Shuffle size={p.size ?? 14} />, className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  achievement: { icon: (p) => <Award size={p.size ?? 14} />, className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  other: { icon: (p) => <Circle size={p.size ?? 14} />, className: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" }
};

const TYPE_LABELS: Record<TimelineEventType, string> = {
  start: "Başlangıç",
  promotion: "Terfi",
  department_change: "Departman değişimi",
  achievement: "Başarı",
  other: "Diğer"
};

function getTypeDef(type: TimelineEventType | undefined) {
  return TYPE_ICONS[type ?? "other"];
}

export function CareerPathModal(props: {
  events: TimelineEvent[];
  repName: string;
  onClose: () => void;
}) {
  const sorted = [...props.events].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const earliestStart = sorted.length > 0 ? sorted[sorted.length - 1]!.startDate : null;
  const current = sorted.find((e) => !e.endDate) ?? sorted[0] ?? null;
  const totalExperience = earliestStart ? formatDuration(earliestStart) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={props.onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          onClick={props.onClose}
          type="button"
          aria-label="Kapat"
        >
          <X size={18} />
        </button>

        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Kariyer yolu</p>
          <h3 className="mt-1 font-display text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">{props.repName}</h3>
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-600 dark:bg-slate-700/30">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Henüz kariyer bilgisi eklenmemiş.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
              Admin sayfasından temsilciye kilometre taşı ekleyebilirsin.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600/40 dark:bg-slate-800/60">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">ikas'ta toplam</p>
                <p className="mt-1 text-base font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">{totalExperience || "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600/40 dark:bg-slate-800/60">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Başlangıç</p>
                <p className="mt-1 text-base font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">{earliestStart ? formatDateLong(earliestStart) : "-"}</p>
              </div>
              <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600/40 dark:bg-slate-800/60 sm:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Şu anki rol</p>
                <p className="mt-1 truncate text-base font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">{current?.role || current?.title || "-"}</p>
              </div>
            </div>

            <ol className="relative ml-3 border-l-2 border-slate-200 pl-6 dark:border-slate-600">
              {sorted.map((event, idx) => {
                const typeDef = getTypeDef(event.type);
                const isOngoing = !event.endDate;
                const duration = formatDuration(event.startDate, event.endDate);
                const dateLabel = event.endDate
                  ? `${formatDateLong(event.startDate)} — ${formatDateLong(event.endDate)}`
                  : `${formatDateLong(event.startDate)} — Devam ediyor`;

                return (
                  <li key={event.id} className={idx === sorted.length - 1 ? "pb-0" : "pb-6"}>
                    <span className={`absolute -left-[14px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-sm dark:border-slate-800 ${typeDef.className}`}>
                      {typeDef.icon({ size: 12 })}
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{event.title}</h4>
                      {event.type ? (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{TYPE_LABELS[event.type]}</span>
                      ) : null}
                      {isOngoing ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aktif
                        </span>
                      ) : null}
                    </div>
                    {event.role ? (
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{event.role}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{dateLabel}</span>
                      {duration ? <span className="text-slate-400 dark:text-slate-500">·</span> : null}
                      {duration ? <span className="font-medium text-slate-600 dark:text-slate-300">{duration}</span> : null}
                      {event.department ? <BadgePill badgeKey={event.department} small /> : null}
                    </div>
                    {event.note ? (
                      <p className="mt-1.5 text-xs italic text-slate-500 dark:text-slate-400">{event.note}</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
