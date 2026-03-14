import type { ReactNode } from "react";

import { cn } from "./utils";

type Tone = "green" | "yellow" | "red" | "neutral";

const toneMap: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  neutral: "bg-slate-50 text-slate-700 border-slate-200"
};

const toneBadgeMap: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-600",
  yellow: "bg-amber-50 text-amber-600",
  red: "bg-rose-50 text-rose-600",
  neutral: "bg-slate-100 text-slate-600"
};

export function SectionCard(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-slate-100 bg-white p-6 shadow-sm", props.className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{props.title}</h2>
          {props.description ? <p className="mt-1 text-sm text-slate-500">{props.description}</p> : null}
        </div>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

export function StatCard(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
  badge?: string;
  badgeTone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        {props.icon ? (
          <div className={cn("rounded-lg p-2", toneBadgeMap[props.tone ?? "neutral"])}>
            {props.icon}
          </div>
        ) : null}
        {props.badge ? (
          <span className={cn(
            "text-xs font-bold px-2 py-1 rounded-full",
            props.badgeTone === "red" ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-500"
          )}>
            {props.badge}
          </span>
        ) : null}
      </div>
      <p className="text-sm font-medium text-slate-500">{props.label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{props.value}</p>
      {props.hint ? <p className="mt-2 text-sm text-slate-500">{props.hint}</p> : null}
    </div>
  );
}

export function KpiBadge(props: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium", toneMap[props.tone ?? "neutral"])}>
      <span>{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

export function HeatChip(props: {
  value: string;
  tone?: Tone;
}) {
  return (
    <span className={cn("inline-flex min-w-20 justify-center rounded-xl border px-3 py-1.5 text-sm font-semibold", toneMap[props.tone ?? "neutral"])}>
      {props.value}
    </span>
  );
}

export function Leaderboard(props: {
  title: string;
  items: Array<{ id: string; label: string; value: string; delta?: string; subtitle?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-4">{props.title}</h3>
      <ul className="space-y-3">
        {props.items.map((item, index) => (
          <li key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold text-slate-900">{item.label}</p>
                {item.subtitle ? <p className="text-xs text-slate-500">{item.subtitle}</p> : null}
                {item.delta ? <p className="text-xs text-slate-500">{item.delta}</p> : null}
              </div>
            </div>
            <span className="text-lg font-bold text-slate-900">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FilterBar(props: {
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      {props.children}
    </div>
  );
}

export function PresentationSlide(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-h-screen rounded-[2rem] border border-slate-200 bg-white/95 p-8 shadow-2xl shadow-slate-900/10">
      {props.eyebrow ? <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">{props.eyebrow}</p> : null}
      <h2 className="mt-3 text-4xl font-semibold text-slate-950">{props.title}</h2>
      {props.subtitle ? <p className="mt-2 max-w-3xl text-lg text-slate-600">{props.subtitle}</p> : null}
      <div className="mt-8">{props.children}</div>
    </section>
  );
}
