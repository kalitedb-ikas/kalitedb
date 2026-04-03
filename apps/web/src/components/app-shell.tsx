import {
  BarChart3,
  ClipboardList,
  Gauge,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { toPublicAssetPath } from "../lib/asset-path";
import { api, type AuthenticatedUser } from "../lib/api";
import { formatPeriodMonth } from "../lib/format";

type Department = "cs" | "sales";

type NavigationItem = {
  label: string;
  to: string;
  icon: typeof Gauge;
  roles?: AuthenticatedUser["role"][];
};

const csNavigation: NavigationItem[] = [
  { label: "Genel Bakış", to: "/cs", icon: Gauge },
  { label: "Audit", to: "/cs/audit", icon: ClipboardList },
  { label: "Sorular", to: "/cs/questions", icon: Sparkles },
  { label: "CSAT", to: "/cs/csat", icon: MessageCircle },
  { label: "Temsilciler", to: "/cs/representatives", icon: Users },
  { label: "QT", to: "/cs/qt", icon: BarChart3 },
  { label: "Yönetim", to: "/admin", icon: Settings, roles: ["admin", "qt"] }
];

const salesNavigation: NavigationItem[] = [
  { label: "Genel Bakış", to: "/sales", icon: Gauge },
  { label: "Audit", to: "/sales/audit", icon: ClipboardList },
  { label: "Yönetim", to: "/sales/admin", icon: Settings, roles: ["admin", "manager", "team_leader"] }
];

function roleLabel(role: AuthenticatedUser["role"] | undefined) {
  if (role === "admin") return "Admin";
  if (role === "team") return "Operasyon";
  if (role === "ceo") return "Yönetici";
  if (role === "qt") return "QT";
  return "KaliteDB";
}

function getActiveDepartment(pathname: string): Department {
  return pathname.startsWith("/sales") ? "sales" : "cs";
}

function getCurrentNavigationItem(pathname: string, items: NavigationItem[]) {
  const rootPaths = ["/cs", "/sales"];
  if (rootPaths.includes(pathname)) {
    return items.find((item) => item.to === pathname);
  }
  return items.find((item) => !rootPaths.includes(item.to) && pathname.startsWith(item.to)) ?? items[0];
}

export function AppShell(props: { currentUser?: AuthenticatedUser | undefined; children?: ReactNode | undefined }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const userInitial = (props.currentUser?.displayName ?? auth.user?.displayName ?? "K")[0]?.toUpperCase() ?? "K";

  const activeDepartment = getActiveDepartment(location.pathname);

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  // Aktif departmana göre dönemleri filtrele
  const departmentPeriods = useMemo(
    () => (periodsQuery.data ?? []).filter((p) => (p.department ?? "cs") === activeDepartment),
    [periodsQuery.data, activeDepartment]
  );

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isDrawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!departmentPeriods.length) return;
    for (const period of departmentPeriods.slice(0, 6)) {
      void queryClient.prefetchQuery({
        queryKey: ["dashboard", auth.token, period.id, undefined],
        queryFn: () => api.getDashboard(auth.token, period.id),
        staleTime: 5 * 60 * 1000
      });
    }
  }, [auth.token, departmentPeriods, queryClient]);

  const activeNavigation = useMemo(() => {
    const items = activeDepartment === "sales" ? salesNavigation : csNavigation;
    const currentUser = props.currentUser;
    if (!currentUser) return items.filter((item) => !item.roles);
    return items.filter((item) => !item.roles || item.roles.includes(currentUser.role));
  }, [activeDepartment, props.currentUser]);

  const currentNavigationItem = getCurrentNavigationItem(location.pathname, activeNavigation);
  const activePeriodId = searchParams.get("periodId") ?? selectDefaultReportPeriod(departmentPeriods)?.id ?? "";
  const showPeriodFilter = departmentPeriods.length > 0;

  const preservedNavigationSearch = useMemo(() => {
    const next = new URLSearchParams();
    const periodId = searchParams.get("periodId");
    const compareToPeriodId = searchParams.get("compareToPeriodId");
    if (periodId) next.set("periodId", periodId);
    if (compareToPeriodId) next.set("compareToPeriodId", compareToPeriodId);
    const queryString = next.toString();
    return queryString ? `?${queryString}` : "";
  }, [searchParams]);

  const handlePeriodChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("periodId", value);
    } else {
      next.delete("periodId");
    }
    startTransition(() => setSearchParams(next));
  };

  const handleDepartmentSwitch = (dept: Department) => {
    const target = dept === "sales" ? "/sales" : "/cs";
    // Dönem filtresini sıfırla — farklı departmanın dönemleri farklı
    navigate({ pathname: target });
  };

  return (
    <div className="app-backdrop min-h-screen">
      <header className="sticky top-3 z-40 px-3 pt-3 sm:top-4 sm:px-5 lg:px-8">
        <div
          className={[
            "mx-auto max-w-[1680px] rounded-[26px] border px-3 py-3 transition-all duration-200 sm:px-4",
            isScrolled
              ? "surface-subtle border-slate-200/85 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
              : "surface-subtle border-slate-200/70"
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            {/* Logo */}
            <Link
              className="flex min-w-0 items-center gap-3.5 rounded-full px-1 py-1"
              to={{ pathname: activeDepartment === "sales" ? "/sales" : "/cs", search: preservedNavigationSearch }}
            >
              <div className="flex size-12 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.1)] sm:size-14">
                <img alt="ikas" className="h-full w-full object-cover" src={toPublicAssetPath("/ikas.jpg")} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold tracking-[-0.03em] text-slate-950 sm:text-lg">
                  Kalite Dashboard
                </p>
              </div>
            </Link>

            {/* Mobil: aktif sayfa başlığı */}
            <div className="min-w-0 flex-1 lg:hidden">
              <p className="truncate font-display text-sm font-semibold tracking-[-0.03em] text-slate-900">
                {currentNavigationItem?.label ?? "KaliteDB"}
              </p>
              <p className="truncate text-xs text-slate-500">
                {props.currentUser ? roleLabel(props.currentUser.role) : "Misafir görünümü"}
              </p>
            </div>

            {/* Masaüstü: departman sekmeleri + alt navigasyon */}
            <nav className="hidden flex-1 items-center justify-center gap-1.5 lg:flex">
              {/* Departman sekmeleri */}
              <div className="mr-1 flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100/80 p-1">
                <button
                  className={[
                    "flex min-h-8 items-center rounded-full px-4 text-[13px] font-semibold transition",
                    activeDepartment === "cs"
                      ? "bg-slate-950 text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)]"
                      : "text-slate-500 hover:text-slate-800"
                  ].join(" ")}
                  onClick={() => handleDepartmentSwitch("cs")}
                  type="button"
                >
                  CS
                </button>
                <button
                  className={[
                    "flex min-h-8 items-center rounded-full px-4 text-[13px] font-semibold transition",
                    activeDepartment === "sales"
                      ? "bg-slate-950 text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)]"
                      : "text-slate-500 hover:text-slate-800"
                  ].join(" ")}
                  onClick={() => handleDepartmentSwitch("sales")}
                  type="button"
                >
                  Satış
                </button>
              </div>

              {/* Alt navigasyon öğeleri */}
              {activeNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) =>
                      [
                        "flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition",
                        isActive
                          ? "border-slate-900 bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
                          : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
                      ].join(" ")
                    }
                    end={item.to === "/cs" || item.to === "/sales"}
                    to={{ pathname: item.to, search: preservedNavigationSearch }}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}

              {/* Dönem filtresi */}
              {showPeriodFilter ? (
                <select
                  aria-label="Ay filtresi"
                  className="ml-2 h-10 min-w-[180px] rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition focus:border-primary/40 focus:outline-none"
                  onChange={(event) => handlePeriodChange(event.target.value)}
                  value={activePeriodId}
                >
                  {departmentPeriods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {formatPeriodMonth(period.month)}
                    </option>
                  ))}
                </select>
              ) : null}
            </nav>

            {/* Kullanıcı kontrolleri */}
            <div className="ml-auto flex items-center gap-2">
              {props.currentUser ? (
                <>
                  <div className="hidden items-center lg:flex">
                    <div className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                      {userInitial}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 lg:hidden">
                    <div className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-900">
                      {userInitial}
                    </div>
                    <button
                      aria-expanded={isDrawerOpen}
                      aria-label="Sayfaları aç"
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                      onClick={() => setIsDrawerOpen(true)}
                      type="button"
                    >
                      <Menu size={16} />
                      <span>Sayfalar</span>
                    </button>
                  </div>

                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    onClick={() => void auth.logout()}
                    type="button"
                  >
                    <LogOut size={14} strokeWidth={1.8} />
                    <span className="hidden sm:inline">Çıkış</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    aria-expanded={isDrawerOpen}
                    aria-label="Sayfaları aç"
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 lg:hidden"
                    onClick={() => setIsDrawerOpen(true)}
                    type="button"
                  >
                    <Menu size={16} />
                    <span>Sayfalar</span>
                  </button>
                  <Link
                    className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    to="/login"
                  >
                    Giriş
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobil çekmece menü */}
      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Menüyü kapat"
            className="absolute inset-0 bg-slate-950/28 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[320px] flex-col border-l border-slate-200 bg-white px-4 py-4 shadow-[0_26px_80px_rgba(15,23,42,0.16)]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <p className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950">Sayfalar</p>
              <button
                aria-label="Menüyü kapat"
                className="inline-flex size-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:text-slate-950"
                onClick={() => setIsDrawerOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {/* Departman sekmeleri (mobil) */}
            <div className="mt-4 flex gap-2">
              <button
                className={[
                  "flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition",
                  activeDepartment === "cs"
                    ? "border-slate-900 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                ].join(" ")}
                onClick={() => { handleDepartmentSwitch("cs"); setIsDrawerOpen(false); }}
                type="button"
              >
                CS
              </button>
              <button
                className={[
                  "flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition",
                  activeDepartment === "sales"
                    ? "border-slate-900 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                ].join(" ")}
                onClick={() => { handleDepartmentSwitch("sales"); setIsDrawerOpen(false); }}
                type="button"
              >
                Satış
              </button>
            </div>

            <nav className="mt-3 flex flex-1 flex-col gap-2">
              {activeNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) =>
                      [
                        "flex min-h-11 items-center gap-3 rounded-2xl border px-4 text-sm font-medium transition",
                        isActive
                          ? "border-slate-900 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
                      ].join(" ")
                    }
                    end={item.to === "/cs" || item.to === "/sales"}
                    to={{ pathname: item.to, search: preservedNavigationSearch }}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {showPeriodFilter ? (
              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Ay filtresi</p>
                <select
                  aria-label="Ay filtresi"
                  className="mt-3 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-primary/40 focus:outline-none"
                  onChange={(event) => handlePeriodChange(event.target.value)}
                  value={activePeriodId}
                >
                  {departmentPeriods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {formatPeriodMonth(period.month)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="border-t border-slate-200 pt-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Oturum</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {props.currentUser ? roleLabel(props.currentUser.role) : "Misafir görünümü"}
              </p>
              {!props.currentUser ? (
                <Link
                  className="mt-3 inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                  to="/login"
                >
                  Giriş yap
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <main className="flex-1 px-3 pb-12 pt-6 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-[1680px]">{props.children ?? <Outlet />}</div>
      </main>
    </div>
  );
}
