import { cn } from "@kalitedb/ui";

type CompareMetricRowProps = {
  label: string;
  leftValue: number | null | undefined;
  rightValue: number | null | undefined;
  format: (v: number) => string;
  direction?: "higher_is_better" | "lower_is_better";
};

function resolveWinner(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: "higher_is_better" | "lower_is_better"
): "left" | "right" | "tie" | "none" {
  if (left == null || right == null) return "none";
  if (left === right) return "tie";
  if (direction === "higher_is_better") return left > right ? "left" : "right";
  return left < right ? "left" : "right";
}

function formatDiffPercent(winner: number, loser: number): string {
  if (loser === 0) return "";
  const diff = Math.abs(((winner - loser) / loser) * 100);
  if (diff < 0.1) return "";
  return `${diff >= 10 ? Math.round(diff) : diff.toFixed(1)}%`;
}

export function CompareMetricRow({
  label,
  leftValue,
  rightValue,
  format,
  direction = "higher_is_better"
}: CompareMetricRowProps) {
  const winner = resolveWinner(leftValue, rightValue, direction);

  const leftFormatted = leftValue != null ? format(leftValue) : "N/A";
  const rightFormatted = rightValue != null ? format(rightValue) : "N/A";

  const diffLabel =
    winner === "left" || winner === "right"
      ? formatDiffPercent(
          winner === "left" ? leftValue! : rightValue!,
          winner === "left" ? rightValue! : leftValue!
        )
      : "";

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-slate-100 bg-white/60 px-4 py-3 dark:border-slate-700/40 dark:bg-slate-800/40">
      {/* Sol deger */}
      <div className="text-right">
        <span
          className={cn(
            "text-lg font-semibold tabular-nums tracking-tight",
            winner === "left"
              ? "text-emerald-700 dark:text-emerald-400"
              : winner === "right"
                ? "text-rose-500 dark:text-rose-400"
                : "text-slate-900 dark:text-slate-100"
          )}
        >
          {leftFormatted}
        </span>
        {winner === "left" && diffLabel && (
          <span className="ml-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            +{diffLabel}
          </span>
        )}
      </div>

      {/* Ortadaki etiket */}
      <div className="flex min-w-[100px] flex-col items-center justify-center">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {label}
        </span>
      </div>

      {/* Sag deger */}
      <div className="text-left">
        {winner === "right" && diffLabel && (
          <span className="mr-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            +{diffLabel}
          </span>
        )}
        <span
          className={cn(
            "text-lg font-semibold tabular-nums tracking-tight",
            winner === "right"
              ? "text-emerald-700 dark:text-emerald-400"
              : winner === "left"
                ? "text-rose-500 dark:text-rose-400"
                : "text-slate-900 dark:text-slate-100"
          )}
        >
          {rightFormatted}
        </span>
      </div>
    </div>
  );
}
