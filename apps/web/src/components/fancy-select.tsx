import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type FancySelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type FancySelectProps = {
  options: FancySelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  panelWidthClass?: string;
  buttonLabel?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Eğer true ise seçilen değer null'a çevrilebilir (options içine bir "Temizle" seçeneği ekler) */
  clearable?: boolean;
  clearLabel?: string;
  ariaLabel?: string;
};

/**
 * Projenin her yerinde kullanılacak custom dropdown.
 * - createPortal ile body'e monte edilir (clipping yok)
 * - Native <select> yerine buton + panel
 * - Opsiyonel arama, devre dışı durum, boyut varyantları
 */
export function FancySelect(props: FancySelectProps) {
  const {
    options,
    value,
    onChange,
    placeholder = "Seçin",
    searchable = false,
    disabled = false,
    className = "",
    panelWidthClass = "w-56",
    buttonLabel,
    size = "md",
    clearable = false,
    clearLabel = "Temizle",
    ariaLabel
  } = props;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    if (!searchable || !search) return options;
    const q = search.toLocaleLowerCase("tr-TR");
    return options.filter((o) => o.label.toLocaleLowerCase("tr-TR").includes(q));
  }, [options, search, searchable]);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen(!open);
    if (open) setSearch("");
  };

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

  const sizeClasses =
    size === "sm"
      ? "h-8 px-3 text-[13px]"
      : size === "lg"
        ? "h-12 px-4 text-base"
        : "h-10 px-3.5 text-sm";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={[
          "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white font-medium text-slate-700 shadow-sm transition",
          "hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60",
          sizeClasses,
          className
        ].join(" ")}
        onClick={toggle}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {buttonLabel ?? selected?.label ?? <span className="text-slate-400">{placeholder}</span>}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              className={[
                "fixed z-[9999] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800",
                panelWidthClass
              ].join(" ")}
              style={{
                top: rect.bottom + 6,
                left: Math.min(rect.left, window.innerWidth - 16 - (panelRef.current?.offsetWidth ?? 240))
              }}
              role="listbox"
            >
              {searchable ? (
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
              ) : null}

              <div className="max-h-72 overflow-y-auto overscroll-contain py-1">
                {clearable ? (
                  <button
                    type="button"
                    className={[
                      "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition",
                      value === ""
                        ? "bg-primary/8 font-semibold text-primary dark:bg-primary/15 dark:text-orange-400"
                        : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50"
                    ].join(" ")}
                    onClick={() => handleSelect("")}
                  >
                    <span className="min-w-0 flex-1 truncate">{clearLabel}</span>
                    {value === "" ? <Check size={14} className="shrink-0 text-primary dark:text-orange-400" /> : null}
                  </button>
                ) : null}

                {filtered.length === 0 ? (
                  <p className="px-4 py-3 text-center text-sm text-slate-400">Sonuç bulunamadı</p>
                ) : (
                  filtered.map((o) => {
                    const isSelected = o.value === value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        disabled={o.disabled}
                        className={[
                          "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition",
                          o.disabled
                            ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                            : isSelected
                              ? "bg-primary/8 font-semibold text-primary dark:bg-primary/15 dark:text-orange-400"
                              : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                        ].join(" ")}
                        onClick={() => !o.disabled && handleSelect(o.value)}
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
