import type { ReactNode } from "react";

import { cn } from "./utils";

type Tone = "green" | "yellow" | "red" | "neutral";

const toneMap: Record<Tone, string> = {
  green: "bg-emerald-100 text-emerald-950 border-emerald-300",
  yellow: "bg-amber-100 text-amber-950 border-amber-300",
  red: "bg-rose-100 text-rose-950 border-rose-300",
  neutral: "bg-slate-100 text-slate-900 border-slate-200"
};

export function SectionCard(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl border border-slate-200 bg-white p-6 shadow-sm", props.className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{props.title}</h2>
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
}) {
  return (
    <div className={cn("rounded-3xl border p-5", toneMap[props.tone ?? "neutral"])}>
      <p className="text-sm font-medium opacity-70">{props.label}</p>
      <p className="mt-2 text-3xl font-semibold">{props.value}</p>
      {props.hint ? <p className="mt-2 text-sm opacity-75">{props.hint}</p> : null}
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
  items: Array<{ id: string; label: string; value: string; delta?: string }>;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-semibold text-slate-950">{props.title}</h3>
      <ul className="mt-4 space-y-3">
        {props.items.map((item, index) => (
          <li key={item.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <p className="font-medium text-slate-900">{item.label}</p>
                {item.delta ? <p className="text-xs text-slate-500">{item.delta}</p> : null}
              </div>
            </div>
            <span className="text-lg font-semibold text-slate-950">{item.value}</span>
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
    <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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
