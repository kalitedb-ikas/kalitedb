import { Sparkles } from "lucide-react";

import type { Plan } from "@kalitedb/shared";

const PLAN_LABEL: Record<Plan, string> = {
  starter: "Starter",
  standard: "Standard",
  premium: "Premium"
};

type UpgradeBadgeProps = {
  target: Plan;
  className?: string;
};

export function UpgradeBadge({ target, className }: UpgradeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-400 ${className ?? ""}`}
      title={`${PLAN_LABEL[target]} plan ve üstü gerekli`}
    >
      <Sparkles size={12} />
      {PLAN_LABEL[target]} gerekli
    </span>
  );
}
