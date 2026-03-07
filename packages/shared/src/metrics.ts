import { sha256 } from "js-sha256";

import type {
  AgentMetric,
  DashboardMetricItem,
  KpiMetricKey,
  QuestionPerformance,
  QtMetric,
  ThresholdConfig,
  ThresholdTone
} from "./domain";

export function toAsciiKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function normalizeKey(value: string): string {
  return toAsciiKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createDeterministicId(...parts: string[]): string {
  return sha256(parts.join("|")).slice(0, 20);
}

export function computeTotalConversationCount(
  totalCallCount: number,
  totalChatMailCount: number,
  totalTicketClosedCount: number
): number {
  return totalCallCount + totalChatMailCount + totalTicketClosedCount;
}

export function computeQuestionAccuracy(correctCount: number, wrongCount: number): number {
  const total = correctCount + wrongCount;
  if (total === 0) {
    return 0;
  }

  return Number(((correctCount / total) * 100).toFixed(2));
}

export function computeFeedbackTarget(listeningHours: number): number {
  return Number((listeningHours * 2).toFixed(2));
}

export function computeFeedbackCoverage(
  listeningHours: number,
  feedbackCount: number | null | undefined
): number | null {
  if (feedbackCount === null || feedbackCount === undefined) {
    return null;
  }

  if (listeningHours <= 0) {
    return null;
  }

  return Number((feedbackCount / listeningHours).toFixed(2));
}

export function average(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => value !== null && value !== undefined);
  if (!filtered.length) {
    return null;
  }

  const total = filtered.reduce((sum, value) => sum + value, 0);
  return Number((total / filtered.length).toFixed(2));
}

export function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function getMetricValue(
  record: AgentMetric | QtMetric,
  metric: KpiMetricKey
): number | null {
  if (metric === "feedbackCoverage" && "feedbackCoverage" in record) {
    return record.feedbackCoverage ?? null;
  }

  if (metric in record) {
    return (record as AgentMetric)[metric as keyof AgentMetric] as number | null;
  }

  return null;
}

export function resolveThresholdTone(
  value: number | null | undefined,
  threshold: ThresholdConfig
): ThresholdTone {
  if (value === null || value === undefined) {
    return "neutral";
  }

  if (threshold.direction === "higher_is_better") {
    if (value >= threshold.green) {
      return "green";
    }

    if (value >= threshold.yellow) {
      return "yellow";
    }

    return "red";
  }

  if (value <= threshold.green) {
    return "green";
  }

  if (value <= threshold.yellow) {
    return "yellow";
  }

  return "red";
}

export function sortMetricItems(items: DashboardMetricItem[], direction: "asc" | "desc"): DashboardMetricItem[] {
  return [...items].sort((left, right) => {
    const leftValue = left.value ?? (direction === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
    const rightValue =
      right.value ?? (direction === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);

    return direction === "desc" ? rightValue - leftValue : leftValue - rightValue;
  });
}

export function selectQuestionRankings(questions: QuestionPerformance[]) {
  const sorted = [...questions].sort((left, right) => left.accuracyRate - right.accuracyRate);

  return {
    weakestQuestions: sorted.slice(0, 5),
    strongestQuestions: sorted.slice(-5).reverse()
  };
}
