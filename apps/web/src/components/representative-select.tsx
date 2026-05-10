import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = { key: string; label: string };

export function RepresentativeSelect(props: {
  options: Option[];
  value: string;
  onChange: (key: string) => void;
  placeholder?: string | undefined;
  lockedTo?: string | undefined;
  lockedLabel?: string | undefined;
}) {
  const { options, value, onChange, placeholder = "Temsilci seçin", lockedTo, lockedLabel } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const isLocked = Boolean(lockedTo);
  const selected = options.find((o) => o.key === value);
  const lockedDisplay = lockedLabel ?? options.find((o) => o.key === lockedTo)?.label ?? selected?.label;

  const filtered = search
    ? options.filter((o) => o.label.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")))
    : options;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  const toggle = () => {
    if (isLocked) return;
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen(!open);
    if (open) setSearch("");
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={isLocked}
        title={isLocked ? "Yalnızca kendi verilerinizi görebilirsiniz" : undefined}
        className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/72 px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-white/72 dark:border-slate-600/50 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700/80"
        onClick={toggle}
      >
        <span className="max-w-[180px] truncate">{isLocked ? lockedDisplay ?? placeholder : selected?.label ?? placeholder}</span>
        {!isLocked ? (
          <ChevronDown size={14} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        ) : null}
      </button>

      {open && rect && !isLocked
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[9999] w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800"
              style={{
                top: rect.bottom + 6,
                left: Math.min(rect.left, window.innerWidth - 272)
              }}
            >
              {/* Arama */}
              <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-700">
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-700/60">
                  <Search size={14} className="shrink-0 text-slate-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
                    placeholder="Ara..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Liste */}
              <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
                {filtered.length === 0 ? (
                  <p className="px-4 py-3 text-center text-sm text-slate-400">Sonuç bulunamadı</p>
                ) : (
                  filtered.map((o) => {
                    const isSelected = o.key === value;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        className={[
                          "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition",
                          isSelected
                            ? "bg-primary/8 font-semibold text-primary dark:bg-primary/15 dark:text-orange-400"
                            : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                        ].join(" ")}
                        onClick={() => {
                          onChange(o.key);
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {isSelected ? <Check size={14} className="shrink-0 text-primary dark:text-orange-400" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
