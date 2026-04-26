import { z } from "zod";

export const planSchema = z.enum(["starter", "standard", "premium"]);
export type Plan = z.infer<typeof planSchema>;

export type PlanFeatures = {
  rubricScoring: boolean;
  slackHubspot: boolean;
  sso: boolean;
  customDomain: boolean;
  twoWayCrm: boolean;
  highestVoiceQuality: boolean;
  dpa: boolean;
  successManager: boolean;
  prioritySupport: boolean;
};

export type PlanLimits = {
  // null = sınırsız
  seats: number | null;
  monthlyMinutes: number | null;
  scenarios: number | null;
  voiceAgents: number | null;
  features: PlanFeatures;
};

export const PLANS: Record<Plan, PlanLimits> = {
  starter: {
    seats: 5,
    monthlyMinutes: 500,
    scenarios: 10,
    voiceAgents: 2,
    features: {
      rubricScoring: false,
      slackHubspot: false,
      sso: false,
      customDomain: false,
      twoWayCrm: false,
      highestVoiceQuality: false,
      dpa: false,
      successManager: false,
      prioritySupport: false
    }
  },
  standard: {
    seats: 30,
    monthlyMinutes: 4000,
    scenarios: null,
    voiceAgents: 10,
    features: {
      rubricScoring: true,
      slackHubspot: true,
      sso: false,
      customDomain: false,
      twoWayCrm: false,
      highestVoiceQuality: false,
      dpa: false,
      successManager: false,
      prioritySupport: true
    }
  },
  premium: {
    seats: null,
    monthlyMinutes: 12000,
    scenarios: null,
    voiceAgents: null,
    features: {
      rubricScoring: true,
      slackHubspot: true,
      sso: true,
      customDomain: true,
      twoWayCrm: true,
      highestVoiceQuality: true,
      dpa: true,
      successManager: true,
      prioritySupport: true
    }
  }
};

export type PlanFeatureKey = keyof PlanFeatures;

export function planHasFeature(plan: Plan, feature: PlanFeatureKey): boolean {
  return PLANS[plan].features[feature];
}

export type PlanUsage = {
  seatCount: number;
  scenarioCount: number;
  minutesUsedThisMonth: number;
  voiceAgentCount: number;
};

export const ZERO_PLAN_USAGE: PlanUsage = {
  seatCount: 0,
  scenarioCount: 0,
  minutesUsedThisMonth: 0,
  voiceAgentCount: 0
};
