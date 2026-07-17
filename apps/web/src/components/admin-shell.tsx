/**
 * Admin v2 kabuğu — koyu "ink" kenar çubuğu + departman vurgu renkli içerik başlığı.
 *
 * Vurgu rengi `accent` prop'u ile seçilir; ilgili CSS değişkenleri
 * styles/index.css içindeki `adm-accent-*` sınıflarında tanımlıdır.
 */
import { Search, ShieldCheck } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { cx } from "./admin-ui";

export type AdminNavItem = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: ReactNode;
  hidden?: boolean;
};

export type AdminNavGroup = {
  id: string;
  label?: string;
  items: AdminNavItem[];
};

export type AdminAccent = "cs" | "sales" | "quality";

const accentClassMap: Record<AdminAccent, string> = {
  cs: "adm-accent-cs",
  sales: "adm-accent-sales",
  quality: "adm-accent-quality"
};

export function AdminShell(props: { sidebar: ReactNode; children: ReactNode; accent?: AdminAccent }) {
  return (
    <div className={accentClassMap[props.accent ?? "cs"]}>
      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)] xl:gap-7">
        {props.sidebar}
        <main className="min-w-0 space-y-6 rounded-[22px] border border-slate-200/70 bg-slate-100/60 p-4 dark:border-slate-800/60 dark:bg-slate-950/50 sm:p-6">
          {props.children}
        </main>
      </div>
    </div>
  );
}

export function AdminShellSidebar(props: {
  title?: string;
  subtitle?: string;
  header?: ReactNode;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  groups: AdminNavGroup[];
  footer?: ReactNode;
}) {
  const { search } = props;
  const query = search?.value.trim().toLocaleLowerCase("tr-TR") ?? "";

  const filteredGroups = useMemo(() => {
    if (!query) return props.groups;
    return props.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.hidden) return false;
          const label = item.label.toLocaleLowerCase("tr-TR");
          const desc = (item.description ?? "").toLocaleLowerCase("tr-TR");
          return label.includes(query) || desc.includes(query);
        })
      }))
      .filter((group) => group.items.length > 0);
  }, [props.groups, query]);

  return (
    <aside className="relative flex flex-col overflow-hidden rounded-[20px] border border-slate-800/80 bg-slate-950 text-slate-300 shadow-[0_30px_70px_-30px_rgba(2,6,23,0.65)] dark:border-slate-700/50 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7.5rem)]">
      {/* Vurgu rengi parlaması */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(130%_100%_at_50%_0%,var(--adm-accent-glow),transparent_72%)]"
      />

      {/* Marka + dönem alanı */}
      <div className="relative border-b border-white/[0.07] px-5 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--adm-accent)] text-white shadow-[0_10px_26px_-8px_var(--adm-accent)]">
            <ShieldCheck size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold tracking-[-0.02em] text-white">
              {props.title ?? "Yönetim Paneli"}
            </p>
            {props.subtitle ? <p className="truncate text-xs text-slate-400">{props.subtitle}</p> : null}
          </div>
        </div>
        {props.header ? <div className="mt-5">{props.header}</div> : null}
      </div>

      {/* Bölüm arama */}
      {search ? (
        <div className="relative border-b border-white/[0.07] px-4 py-3.5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input
              className="h-9 w-full rounded-[10px] border border-white/10 bg-white/[0.05] pl-[2.125rem] pr-3 text-[13px] text-slate-100 placeholder:text-slate-500 transition focus:border-[var(--adm-accent-bright)] focus:bg-white/[0.08] focus:outline-none"
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder ?? "Ara"}
              type="search"
              value={search.value}
            />
          </label>
        </div>
      ) : null}

      {/* Navigasyon */}
      <nav className="relative flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {filteredGroups.length === 0 ? (
          <p className="px-3 py-4 text-xs text-slate-500">Sonuç bulunamadı.</p>
        ) : null}
        {filteredGroups.map((group) => (
          <div key={group.id} className="space-y-0.5">
            {group.label ? (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                {group.label}
              </p>
            ) : null}
            {group.items
              .filter((item) => !item.hidden)
              .map((item) => (
                <button
                  key={item.id}
                  className={cx(
                    "group relative flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] transition",
                    item.active
                      ? "bg-white/[0.09] font-semibold text-white"
                      : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                  )}
                  onClick={item.onClick}
                  type="button"
                >
                  {item.active ? (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--adm-accent-bright)]" />
                  ) : null}
                  {item.icon ? (
                    <span
                      className={cx(
                        "flex size-6 shrink-0 items-center justify-center rounded-[7px] transition",
                        item.active
                          ? "bg-[var(--adm-accent-dim)] text-[var(--adm-accent-bright)]"
                          : "text-slate-500 group-hover:text-slate-300"
                      )}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
                </button>
              ))}
          </div>
        ))}
      </nav>

      {props.footer ? (
        <div className="relative border-t border-white/[0.07] px-5 py-4">{props.footer}</div>
      ) : null}
    </aside>
  );
}

export function AdminShellHeader(props: {
  breadcrumb?: ReactNode;
  title: string;
  description?: string;
  pills?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-[20px] border border-slate-200 bg-white px-6 py-6 shadow-[0_2px_4px_rgba(15,23,42,0.05),0_24px_48px_-28px_rgba(15,23,42,0.28)] dark:border-slate-700 dark:bg-slate-900 sm:px-7">
      {/* Üst vurgu şeridi */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[var(--adm-accent)]" />
      {/* Vurgu rengi yıkaması */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,var(--adm-accent-wash),transparent_65%)] opacity-90"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1 space-y-2">
          {props.breadcrumb ? (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--adm-accent-text)]">
              {props.breadcrumb}
            </div>
          ) : null}
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.03em] text-slate-950 dark:text-slate-100 sm:text-[30px]">
            {props.title}
          </h1>
          {props.description ? (
            <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{props.description}</p>
          ) : null}
          {props.pills ? <div className="flex flex-wrap items-center gap-2 pt-1.5">{props.pills}</div> : null}
        </div>
        {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
      </div>
    </header>
  );
}

export function AdminShellSection(props: { children: ReactNode; className?: string }) {
  return <section className={cx("space-y-5", props.className)}>{props.children}</section>;
}
