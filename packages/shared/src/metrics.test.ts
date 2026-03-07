import { describe, expect, it } from "vitest";

import { computeFeedbackCoverage, computeFeedbackTarget, computeQuestionAccuracy, computeTotalConversationCount, resolveThresholdTone } from "./metrics";
import { DEFAULT_THRESHOLDS } from "./domain";

describe("metrics helpers", () => {
  it("toplam gorusme adedini hesaplar", () => {
    expect(computeTotalConversationCount(10, 20, 30)).toBe(60);
  });

  it("soru bilinme oranini hesaplar", () => {
    expect(computeQuestionAccuracy(13, 21)).toBe(38.24);
  });

  it("feedback hedef ve kapsamasini hesaplar", () => {
    expect(computeFeedbackTarget(15)).toBe(30);
    expect(computeFeedbackCoverage(16.15, 57)).toBe(3.53);
  });

  it("threshold tonunu doner", () => {
    expect(resolveThresholdTone(95, DEFAULT_THRESHOLDS.auditScore)).toBe("green");
    expect(resolveThresholdTone(72, DEFAULT_THRESHOLDS.auditScore)).toBe("red");
  });
});
