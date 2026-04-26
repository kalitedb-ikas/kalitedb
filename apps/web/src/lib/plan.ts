import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  PLANS,
  ZERO_PLAN_USAGE,
  type Plan,
  type PlanFeatureKey,
  type PlanLimits,
  type PlanUsage
} from "@kalitedb/shared";

import { api, type AuthenticatedUser } from "./api";
import { useAuth } from "./auth";

export type PlanResource = "seats" | "scenarios" | "minutes";

export type UsePlanResult = {
  plan: Plan;
  limits: PlanLimits;
  usage: PlanUsage;
  hasFeature: (key: PlanFeatureKey) => boolean;
  isAtSeatLimit: boolean;
  isAtScenarioLimit: boolean;
  isAtMinuteQuota: boolean;
  remaining: {
    seats: number | null;
    scenarios: number | null;
    minutes: number | null;
  };
};

function pickResourceUsage(usage: PlanUsage, resource: PlanResource): number {
  switch (resource) {
    case "seats":
      return usage.seatCount;
    case "scenarios":
      return usage.scenarioCount;
    case "minutes":
      return usage.minutesUsedThisMonth;
  }
}

function pickResourceLimit(limits: PlanLimits, resource: PlanResource): number | null {
  switch (resource) {
    case "seats":
      return limits.seats;
    case "scenarios":
      return limits.scenarios;
    case "minutes":
      return limits.monthlyMinutes;
  }
}

export function getResourceUsage(usage: PlanUsage, resource: PlanResource): number {
  return pickResourceUsage(usage, resource);
}

export function getResourceLimit(limits: PlanLimits, resource: PlanResource): number | null {
  return pickResourceLimit(limits, resource);
}

export function usePlan(): UsePlanResult {
  const auth = useAuth();
  const meQuery = useQuery({
    enabled: Boolean(auth.token),
    queryKey: ["me", auth.token],
    queryFn: () => api.getMe(auth.token),
    retry: false,
    staleTime: 5 * 60 * 1000
  });

  return useMemo(() => {
    const me: AuthenticatedUser | undefined = meQuery.data;
    const plan: Plan = me?.plan ?? "starter";
    const limits: PlanLimits = me?.limits ?? PLANS[plan];
    const usage: PlanUsage = me?.usage ?? ZERO_PLAN_USAGE;

    const hasFeature = (key: PlanFeatureKey) => limits.features[key];

    const isAtSeatLimit = limits.seats !== null && usage.seatCount >= limits.seats;
    const isAtScenarioLimit = limits.scenarios !== null && usage.scenarioCount >= limits.scenarios;
    const isAtMinuteQuota = limits.monthlyMinutes !== null && usage.minutesUsedThisMonth >= limits.monthlyMinutes;

    const remaining = {
      seats: limits.seats === null ? null : Math.max(0, limits.seats - usage.seatCount),
      scenarios: limits.scenarios === null ? null : Math.max(0, limits.scenarios - usage.scenarioCount),
      minutes: limits.monthlyMinutes === null ? null : Math.max(0, limits.monthlyMinutes - usage.minutesUsedThisMonth)
    };

    return {
      plan,
      limits,
      usage,
      hasFeature,
      isAtSeatLimit,
      isAtScenarioLimit,
      isAtMinuteQuota,
      remaining
    };
  }, [meQuery.data]);
}
