import type { RampTargets } from "@kalitedb/shared";

export const DEFAULT_RAMP_TARGETS: Omit<RampTargets, "updatedAt"> = {
  touchesTarget: 1500,
  talkTimeTargetSeconds: 144000, // 40 saat
  wsaTarget: 200000,
  pipelineCoverage: 3
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeWSA(grow: number, scale: number, scalePlus: number): number {
  return 0.20 * grow + 0.30 * scale + 0.50 * scalePlus;
}

export function computeActivityScore(
  touches: number,
  touchesTarget: number,
  talkSeconds: number,
  talkTargetSeconds: number
): { touchesScore: number; talkTimeScore: number; activityScore: number } {
  const touchesScore = touchesTarget > 0 ? clamp(100 * touches / touchesTarget, 0, 100) : 0;
  const talkTimeScore = talkTargetSeconds > 0 ? clamp(100 * talkSeconds / talkTargetSeconds, 0, 100) : 0;
  const activityScore = 0.60 * touchesScore + 0.40 * talkTimeScore;
  return { touchesScore, talkTimeScore, activityScore };
}

export function computeQualityScore(auditScore: number | null): number {
  return auditScore ?? 0;
}

export function computeResultScore(
  wsa: number,
  wsaTarget: number,
  pipeline: number,
  pipelineCoverage: number
): { resultComponent: number; pipelineHealth: number; desiredPipe: number; resultScore: number } {
  const resultComponent = wsaTarget > 0 ? clamp(100 * wsa / wsaTarget, 0, 100) : 0;
  const desiredPipe = Math.max(pipelineCoverage * wsa, pipelineCoverage * wsaTarget);
  const pipelineHealth = desiredPipe > 0 ? clamp(100 * pipeline / desiredPipe, 0, 100) : 0;
  const resultScore = 0.70 * resultComponent + 0.30 * pipelineHealth;
  return { resultComponent, pipelineHealth, desiredPipe, resultScore };
}

export function computeRampIndex(activityScore: number, qualityScore: number, resultScore: number): number {
  return 0.35 * activityScore + 0.25 * qualityScore + 0.40 * resultScore;
}

export type RagStatus = "green" | "yellow" | "red";

export function getRagStatus(index: number): RagStatus {
  if (index >= 77) return "green";
  if (index >= 60) return "yellow";
  return "red";
}

export type RampScores = {
  wsa: number;
  touchesScore: number;
  talkTimeScore: number;
  activityScore: number;
  qualityScore: number;
  resultComponent: number;
  pipelineHealth: number;
  desiredPipe: number;
  resultScore: number;
  rampIndex: number;
  ragStatus: RagStatus;
};

export function computeAgentRamp(
  touches: number,
  talkSeconds: number,
  auditScore: number | null,
  growAmount: number,
  scaleAmount: number,
  scalePlusAmount: number,
  pipeline: number,
  targets: Omit<RampTargets, "updatedAt">
): RampScores {
  const wsa = computeWSA(growAmount, scaleAmount, scalePlusAmount);
  const { touchesScore, talkTimeScore, activityScore } = computeActivityScore(
    touches, targets.touchesTarget, talkSeconds, targets.talkTimeTargetSeconds
  );
  const qualityScore = computeQualityScore(auditScore);
  const { resultComponent, pipelineHealth, desiredPipe, resultScore } = computeResultScore(
    wsa, targets.wsaTarget, pipeline, targets.pipelineCoverage
  );
  const rampIndex = computeRampIndex(activityScore, qualityScore, resultScore);
  const ragStatus = getRagStatus(rampIndex);

  return {
    wsa, touchesScore, talkTimeScore, activityScore,
    qualityScore, resultComponent, pipelineHealth, desiredPipe,
    resultScore, rampIndex, ragStatus
  };
}
