import { ChevronRight, Search } from "lucide-react";
import { useMemo, type ReactNode } from "react";

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

export function AdminShell(props: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-slate-200/90 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur p-0 shadow-[0_24px_60px_rgba(15,23,42,0.08)] overflow-hidden">
      <div className="grid gap-0 xl:grid-cols-[280px_minmax(0,1fr)]">
        {props.sidebar}
        <main className="min-w-0 bg-slate-50/40 dark:bg-slate-950/40">
          <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10 sm:py-10 space-y-8">
            {props.children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AdminShellSidebar(props: {
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
    <aside className="border-b xl:border-b-0 xl:border-r border-slate-200/90 dark:border-slate-700/50 bg-white dark:bg-slate-900 flex flex-col">
      {props.header ? (
        <div className="border-b border-slate-200/80 dark:border-slate-700/50 px-5 py-5">{props.header}</div>
      ) : null}

      {search ? (
        <div className="border-b border-slate-200/80 dark:border-slate-700/50 px-5 py-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={15} />
            <input
              className="h-10 w-full rounded-[10px] border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition focus:border-primary/40 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder ?? "Ara"}
              type="search"
              value={search.value}
            />
          </label>
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {filteredGroups.length === 0 ? (
          <p className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500">Sonuç bulunamadı.</p>
        ) : null}
        {filteredGroups.map((group) => (
          <div key={group.id} className="space-y-1">
            {group.label ? (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                {group.label}
              </p>
            ) : null}
            {group.items
              .filter((item) => !item.hidden)
              .map((item) => (
                <button
                  key={item.id}
                  className={[
                    "group relative flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-sm transition",
                    item.active
                      ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold shadow-[0_4px_14px_rgba(15,23,42,0.18)]"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100"
                  ].join(" ")}
                  onClick={item.onClick}
                  type="button"
                >
                  {item.icon ? (
                    <span
                      className={[
                        "flex size-6 shrink-0 items-center justify-center rounded-[6px]",
                        item.active
                          ? "text-white dark:text-slate-900"
                          : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200"
                      ].join(" ")}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
                  {item.active ? null : (
                    <ChevronRight
                      className="shrink-0 text-slate-300 dark:text-slate-600 opacity-0 transition group-hover:opacity-100"
                      size={14}
                    />
                  )}
                </button>
              ))}
          </div>
        ))}
      </nav>

      {props.footer ? (
        <div className="border-t border-slate-200/80 dark:border-slate-700/50 px-5 py-4">{props.footer}</div>
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
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200/70 dark:border-slate-700/50 pb-6">
      <div className="min-w-0 flex-1 space-y-2">
        {props.breadcrumb ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
            {props.breadcrumb}
          </div>
        ) : null}
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100 leading-tight">
          {props.title}
        </h1>
        {props.description ? (
          <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{props.description}</p>
        ) : null}
        {props.pills ? <div className="flex flex-wrap items-center gap-2 pt-1">{props.pills}</div> : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </header>
  );
}

export function AdminShellSection(props: { children: ReactNode; className?: string }) {
  return <section className={["space-y-5", props.className ?? ""].join(" ")}>{props.children}</section>;
}
