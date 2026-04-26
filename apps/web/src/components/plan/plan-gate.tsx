import type { ReactNode } from "react";

import type { PlanFeatureKey } from "@kalitedb/shared";

import { usePlan } from "../../lib/plan";

type PlanGateProps = {
  feature: PlanFeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
};

export function PlanGate({ feature, children, fallback = null }: PlanGateProps) {
  const { hasFeature } = usePlan();
  return <>{hasFeature(feature) ? children : fallback}</>;
}
