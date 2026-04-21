import { Search, X } from "lucide-react";

export function AgentSearch(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative inline-flex items-center">
      <Search
        className="pointer-events-none absolute left-2.5 text-slate-400"
        size={14}
      />
      <input
        aria-label="Temsilci ara"
        className="h-8 w-44 rounded-full border border-slate-200 bg-white/80 pl-8 pr-7 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder ?? "Temsilci ara"}
        type="text"
        value={props.value}
      />
      {props.value ? (
        <button
          aria-label="Aramayı temizle"
          className="absolute right-2 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
          onClick={() => props.onChange("")}
          type="button"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function matchesAgentSearch(name: string | undefined | null, search: string): boolean {
  if (!search) return true;
  if (!name) return false;
  return name.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr").trim());
}
