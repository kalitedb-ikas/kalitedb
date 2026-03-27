import type { ThresholdConfig, ThresholdTone } from "@kalitedb/shared";
import { resolveThresholdTone } from "@kalitedb/shared";

export function toneToStatusLabel(tone: ThresholdTone): string {
  if (tone === "green") return "Hedef bandında";
  if (tone === "yellow") return "İzlenmeli";
  if (tone === "red") return "Geliştirme gerekli";
  return "Veri yok";
}

export function statusLabelForValue(value: number | null | undefined, threshold: ThresholdConfig): string {
  return toneToStatusLabel(resolveThresholdTone(value, threshold));
}
