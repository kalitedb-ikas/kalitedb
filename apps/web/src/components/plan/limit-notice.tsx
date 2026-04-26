import { AlertTriangle } from "lucide-react";

import type { Plan } from "@kalitedb/shared";

import { getResourceLimit, getResourceUsage, usePlan, type PlanResource } from "../../lib/plan";
import { UpgradeBadge } from "./upgrade-badge";

const RESOURCE_LABEL: Record<PlanResource, { singular: string; unit: string }> = {
  seats: { singular: "kullanıcı", unit: "koltuk" },
  scenarios: { singular: "senaryo", unit: "senaryo" },
  minutes: { singular: "dakika", unit: "dk/ay" }
};

const NEXT_PLAN: Record<Plan, Plan | null> = {
  starter: "standard",
  standard: "premium",
  premium: null
};

type LimitNoticeProps = {
  resource: PlanResource;
  className?: string;
};

export function LimitNotice({ resource, className }: LimitNoticeProps) {
  const { plan, limits, usage } = usePlan();
  const limit = getResourceLimit(limits, resource);
  const used = getResourceUsage(usage, resource);

  if (limit === null) return null;

  const ratio = limit === 0 ? 1 : used / limit;
  if (ratio < 0.8) return null;

  const target = NEXT_PLAN[plan];
  const isFull = used >= limit;
  const label = RESOURCE_LABEL[resource];

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        isFull
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-700/40 dark:bg-red-900/30 dark:text-red-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-300"
      } ${className ?? ""}`}
    >
      <AlertTriangle size={16} />
      <span className="flex-1">
        {used}/{limit} {label.unit} kullanıldı
        {isFull ? " — limit doldu." : "."}
      </span>
      {target ? <UpgradeBadge target={target} /> : null}
    </div>
  );
}
