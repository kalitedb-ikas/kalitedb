import { Download } from "lucide-react";

export function CsvDownloadButton(props: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      <Download size={14} />
      {props.label ?? "CSV indir"}
    </button>
  );
}
