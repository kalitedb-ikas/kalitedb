import type { ReactNode } from "react";

import { cn } from "./utils";

type Tone = "green" | "yellow" | "red" | "neutral";
type ChampionTheme = "orange" | "violet" | "emerald" | "ink";
type SurfaceVariant = "default" | "elevated" | "subtle" | "dark" | "hero";

const toneMap: Record<Tone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400",
  yellow: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-400",
  red: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400",
  neutral: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-400"
};

const toneBadgeMap: Record<Tone, string> = {
  green: "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400",
  yellow: "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-400",
  red: "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400",
  neutral: "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-400"
};

const surfaceVariantMap: Record<SurfaceVariant, string> = {
  default: "surface-default text-slate-950 dark:text-slate-100",
  elevated: "surface-elevated text-slate-950 dark:text-slate-100",
  subtle: "surface-subtle text-slate-950 dark:text-slate-100",
  dark: "surface-dark text-white",
  hero: "surface-hero text-slate-950 dark:text-slate-100"
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
  }
> = {
  orange: {
    accent: "text-orange-700",
    glow: "bg-[radial-gradient(circle,_rgba(251,191,36,0.28)_0%,_rgba(251,191,36,0)_72%)]",
    halo: "from-amber-200/90 via-orange-300/70 to-orange-500/45",
    bar: "from-amber-200/90 via-orange-300/70 to-orange-500/60",
    tag: "border-amber-200/60 bg-amber-50/90 text-amber-700",
    ring: "border-amber-200/75"
  },
  violet: {
    accent: "text-violet-700",
    glow: "bg-[radial-gradient(circle,_rgba(167,139,250,0.26)_0%,_rgba(167,139,250,0)_72%)]",
    halo: "from-violet-200/90 via-fuchsia-300/65 to-indigo-500/40",
    bar: "from-violet-200/85 via-fuchsia-300/65 to-indigo-500/50",
    tag: "border-violet-200/60 bg-violet-50/90 text-violet-700",
    ring: "border-violet-200/75"
  },
  emerald: {
    accent: "text-emerald-700",
    glow: "bg-[radial-gradient(circle,_rgba(110,231,183,0.26)_0%,_rgba(110,231,183,0)_72%)]",
    halo: "from-emerald-200/90 via-teal-300/65 to-cyan-500/40",
    bar: "from-emerald-200/85 via-teal-300/65 to-cyan-500/50",
    tag: "border-emerald-200/60 bg-emerald-50/90 text-emerald-700",
    ring: "border-emerald-200/75"
  },
  ink: {
    accent: "text-slate-700 dark:text-slate-200",
    glow: "bg-[radial-gradient(circle,_rgba(31,40,57,0.22)_0%,_rgba(31,40,57,0)_72%)]",
    halo: "from-slate-300/90 via-slate-400/65 to-slate-600/40",
    bar: "from-slate-300/85 via-slate-400/65 to-slate-600/50",
    tag: "border-slate-300/60 bg-slate-50/90 text-slate-700",
    ring: "border-slate-300/75"
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
  return variant === "dark" ? "border-white/12" : "border-slate-200/80 dark:border-slate-600/40";
}

function bodyTextClass(variant: SurfaceVariant) {
  return variant === "dark" ? "text-white/74" : "text-slate-600 dark:text-slate-400";
}

function metaChip(variant: SurfaceVariant) {
  return cn(
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
    variant === "dark" ? "border-white/14 bg-white/8 text-white/74" : "border-slate-200 bg-white/84 text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-400"
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
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-100 sm:text-4xl">
          {props.title}
        </h1>
        {props.subtitle ? <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400 sm:text-base">{props.subtitle}</p> : null}
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
  titleClassName?: string | undefined;
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
            {props.title ? <h2 className={cn("font-display text-lg font-semibold tracking-[-0.03em]", props.titleClassName ?? (variant === "dark" ? "text-white" : "text-slate-950 dark:text-slate-100"))}>{props.title}</h2> : null}
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
        compact ? "rounded-[10px] p-4" : "rounded-[10px] p-5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {props.icon ? (
          <div
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-[10px] border p-2.5",
              toneBadgeMap[tone]
            )}
          >
            {props.icon}
          </div>
        ) : (
          <span className="inline-flex h-2.5 w-14 rounded-full bg-slate-200 dark:bg-slate-600" />
        )}
        {topLabel ? (
          <span className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", toneBadgeMap[topTone])}>
            {topLabel}
          </span>
        ) : null}
      </div>
      <p className={cn("mt-4 text-sm font-medium text-slate-600 dark:text-slate-400", compact ? "line-clamp-1" : "")}>{props.label}</p>
      <p className={cn("mt-2 font-display font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-100", compact ? "text-2xl" : "text-3xl")}>
        {props.value}
      </p>
      {props.hint ? <p className={cn("mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400", compact ? "line-clamp-2" : "")}>{props.hint}</p> : null}
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
    <div className={cn("rounded-[10px] border border-white/14 bg-white/8 p-4 text-white", props.className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.24em] text-white/74">{props.label}</p>
        {props.icon ? <div className="rounded-[10px] border border-white/14 bg-white/8 p-2 text-white">{props.icon}</div> : null}
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

const podiumRankStyles: Record<number, { badge: string; row: string; value: string }> = {
  0: {
    badge: "border-amber-500 bg-amber-400 text-amber-950 dark:border-amber-400/70 dark:bg-amber-500/70 dark:text-amber-50",
    row: "border-slate-200 bg-white dark:border-slate-600/40 dark:bg-slate-800/60",
    value: "text-amber-800 dark:text-amber-200"
  },
  1: {
    badge: "border-slate-400 bg-slate-200 text-slate-700 dark:border-slate-400/60 dark:bg-slate-500/40 dark:text-slate-100",
    row: "border-slate-200 bg-white dark:border-slate-600/40 dark:bg-slate-800/60",
    value: "text-slate-700 dark:text-slate-300"
  },
  2: {
    badge: "border-[#8B4513] bg-[#B87333] text-white dark:border-[#6B3410]/80 dark:bg-[#8B4513] dark:text-orange-50",
    row: "border-slate-200 bg-white dark:border-slate-600/40 dark:bg-slate-800/60",
    value: "text-[#8B4513] dark:text-[#D2905A]"
  }
};

const defaultRankStyle = {
  badge: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-400",
  row: "border-slate-200 bg-white dark:border-slate-600/40 dark:bg-slate-800/60",
  value: "text-slate-900 dark:text-slate-200"
};

export function Leaderboard(props: {
  title: string;
  items: Array<{ id: string; label: string; value: string; delta?: string; subtitle?: string; imageSrc?: string | undefined }>;
  className?: string | undefined;
  variant?: "podium" | "flat" | undefined;
}) {
  const variant = props.variant ?? "flat";
  return (
    <SurfaceCard className={props.className} title={props.title} variant="default">
      <ul className="space-y-2.5">
        {props.items.map((item, index) => {
          const style = variant === "flat" ? defaultRankStyle : (podiumRankStyles[index] ?? defaultRankStyle);
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3 transition-all duration-200 hover:scale-[1.01]",
                style.row
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border text-xs font-bold",
                    style.badge
                  )}
                >
                  {index + 1}
                </span>
                {item.imageSrc ? (
                  <img src={item.imageSrc} alt={item.label} className="h-9 w-9 rounded-full object-cover" />
                ) : null}
                <div>
                  <p className={cn("text-sm font-semibold", variant === "podium" && index < 3 ? "text-slate-950 dark:text-slate-100" : "text-slate-900 dark:text-slate-200")}>{item.label}</p>
                  {item.subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</p> : null}
                  {item.delta ? <p className="text-xs text-slate-500 dark:text-slate-400">{item.delta}</p> : null}
                </div>
              </div>
              <span className={cn("text-sm font-bold tabular-nums", style.value)}>{item.value}</span>
            </li>
          );
        })}
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
    <div className={cn("surface-subtle rounded-[10px] border border-slate-200/80 dark:border-slate-600/40 p-4 sm:p-5", props.className)}>
      {props.title || props.supportingText || props.inlineSummary ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {props.title ? <h2 className="font-display text-base font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">{props.title}</h2> : null}
            {props.supportingText ? <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{props.supportingText}</p> : null}
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
        "surface-elevated relative min-w-[280px] snap-start overflow-hidden rounded-[10px] p-5 text-slate-950 dark:text-slate-100 transition duration-300 hover:-translate-y-1",
        props.className
      )}
    >
      <div className={cn("absolute inset-x-10 top-0 h-20 blur-3xl", theme.glow)} />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{props.eyebrow}</span>
          {props.imageSrc ? (
            <div className={cn("h-14 w-11 overflow-hidden rounded-[10px] border bg-white/92 shadow-[0_10px_24px_rgba(15,23,42,0.06)]", theme.ring)}>
              <img alt={props.imageAlt ?? props.eyebrow} className="h-full w-full object-cover" src={props.imageSrc} />
            </div>
          ) : props.icon ? (
            <div className={cn("rounded-[10px] border bg-white/92 p-2.5 text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.06)]", theme.ring)}>
              {props.icon}
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">{props.title}</p>
        {props.badge ? (
          <span className={cn("mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold", toneBadgeMap[props.badgeTone ?? "neutral"])}>
            {props.badge}
          </span>
        ) : null}
        <p className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-100">{props.value}</p>
        {props.detail ? <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{props.detail}</p> : null}
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
  imageSrc?: string | undefined;
}) {
  return (
    <div className="surface-subtle rounded-[10px] border border-slate-200/80 dark:border-slate-600/40 p-4">
      <div className="flex items-start gap-3">
        {props.imageSrc ? (
          <img src={props.imageSrc} alt={props.value} className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="inline-flex items-center justify-center rounded-[10px] border border-slate-200 dark:border-slate-600 bg-white/92 dark:bg-slate-800/60 p-2 text-slate-700 dark:text-slate-300">
            {props.icon}
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{props.title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-100">{props.value}</p>
        </div>
      </div>
      {props.description ? <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{props.description}</p> : null}
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
    <div className={cn("surface-default relative overflow-hidden rounded-[10px] p-5", props.accent)}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-white/0 to-white/0 dark:from-white/5" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{props.label}</p>
        <p className="mt-3 text-base font-semibold leading-7 text-slate-950 dark:text-slate-100">{props.title}</p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{props.topic}</p>
            <p className={cn("mt-2 text-lg font-semibold", props.tone)}>{props.score}</p>
          </div>
          {props.trailing ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-slate-200/80 bg-white/92 text-slate-600 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
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
  const visiblePeople = people.slice(0, 8);
  const hasExpandedPortraitLayout = !showPodium && visiblePeople.length <= 2;
  const gridColsClass =
    visiblePeople.length >= 7
      ? "grid-cols-4"
      : visiblePeople.length >= 5
        ? "grid-cols-3"
        : "grid-cols-2";
  const gridTileSizeClass = showPodium
    ? "h-24 rounded-[10px]"
    : visiblePeople.length >= 7
      ? "h-[100px] w-[72px] rounded-[10px]"
      : visiblePeople.length >= 5
        ? "h-[124px] w-[90px] rounded-[10px]"
        : "h-[148px] w-[108px] rounded-[10px]";

  return (
    <section className={cn("surface-hero relative overflow-hidden rounded-[10px] p-6 sm:p-7", props.className)}>
      <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="relative z-20">
          {props.kicker ? <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300">{props.kicker}</p> : null}
          <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-100 sm:text-3xl">{props.title}</h3>
          {props.metricLabel ? <p className="mt-5 text-sm font-medium text-slate-600 dark:text-slate-400">{props.metricLabel}</p> : null}
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <p className="font-display text-5xl font-semibold tracking-[-0.05em] text-slate-950 dark:text-slate-100">{props.score}</p>
            {props.delta ? <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", theme.tag)}>{props.delta}</span> : null}
          </div>
          {people.length > 1 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {people.map((person) => (
                <span
                  key={person.name}
                  className={cn(
                    "rounded-full border bg-white/88 dark:bg-slate-800/70 px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100",
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
          {props.achievement ? <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-400">{props.achievement}</p> : null}
          {props.footnote ? <p className="mt-5 text-xs uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">{props.footnote}</p> : null}
        </div>

        <div
          className={cn(
            "relative z-0",
            showPodium
              ? "surface-default h-[260px] overflow-hidden rounded-[10px] border border-white/80 bg-white/75"
              : "h-[300px] overflow-visible"
          )}
        >
          {visiblePeople.length === 1 ? (
            <div
              className={cn(
                "absolute overflow-hidden border border-slate-200 bg-white/85",
                showPodium
                  ? "left-1/2 top-8 h-36 w-36 -translate-x-1/2 rounded-full"
                  : "left-[37%] top-[55%] h-[318px] w-[236px] -translate-x-1/2 -translate-y-1/2 rounded-[10px]"
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
                  className="relative h-[210px] w-[150px] overflow-hidden rounded-[10px] border border-slate-200 bg-white/88"
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
                "absolute grid",
                gridColsClass,
                showPodium
                  ? "inset-x-8 top-8 gap-3"
                  : "inset-x-4 top-1/2 -translate-y-1/2 justify-items-center gap-x-3 gap-y-4"
              )}
            >
              {visiblePeople.map((person) => (
                <div
                  key={person.name}
                  className={cn(
                    "relative overflow-hidden border border-slate-200 bg-white/88",
                    gridTileSizeClass
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
              <div className="rounded-[10px] border border-slate-200 bg-white/92 p-4">
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <span />
                  <span>Lider</span>
                  <span>Etki</span>
                </div>
                <div className="mt-4 flex items-end justify-center gap-3">
                  <div className="w-12 rounded-t-[10px] bg-slate-100" style={{ height: "56px" }} />
                  <div className={cn("w-16 rounded-t-[10px] bg-gradient-to-b shadow-[0_12px_25px_rgba(15,23,42,0.08)]", theme.bar)} style={{ height: "88px" }} />
                  <div className="w-12 rounded-t-[10px] bg-slate-100" style={{ height: "44px" }} />
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
    <section className={cn("surface-dark h-full rounded-[10px] p-6 sm:p-8 lg:p-10", props.className)}>
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
