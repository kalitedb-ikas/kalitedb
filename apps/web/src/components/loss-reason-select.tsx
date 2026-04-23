import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const DEFAULT_LOSS_REASONS = [
  "Fiyat",
  "Rakip tercih etti",
  "Zamanlama uygun değil",
  "Diğer"
] as const;

type Props = {
  value: string | undefined;
  onChange: (value: string) => void;
  existingReasons?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const normalize = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

export function LossReasonSelect(props: Props) {
  const { value = "", onChange, existingReasons = [], placeholder = "Sebep seçin", disabled, className = "" } = props;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const options = useMemo(() => {
    const seen = new Map<string, string>();
    for (const label of [...DEFAULT_LOSS_REASONS, ...existingReasons]) {
      const trimmed = label.trim();
      if (!trimmed) continue;
      const key = normalize(trimmed);
      if (!seen.has(key)) seen.set(key, trimmed);
    }
    return Array.from(seen.values());
  }, [existingReasons]);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = normalize(query);
    return options.filter((o) => normalize(o).includes(q));
  }, [options, query]);

  const trimmedQuery = query.trim();
  const showAddRow =
    trimmedQuery.length > 0 && !options.some((o) => normalize(o) === normalize(trimmedQuery));

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setRect(btnRef.current?.getBoundingClientRect() ?? null);
      setQuery("");
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const panelPosition = useMemo(() => {
    if (!rect) return null;
    const PANEL_MIN_WIDTH = 220;
    const PANEL_EST_HEIGHT = 300;
    const MARGIN = 12;
    const width = Math.max(rect.width, PANEL_MIN_WIDTH);
    const maxLeft = window.innerWidth - width - MARGIN;
    const left = Math.max(MARGIN, Math.min(rect.left, maxLeft));
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < PANEL_EST_HEIGHT + MARGIN && rect.top > PANEL_EST_HEIGHT + MARGIN
        ? rect.top - PANEL_EST_HEIGHT - 4
        : rect.bottom + 4;
    return { top, left, width };
  }, [rect]);

  const commit = (reason: string) => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length === 1) {
        commit(filtered[0]!);
      } else if (showAddRow) {
        commit(trimmedQuery);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-1">
        <button
          ref={btnRef}
          className="inline-flex h-10 flex-1 items-center justify-between gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:border-slate-300 focus:border-primary/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200 dark:hover:border-slate-500"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <span className={`truncate ${value ? "" : "text-slate-400 dark:text-slate-500"}`}>
            {value || placeholder}
          </span>
          <ChevronDown className="shrink-0 text-slate-400" size={15} />
        </button>
        {value ? (
          <button
            aria-label="Sebebi temizle"
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-600 dark:border-slate-600 dark:bg-slate-700/50 dark:hover:text-slate-200"
            onClick={() => onChange("")}
            type="button"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {open && panelPosition
        ? createPortal(
            <div
              ref={panelRef}
              data-loss-reason-panel
              className="fixed z-[60] max-h-72 min-w-[220px] overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.14)] dark:border-slate-600 dark:bg-slate-800"
              style={{ top: panelPosition.top, left: panelPosition.left, width: panelPosition.width }}
            >
              <div className="border-b border-slate-200 p-2 dark:border-slate-600">
                <input
                  ref={searchRef}
                  className="h-9 w-full rounded-[8px] border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-200"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ara veya yeni sebep yaz..."
                  type="text"
                  value={query}
                />
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {filtered.length === 0 && !showAddRow ? (
                  <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Sonuç yok</p>
                ) : null}
                {filtered.map((reason) => (
                  <button
                    key={reason}
                    className={[
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/60",
                      normalize(reason) === normalize(value) ? "bg-slate-50 dark:bg-slate-700/40" : ""
                    ].join(" ")}
                    onClick={() => commit(reason)}
                    type="button"
                  >
                    <span className="truncate text-slate-700 dark:text-slate-200">{reason}</span>
                    {normalize(reason) === normalize(value) ? (
                      <Check className="shrink-0 text-emerald-600" size={14} />
                    ) : null}
                  </button>
                ))}
                {showAddRow ? (
                  <button
                    className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-primary transition hover:bg-sky-50/50 dark:border-slate-700 dark:text-sky-400 dark:hover:bg-slate-700/60"
                    onClick={() => commit(trimmedQuery)}
                    type="button"
                  >
                    <Plus size={14} />
                    <span className="truncate">"{trimmedQuery}" ekle</span>
                  </button>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
