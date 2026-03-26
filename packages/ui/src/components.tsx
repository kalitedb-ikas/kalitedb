import type { ReactNode } from "react";

import { cn } from "./utils";

type Tone = "green" | "yellow" | "red" | "neutral";
type ChampionTheme = "orange" | "violet" | "emerald";
type SurfaceVariant = "default" | "elevated" | "subtle" | "dark" | "hero";

const toneMap: Record<Tone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  yellow: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-600"
};

const toneBadgeMap: Record<Tone, string> = {
  green: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  yellow: "border border-amber-200 bg-amber-50 text-amber-700",
  red: "border border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border border-slate-200 bg-slate-50 text-slate-600"
};

const surfaceVariantMap: Record<SurfaceVariant, string> = {
  default: "surface-default text-slate-950",
  elevated: "surface-elevated text-slate-950",
  subtle: "surface-subtle text-slate-950",
  dark: "surface-dark text-white",
  hero: "surface-hero text-slate-950"
};

const championThemes: Record<
  ChampionTheme,
  {
    accent: string;
    glow: string;
    halo: string;
    bar: string;
    tag: string;
    ring: string;
    stageBeam: string;
    stageSource: string;
    stageFloor: string;
  }
> = {
  orange: {
    accent: "text-orange-700",
    glow: "bg-[radial-gradient(circle,_rgba(251,191,36,0.28)_0%,_rgba(251,191,36,0)_72%)]",
    halo: "from-amber-200/90 via-orange-300/70 to-orange-500/45",
    bar: "from-amber-200/90 via-orange-300/70 to-orange-500/60",
    tag: "border-amber-200/60 bg-amber-50/90 text-amber-700",
    ring: "border-amber-200/75",
    stageBeam:
      "linear-gradient(180deg, rgba(219,234,254,0.66) 0%, rgba(125,211,252,0.26) 34%, rgba(255,255,255,0) 100%)",
    stageSource:
      "radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(191,219,254,0.96) 26%, rgba(56,189,248,0.42) 58%, rgba(56,189,248,0) 78%)",
    stageFloor: "radial-gradient(circle, rgba(125,211,252,0.24) 0%, rgba(255,255,255,0) 72%)"
  },
  violet: {
    accent: "text-violet-700",
    glow: "bg-[radial-gradient(circle,_rgba(167,139,250,0.26)_0%,_rgba(167,139,250,0)_72%)]",
    halo: "from-violet-200/90 via-fuchsia-300/65 to-indigo-500/40",
    bar: "from-violet-200/85 via-fuchsia-300/65 to-indigo-500/50",
    tag: "border-violet-200/60 bg-violet-50/90 text-violet-700",
    ring: "border-violet-200/75",
    stageBeam:
      "linear-gradient(180deg, rgba(224,231,255,0.62) 0%, rgba(125,211,252,0.22) 34%, rgba(255,255,255,0) 100%)",
    stageSource:
      "radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(196,181,253,0.92) 24%, rgba(96,165,250,0.34) 56%, rgba(96,165,250,0) 78%)",
    stageFloor: "radial-gradient(circle, rgba(167,139,250,0.18) 0%, rgba(255,255,255,0) 72%)"
  },
  emerald: {
    accent: "text-emerald-700",
    glow: "bg-[radial-gradient(circle,_rgba(110,231,183,0.26)_0%,_rgba(110,231,183,0)_72%)]",
    halo: "from-emerald-200/90 via-teal-300/65 to-cyan-500/40",
    bar: "from-emerald-200/85 via-teal-300/65 to-cyan-500/50",
    tag: "border-emerald-200/60 bg-emerald-50/90 text-emerald-700",
    ring: "border-emerald-200/75",
    stageBeam:
      "linear-gradient(180deg, rgba(204,251,241,0.58) 0%, rgba(103,232,249,0.22) 34%, rgba(255,255,255,0) 100%)",
    stageSource:
      "radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(167,243,208,0.92) 24%, rgba(34,211,238,0.34) 56%, rgba(34,211,238,0) 78%)",
    stageFloor: "radial-gradient(circle, rgba(94,234,212,0.18) 0%, rgba(255,255,255,0) 72%)"
  }
};

function getInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "KD";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function headerDividerClass(variant: SurfaceVariant) {
  return variant === "dark" ? "border-white/12" : "border-slate-200/80";
}

function bodyTextClass(variant: SurfaceVariant) {
  return variant === "dark" ? "text-white/74" : "text-slate-600";
}

function metaChip(variant: SurfaceVariant) {
  return cn(
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
    variant === "dark" ? "border-white/14 bg-white/8 text-white/74" : "border-slate-200 bg-white/84 text-slate-600"
  );
}

export function PageHeader(props: {
  eyebrow?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  metaChips?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <section className={cn("grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end", props.className)}>
      <div>
        {props.eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{props.eyebrow}</p>
        ) : null}
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
          {props.title}
        </h1>
        {props.subtitle ? <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">{props.subtitle}</p> : null}
        {props.metaChips ? <div className="mt-4 flex flex-wrap gap-2">{props.metaChips}</div> : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-3 lg:justify-end">{props.actions}</div> : null}
    </section>
  );
}

export function SurfaceCard(props: {
  variant?: SurfaceVariant | undefined;
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
  headerClassName?: string | undefined;
}) {
  const variant = props.variant ?? "default";

  return (
    <section className={cn(surfaceVariantMap[variant], "overflow-hidden", props.className)}>
      {props.title || props.description || props.actions ? (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4 sm:px-6",
            headerDividerClass(variant),
            props.headerClassName
          )}
        >
          <div>
            {props.title ? <h2 className={cn("font-display text-lg font-semibold tracking-[-0.03em]", variant === "dark" ? "text-white" : "text-slate-950")}>{props.title}</h2> : null}
            {props.description ? <p className={cn("mt-1 text-sm leading-6", bodyTextClass(variant))}>{props.description}</p> : null}
          </div>
          {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("px-5 py-5 sm:px-6 sm:py-6", props.bodyClassName)}>{props.children}</div>
    </section>
  );
}

export function GlassPanel(props: {
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
  variant?: "default" | "solid" | "dark" | undefined;
}) {
  const variant: SurfaceVariant =
    props.variant === "dark" ? "dark" : props.variant === "solid" ? "elevated" : "subtle";

  return (
    <SurfaceCard
      actions={props.actions}
      bodyClassName={props.bodyClassName}
      className={cn("backdrop-blur-xl", props.className)}
      description={props.description}
      title={props.title}
      variant={variant}
    >
      {props.children}
    </SurfaceCard>
  );
}

export function SectionCard(props: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <SurfaceCard
      actions={props.actions}
      className={props.className}
      description={props.description}
      title={props.title}
      variant="elevated"
    >
      {props.children}
    </SurfaceCard>
  );
}

export function StatCard(props: {
  label: string;
  value: string;
  hint?: string | undefined;
  tone?: Tone | undefined;
  icon?: ReactNode | undefined;
  badge?: string | undefined;
  badgeTone?: Tone | undefined;
  emphasis?: "primary" | "secondary" | undefined;
  trendLabel?: string | undefined;
  compact?: boolean | undefined;
}) {
  const tone = props.tone ?? "neutral";
  const emphasis = props.emphasis ?? "secondary";
  const compact = props.compact ?? false;
  const topLabel = props.trendLabel ?? props.badge;
  const topTone = props.trendLabel ? tone : (props.badgeTone ?? "green");

  return (
    <div
      className={cn(
        emphasis === "primary" ? "surface-hero border-sky-100/80 shadow-[0_24px_70px_rgba(125,211,252,0.12)]" : "surface-default",
        "group overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]",
        compact ? "rounded-[24px] p-4" : "rounded-[26px] p-5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {props.icon ? (
          <div
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-2xl border p-2.5",
              toneBadgeMap[tone]
            )}
          >
            {props.icon}
          </div>
        ) : (
          <span className="inline-flex h-2.5 w-14 rounded-full bg-slate-200" />
        )}
        {topLabel ? (
          <span className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", toneBadgeMap[topTone])}>
            {topLabel}
          </span>
        ) : null}
      </div>
      <p className={cn("mt-4 text-sm font-medium text-slate-600", compact ? "line-clamp-1" : "")}>{props.label}</p>
      <p className={cn("mt-2 font-display font-semibold tracking-[-0.04em] text-slate-950", compact ? "text-2xl" : "text-3xl")}>
        {props.value}
      </p>
      {props.hint ? <p className={cn("mt-2 text-sm leading-6 text-slate-600", compact ? "line-clamp-2" : "")}>{props.hint}</p> : null}
    </div>
  );
}

export function HeroStat(props: {
  label: string;
  value: string;
  detail?: string | undefined;
  icon?: ReactNode | undefined;
  className?: string | undefined;
  meta?: string | undefined;
}) {
  return (
    <div className={cn("rounded-[24px] border border-white/14 bg-white/8 p-4 text-white", props.className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.24em] text-white/74">{props.label}</p>
        {props.icon ? <div className="rounded-2xl border border-white/14 bg-white/8 p-2 text-white">{props.icon}</div> : null}
      </div>
      <p className="mt-4 font-display text-3xl font-semibold tracking-[-0.04em] text-white">{props.value}</p>
      {props.detail ? <p className="mt-2 text-sm leading-6 text-white/78">{props.detail}</p> : null}
      {props.meta ? <p className="mt-2 text-xs leading-5 text-white/60">{props.meta}</p> : null}
    </div>
  );
}

export function KpiBadge(props: {
  label: string;
  value: string;
  tone?: Tone | undefined;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium", toneMap[props.tone ?? "neutral"])}>
      <span>{props.label}</span>
      <span className="font-semibold">{props.value}</span>
    </div>
  );
}

export function HeatChip(props: {
  value: string;
  tone?: Tone | undefined;
}) {
  return (
    <span className={cn("inline-flex min-w-20 justify-center rounded-full border px-3 py-1.5 text-sm font-semibold", toneMap[props.tone ?? "neutral"])}>
      {props.value}
    </span>
  );
}

export function Leaderboard(props: {
  title: string;
  items: Array<{ id: string; label: string; value: string; delta?: string; subtitle?: string }>;
  className?: string | undefined;
}) {
  return (
    <SurfaceCard className={props.className} title={props.title} variant="default">
      <ul className="space-y-3">
        {props.items.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200/90 bg-white/92 px-4 py-3 shadow-[0_10px_25px_rgba(15,23,42,0.04)]"
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-2xl border text-xs font-semibold",
                  index === 0 ? "border-orange-200 bg-orange-50 text-orange-700" : "border-slate-200 bg-slate-50 text-slate-600"
                )}
              >
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                {item.subtitle ? <p className="text-xs text-slate-500">{item.subtitle}</p> : null}
                {item.delta ? <p className="text-xs text-slate-500">{item.delta}</p> : null}
              </div>
            </div>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">{item.value}</span>
          </li>
        ))}
      </ul>
    </SurfaceCard>
  );
}

export function FilterBar(props: {
  children: ReactNode;
  className?: string | undefined;
  title?: string | undefined;
  supportingText?: string | undefined;
  inlineSummary?: ReactNode | undefined;
}) {
  return (
    <div className={cn("surface-subtle rounded-[26px] border border-slate-200/80 p-4 sm:p-5", props.className)}>
      {props.title || props.supportingText || props.inlineSummary ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {props.title ? <h2 className="font-display text-base font-semibold tracking-[-0.03em] text-slate-950">{props.title}</h2> : null}
            {props.supportingText ? <p className="mt-1 text-sm leading-6 text-slate-600">{props.supportingText}</p> : null}
          </div>
          {props.inlineSummary ? <div className="flex flex-wrap gap-2">{props.inlineSummary}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">{props.children}</div>
    </div>
  );
}

export function MetricCarouselCard(props: {
  eyebrow: string;
  title: string;
  value: string;
  badge?: string | undefined;
  badgeTone?: Tone | undefined;
  detail?: string | undefined;
  icon?: ReactNode | undefined;
  imageSrc?: string | undefined;
  imageAlt?: string | undefined;
  tone?: ChampionTheme | undefined;
  className?: string | undefined;
}) {
  const theme = championThemes[props.tone ?? "orange"];

  return (
    <div
      className={cn(
        "surface-elevated relative min-w-[280px] snap-start overflow-hidden rounded-[28px] p-5 text-slate-950 transition duration-300 hover:-translate-y-1",
        props.className
      )}
    >
      <div className={cn("absolute inset-x-10 top-0 h-20 blur-3xl", theme.glow)} />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{props.eyebrow}</span>
          {props.imageSrc ? (
            <div className={cn("h-14 w-11 overflow-hidden rounded-[18px] border bg-white/92 shadow-[0_10px_24px_rgba(15,23,42,0.06)]", theme.ring)}>
              <img alt={props.imageAlt ?? props.eyebrow} className="h-full w-full object-cover" src={props.imageSrc} />
            </div>
          ) : props.icon ? (
            <div className={cn("rounded-2xl border bg-white/92 p-2.5 text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.06)]", theme.ring)}>
              {props.icon}
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-sm font-medium text-slate-600">{props.title}</p>
        {props.badge ? (
          <span className={cn("mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold", toneBadgeMap[props.badgeTone ?? "neutral"])}>
            {props.badge}
          </span>
        ) : null}
        <p className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950">{props.value}</p>
        {props.detail ? <p className="mt-2 text-sm leading-6 text-slate-600">{props.detail}</p> : null}
      </div>
    </div>
  );
}

export function ExecutiveChartCard(props: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <SurfaceCard
      actions={props.actions}
      className={props.className}
      description={props.description}
      title={props.title}
      variant="elevated"
    >
      {props.children}
    </SurfaceCard>
  );
}

export function InsightTile(props: {
  icon: ReactNode;
  title: string;
  value: string;
  description?: string | undefined;
}) {
  return (
    <div className="surface-subtle rounded-[24px] border border-slate-200/80 p-4">
      <div className="flex items-start gap-3">
        <div className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/92 p-2 text-slate-700">
          {props.icon}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{props.title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{props.value}</p>
        </div>
      </div>
      {props.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{props.description}</p> : null}
    </div>
  );
}

export function QuestionSpotlight(props: {
  label: string;
  title: string;
  topic: string;
  score: string;
  tone: string;
  accent: string;
  trailing?: ReactNode | undefined;
}) {
  return (
    <div className={cn("surface-default relative overflow-hidden rounded-[26px] p-5", props.accent)}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-white/0 to-white/0" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{props.label}</p>
        <p className="mt-3 text-base font-semibold leading-7 text-slate-950">{props.title}</p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{props.topic}</p>
            <p className={cn("mt-2 text-lg font-semibold", props.tone)}>{props.score}</p>
          </div>
          {props.trailing ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/92 text-slate-600">
              {props.trailing}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ChampionSpotlightCard(props: {
  title: string;
  kicker?: string | undefined;
  name: string;
  people?: Array<{ name: string; imageSrc?: string | undefined; imageAlt?: string | undefined }> | undefined;
  score: string;
  metricLabel?: string | undefined;
  delta?: string | undefined;
  achievement?: string | undefined;
  footnote?: string | undefined;
  theme?: ChampionTheme | undefined;
  imageSrc?: string | undefined;
  imageAlt?: string | undefined;
  showPodium?: boolean | undefined;
  className?: string | undefined;
}) {
  const theme = championThemes[props.theme ?? "orange"];
  const showPodium = props.showPodium ?? true;
  const people =
    props.people && props.people.length > 0
      ? props.people
      : [{ name: props.name, imageSrc: props.imageSrc, imageAlt: props.imageAlt }];
  const visiblePeople = people.slice(0, 4);
  const hasExpandedPortraitLayout = !showPodium && visiblePeople.length <= 2;

  return (
    <section className={cn("surface-hero relative overflow-hidden rounded-[32px] p-6 sm:p-7", props.className)}>
      <div className={cn("absolute -right-8 top-0 h-40 w-40 blur-3xl", theme.glow)} />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.4),rgba(255,255,255,0)_35%,rgba(15,23,42,0.02)_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        <div
          className="champion-stage-beam champion-stage-beam-left absolute -left-16 top-6 h-[360px] w-[400px] opacity-100 blur-[1.5px]"
          style={{
            background: theme.stageBeam,
            clipPath: "polygon(14% 0%, 32% 0%, 100% 100%, 0% 100%)"
          }}
        />
        <div
          className="champion-stage-floor absolute bottom-6 left-1/2 h-32 w-[68%] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: theme.stageFloor }}
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        <div
          className="champion-stage-fixture absolute left-4 top-3 h-14 w-14"
        >
          <div className="absolute left-1/2 top-0 h-3 w-10 -translate-x-1/2 rounded-full bg-slate-950/14" />
          <div className="absolute left-1/2 top-2.5 h-5 w-9 -translate-x-1/2 rounded-[12px] border border-white/75 bg-white/78 shadow-[0_12px_26px_rgba(15,23,42,0.12)]" />
          <div
            className="champion-stage-source absolute left-1/2 top-6.5 h-7 w-7 -translate-x-1/2 rounded-full border border-white/85 shadow-[0_0_22px_rgba(255,255,255,0.96),0_0_60px_rgba(96,165,250,0.66)]"
            style={{ background: theme.stageSource }}
          />
        </div>
      </div>
      <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="relative z-20">
          {props.kicker ? <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{props.kicker}</p> : null}
          <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-3xl">{props.title}</h3>
          {props.metricLabel ? <p className="mt-5 text-sm font-medium text-slate-600">{props.metricLabel}</p> : null}
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <p className="font-display text-5xl font-semibold tracking-[-0.05em] text-slate-950">{props.score}</p>
            {props.delta ? <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", theme.tag)}>{props.delta}</span> : null}
          </div>
          {people.length > 1 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {people.map((person) => (
                <span
                  key={person.name}
                  className={cn(
                    "rounded-full border bg-white/88 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
                    theme.ring
                  )}
                >
                  {person.name}
                </span>
              ))}
            </div>
          ) : (
            <p className={cn("mt-4 font-display text-2xl font-semibold tracking-[-0.04em]", theme.accent)}>{props.name}</p>
          )}
          {props.achievement ? <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">{props.achievement}</p> : null}
          {props.footnote ? <p className="mt-5 text-xs uppercase tracking-[0.22em] text-slate-400">{props.footnote}</p> : null}
        </div>

        <div
          className={cn(
            "relative z-0",
            showPodium
              ? "surface-default h-[260px] overflow-hidden rounded-[28px] border border-white/80 bg-white/75"
              : "h-[300px] overflow-visible"
          )}
        >
          <div
            className={cn(
              "absolute blur-3xl",
              theme.glow,
              showPodium
                ? "inset-x-12 top-4 h-24"
                : "left-1/2 top-1/2 h-40 w-[82%] -translate-x-1/2 -translate-y-1/2 opacity-95"
            )}
          />
          {visiblePeople.length === 1 ? (
            <div
              className={cn(
                "absolute overflow-hidden border border-slate-200 bg-white/85 shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
                showPodium
                  ? "left-1/2 top-8 h-36 w-36 -translate-x-1/2 rounded-full"
                  : "left-[37%] top-[55%] h-[318px] w-[236px] -translate-x-1/2 -translate-y-1/2 rounded-[40px]"
              )}
            >
              {(() => {
                const person = visiblePeople[0];
                return (
                  <ChampionAvatar
                    imageAlt={person?.imageAlt ?? person?.name ?? props.name}
                    imageSrc={person?.imageSrc}
                    initials={getInitials(person?.name ?? props.name)}
                    theme={theme}
                  />
                );
              })()}
            </div>
          ) : hasExpandedPortraitLayout ? (
            <div className="absolute left-[38%] top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-5">
              {visiblePeople.map((person) => (
                <div
                  key={person.name}
                  className="relative h-[210px] w-[150px] overflow-hidden rounded-[34px] border border-slate-200 bg-white/88 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
                >
                  <ChampionAvatar
                    imageAlt={person.imageAlt ?? person.name}
                    imageSrc={person.imageSrc}
                    initials={getInitials(person.name)}
                    theme={theme}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              className={cn(
                "absolute grid grid-cols-2",
                showPodium
                  ? "inset-x-8 top-8 gap-3"
                  : "inset-x-4 top-1/2 -translate-y-1/2 justify-items-center gap-x-3 gap-y-4"
              )}
            >
              {visiblePeople.map((person) => (
                <div
                  key={person.name}
                  className={cn(
                    "relative overflow-hidden border border-slate-200 bg-white/88 shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
                    showPodium ? "h-24 rounded-[24px]" : "h-[148px] w-[108px] rounded-[28px]"
                  )}
                >
                  <ChampionAvatar
                    imageAlt={person.imageAlt ?? person.name}
                    imageSrc={person.imageSrc}
                    initials={getInitials(person.name)}
                    theme={theme}
                  />
                </div>
              ))}
            </div>
          )}
          {showPodium ? (
            <div className="absolute inset-x-8 bottom-8">
              <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <span />
                  <span>Lider</span>
                  <span>Etki</span>
                </div>
                <div className="mt-4 flex items-end justify-center gap-3">
                  <div className="w-12 rounded-t-[18px] bg-slate-100" style={{ height: "56px" }} />
                  <div className={cn("w-16 rounded-t-[20px] bg-gradient-to-b shadow-[0_12px_25px_rgba(15,23,42,0.08)]", theme.bar)} style={{ height: "88px" }} />
                  <div className="w-12 rounded-t-[18px] bg-slate-100" style={{ height: "44px" }} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ChampionAvatar(props: {
  initials: string;
  imageSrc?: string | undefined;
  imageAlt: string;
  theme: {
    halo: string;
  };
}) {
  if (props.imageSrc) {
    return <img alt={props.imageAlt} className="h-full w-full object-cover" src={props.imageSrc} />;
  }

  return (
    <>
      <div className={cn("absolute inset-2 rounded-[inherit] bg-gradient-to-br", props.theme.halo)} />
      <div className="absolute inset-0 flex items-center justify-center font-display text-3xl font-semibold tracking-[0.18em] text-white">
        {props.initials}
      </div>
    </>
  );
}

export function PresentationSlide(props: {
  eyebrow?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("surface-dark h-full rounded-[36px] p-6 sm:p-8 lg:p-10", props.className)}>
      <div className="flex h-full flex-col">
        {props.eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">{props.eyebrow}</p> : null}
        <h2 className="mt-3 max-w-4xl font-display text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-[2.8rem]">
          {props.title}
        </h2>
        {props.subtitle ? <p className="mt-3 max-w-3xl text-base leading-7 text-white/76 lg:text-lg lg:leading-8">{props.subtitle}</p> : null}
        <div className="mt-6 flex-1">{props.children}</div>
      </div>
    </section>
  );
}

export function MetaChip(props: {
  children: ReactNode;
  variant?: SurfaceVariant | undefined;
}) {
  return <span className={metaChip(props.variant ?? "default")}>{props.children}</span>;
}
