import type { SalesKpiData, SalesKpiTargets } from "@kalitedb/shared";

import { parseTalkDurationLabelToSeconds } from "./format";

export const ADVISOR_LOOKBACK_MONTHS = 3;
export const STRETCH_MULTIPLIER = 1.1;
export const MIN_SAMPLES = 6;

export type KpiMetricKey =
  | "salesAmount"
  | "licenseCount"
  | "conversionRate"
  | "callAttempts"
  | "talkDurationSeconds"
  | "perfScore";

export type KpiMetricKind = "currency" | "count" | "rate" | "seconds" | "score";

export type KpiMetricConfig = {
  key: KpiMetricKey;
  label: string;
  kind: KpiMetricKind;
};

export const KPI_METRIC_CONFIGS: KpiMetricConfig[] = [
  { key: "salesAmount", label: "Satış Tutarı", kind: "currency" },
  { key: "licenseCount", label: "Lisans Adedi", kind: "count" },
  { key: "conversionRate", label: "Dönüşüm Oranı", kind: "rate" },
  { key: "callAttempts", label: "Arama Denemesi", kind: "count" },
  { key: "talkDurationSeconds", label: "Konuşma Süresi", kind: "seconds" },
  { key: "perfScore", label: "Performans Skoru", kind: "score" }
];

export type Verdict = "dusuk" | "uygun" | "yuksek" | "zorlayici" | "belirsiz";
export type Direction = "up" | "down" | "hold";

export type PerRepMonthlySample = {
  agentKey: string;
  periodId: string;
  salesAmount: number;
  licenseCount: number;
  conversionRate: number;
  callAttempts: number;
  talkDurationSeconds: number;
  perfScore: number | null;
};

export type AdvisorPeriodDataset = {
  periodId: string;
  data: SalesKpiData | null;
};

export type KpiAdvice = {
  metric: KpiMetricKey;
  kind: KpiMetricKind;
  label: string;
  currentTarget: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  recommendedLow: number | null;
  recommendedHigh: number | null;
  medianAchievementRate: number | null;
  sampleSize: number;
  verdict: Verdict;
  direction: Direction;
};

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const clampedP = Math.max(0, Math.min(100, p));
  const rank = (clampedP / 100) * (sortedAsc.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lowerValue = sortedAsc[lowerIndex]!;
  const upperValue = sortedAsc[upperIndex]!;
  if (lowerIndex === upperIndex) return lowerValue;
  const fraction = rank - lowerIndex;
  return lowerValue + (upperValue - lowerValue) * fraction;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

export function buildPerRepMonthlySamples(
  datasets: AdvisorPeriodDataset[],
  activeSalesKeys: Set<string>
): PerRepMonthlySample[] {
  const samples: PerRepMonthlySample[] = [];
  for (const { periodId, data } of datasets) {
    if (!data) continue;
    for (const agent of data.agents) {
      if (!activeSalesKeys.has(agent.agentKey)) continue;
      samples.push({
        agentKey: agent.agentKey,
        periodId,
        salesAmount: agent.salesAmount,
        licenseCount: agent.licenseCount,
        conversionRate: agent.conversionRate,
        callAttempts: agent.callAttempts,
        talkDurationSeconds: agent.talkDurationSeconds,
        perfScore: agent.perfScore
      });
    }
  }
  return samples;
}

function extractPerRepTarget(
  metric: KpiMetricKey,
  targets: SalesKpiTargets,
  repCount: number
): number | null {
  switch (metric) {
    case "salesAmount": {
      if (targets.perPersonSalesTarget != null && targets.perPersonSalesTarget > 0) {
        return targets.perPersonSalesTarget;
      }
      if (repCount > 0 && targets.salesAmount > 0) {
        return targets.salesAmount / repCount;
      }
      return null;
    }
    case "licenseCount":
      return targets.licenseCount > 0 ? targets.licenseCount : null;
    case "callAttempts":
      return targets.callAttempts > 0 ? targets.callAttempts : null;
    case "talkDurationSeconds": {
      const seconds =
        targets.talkDurationTargetSeconds ??
        parseTalkDurationLabelToSeconds(targets.talkDurationLabel);
      return seconds > 0 ? seconds : null;
    }
    case "conversionRate":
      return targets.conversionRate > 0 ? targets.conversionRate : null;
    case "perfScore":
      return targets.perfScore > 0 ? targets.perfScore : null;
    default:
      return null;
  }
}

function extractSampleValues(samples: PerRepMonthlySample[], metric: KpiMetricKey): number[] {
  if (metric === "perfScore") {
    return samples
      .map((s) => s.perfScore)
      .filter((v): v is number => v !== null && Number.isFinite(v));
  }
  return samples.map((s) => s[metric]).filter((v) => Number.isFinite(v));
}

function computeDirection(current: number | null, low: number | null, high: number | null): Direction {
  if (current == null || low == null || high == null) return "hold";
  if (current < low) return "up";
  if (current > high) return "down";
  return "hold";
}

function computeVerdict(params: {
  current: number | null;
  p50: number | null;
  p75: number | null;
  values: number[];
  sampleSize: number;
  repCount: number;
}): Verdict {
  const { current, p50, p75, values, sampleSize, repCount } = params;
  if (sampleSize < MIN_SAMPLES || repCount < 2) return "belirsiz";
  if (current == null || current <= 0) return "belirsiz";
  if (p50 == null || p75 == null) return "belirsiz";

  const hitCount = values.reduce((acc, v) => (v >= current ? acc + 1 : acc), 0);
  if (hitCount === 0) return "zorlayici";

  if (current < p50 * 0.95) return "dusuk";
  if (current > p75 * 1.15) return "yuksek";
  return "uygun";
}

export type FunnelRatios = {
  licensePerSales: number | null;
  callsPerSales: number | null;
  talkPerSales: number | null;
  sampleSize: number;
};

export function computeFunnelRatios(samples: PerRepMonthlySample[]): FunnelRatios {
  const withSales = samples.filter((s) => s.salesAmount > 0);
  if (withSales.length === 0) {
    return { licensePerSales: null, callsPerSales: null, talkPerSales: null, sampleSize: 0 };
  }
  const licenseRatios = withSales.map((s) => s.licenseCount / s.salesAmount);
  const callsRatios = withSales.map((s) => s.callAttempts / s.salesAmount);
  const talkRatios = withSales.map((s) => s.talkDurationSeconds / s.salesAmount);
  return {
    licensePerSales: median(licenseRatios),
    callsPerSales: median(callsRatios),
    talkPerSales: median(talkRatios),
    sampleSize: withSales.length
  };
}

export function deriveCoupledTargets(
  perRepSales: number,
  ratios: FunnelRatios
): { perRepLicense: number | null; perRepCalls: number | null; perRepTalkSeconds: number | null } {
  return {
    perRepLicense: ratios.licensePerSales != null ? perRepSales * ratios.licensePerSales : null,
    perRepCalls: ratios.callsPerSales != null ? perRepSales * ratios.callsPerSales : null,
    perRepTalkSeconds: ratios.talkPerSales != null ? perRepSales * ratios.talkPerSales : null
  };
}

export function computeKpiAdvice(
  samples: PerRepMonthlySample[],
  targets: SalesKpiTargets | null,
  repCount: number
): KpiAdvice[] {
  return KPI_METRIC_CONFIGS.map(({ key, label, kind }) => {
    const values = extractSampleValues(samples, key);
    const sorted = [...values].sort((a, b) => a - b);
    const sampleSize = sorted.length;
    const currentTarget = targets ? extractPerRepTarget(key, targets, repCount) : null;

    const p50 = sampleSize > 0 ? percentile(sorted, 50) : null;
    const p75 = sampleSize > 0 ? percentile(sorted, 75) : null;
    const p95 = sampleSize > 0 ? percentile(sorted, 95) : null;

    const recommendedLow = p50;
    const recommendedHigh =
      p75 != null && p95 != null ? Math.min(p75 * STRETCH_MULTIPLIER, p95) : null;

    const medianAchievementRate =
      currentTarget != null && currentTarget > 0 && sampleSize > 0
        ? median(values.map((v) => v / currentTarget))
        : null;

    const verdict = computeVerdict({
      current: currentTarget,
      p50,
      p75,
      values,
      sampleSize,
      repCount
    });

    const direction =
      verdict === "belirsiz" || verdict === "zorlayici"
        ? "hold"
        : computeDirection(currentTarget, recommendedLow, recommendedHigh);

    return {
      metric: key,
      kind,
      label,
      currentTarget,
      p50,
      p75,
      p95,
      recommendedLow,
      recommendedHigh,
      medianAchievementRate,
      sampleSize,
      verdict,
      direction
    };
  });
}
