import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileQuestion,
  Gauge,
  Handshake,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { toPublicAssetPath } from "../lib/asset-path";
import { api, type AuthenticatedUser } from "../lib/api";
import { SkyToggle } from "./sky-toggle";

type Department = "cs" | "sales" | "quality";

type NavigationItem = {
  label: string;
  to: string;
  icon: typeof Gauge;
  roles?: AuthenticatedUser["role"][];
};

const nonViewerRoles: AuthenticatedUser["role"][] = ["admin", "manager", "team_leader", "quality", "representative", "team", "ceo", "qt"];

const csNavigation: NavigationItem[] = [
  { label: "Genel Bakış", to: "/cs", icon: Gauge },
  { label: "Audit", to: "/cs/audit", icon: ClipboardList },
  { label: "Sorular", to: "/cs/questions", icon: Sparkles },
  { label: "CSAT", to: "/cs/csat", icon: MessageCircle },
  { label: "Temsilciler", to: "/cs/representatives", icon: Users },
  { label: "Yönetim", to: "/admin", icon: Settings, roles: nonViewerRoles }
];

const salesNavigation: NavigationItem[] = [
  { label: "Genel Bakış", to: "/sales", icon: Gauge },
  { label: "KPI", to: "/sales/kpi", icon: Target },
  { label: "Başarı Endeksi", to: "/sales/success-index", icon: Sparkles },
  { label: "RAMP", to: "/sales/ramp", icon: TrendingUp },
  { label: "Performans", to: "/sales/audit", icon: ClipboardList },
  { label: "Sorular", to: "/sales/evaluation-questions", icon: FileQuestion },
  { label: "Toplantılar", to: "/sales/meetings", icon: Handshake },
  { label: "Temsilciler", to: "/sales/representatives", icon: Users },
  { label: "Takvim", to: "/sales/calendar", icon: CalendarDays },
  { label: "Yönetim", to: "/sales/admin", icon: Settings, roles: nonViewerRoles }
];

const qualityNavigation: NavigationItem[] = [
  { label: "QT", to: "/quality/qt", icon: BarChart3 },
  { label: "Yönetim", to: "/quality/admin", icon: Settings, roles: nonViewerRoles }
];

function roleLabel(role: AuthenticatedUser["role"] | undefined) {
  if (role === "admin") return "Admin";
  if (role === "team") return "Operasyon";
  if (role === "ceo") return "Yönetici";
  if (role === "qt") return "QT";
  if (role === "viewer") return "Görüntüleyici";
  return "KaliteDB";
}

function getActiveDepartment(pathname: string): Department {
  if (pathname.startsWith("/quality")) return "quality";
  if (pathname.startsWith("/sales")) return "sales";
  return "cs";
}

function getCurrentNavigationItem(pathname: string, items: NavigationItem[]) {
  const rootPaths = ["/cs", "/sales", "/quality"];
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
  const [searchParams] = useSearchParams();
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
  // Quality sekmesi şimdilik CS dönemlerini kullanır (CS QT verisi orada)
  const effectivePeriodDepartment: Department =
    activeDepartment === "quality" ? "cs" : activeDepartment;

  const departmentPeriods = useMemo(
    () => (periodsQuery.data ?? []).filter((p) => (p.department ?? "cs") === effectivePeriodDepartment),
    [periodsQuery.data, effectivePeriodDepartment]
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
    const items =
      activeDepartment === "sales"
        ? salesNavigation
        : activeDepartment === "quality"
          ? qualityNavigation
          : csNavigation;
    const currentUser = props.currentUser;
    if (!currentUser) return items.filter((item) => !item.roles);
    return items.filter((item) => !item.roles || item.roles.includes(currentUser.role));
  }, [activeDepartment, props.currentUser]);

  const canSeeQualityTab = Boolean(props.currentUser);

  const currentNavigationItem = getCurrentNavigationItem(location.pathname, activeNavigation);

  const preservedNavigationSearch = useMemo(() => {
    const next = new URLSearchParams();
    const periodId = searchParams.get("periodId");
    const compareToPeriodId = searchParams.get("compareToPeriodId");
    if (periodId) next.set("periodId", periodId);
    if (compareToPeriodId) next.set("compareToPeriodId", compareToPeriodId);
    const queryString = next.toString();
    return queryString ? `?${queryString}` : "";
  }, [searchParams]);

  const handleDepartmentSwitch = (dept: Department) => {
    const target =
      dept === "sales"
        ? "/sales"
        : dept === "quality"
          ? "/quality/qt"
          : "/cs";
    const prev = getActiveDepartment(location.pathname);
    // CS ↔ Kalite geçişlerinde period id korunur (Kalite sekmesi CS dönemlerini kullanır).
    // Sales ile yapılan geçişlerde period id sıfırlanır (farklı department dönemleri).
    const shouldResetPeriod =
      (prev === "sales" && dept !== "sales") ||
      (prev !== "sales" && dept === "sales");
    if (shouldResetPeriod) {
      navigate({ pathname: target });
    } else {
      navigate({ pathname: target, search: preservedNavigationSearch });
    }
  };

  return (
    <div className="app-backdrop min-h-screen">
      <header className="sticky top-3 z-40 px-3 pt-3 sm:top-4 sm:px-5 lg:px-8">
        <div
          className={[
            "mx-auto max-w-[1680px] rounded-[10px] border px-3 py-3 transition-all duration-200 sm:px-4",
            isScrolled
              ? "surface-subtle border-slate-200/85 dark:border-slate-600/40 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
              : "surface-subtle border-slate-200/70 dark:border-slate-600/30"
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            {/* Logo + Departman sekmeleri (sabit sol grup) */}
            <div className="flex items-center gap-3">
              <Link
                className="flex min-w-0 items-center gap-3.5 rounded-full px-1 py-1"
                to={{
                  pathname:
                    activeDepartment === "sales"
                      ? "/sales"
                      : activeDepartment === "quality"
                        ? "/quality/qt"
                        : "/cs",
                  search: preservedNavigationSearch
                }}
              >
                <div className="flex size-12 items-center justify-center overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.1)] dark:border-slate-600 dark:bg-slate-800 sm:size-14">
                  <img alt="ikas" className="h-full w-full object-cover" src={toPublicAssetPath("/ikas.jpg")} />
                </div>
                <div className="hidden min-w-0 sm:block">
                  <p className="truncate font-display text-base font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100 sm:text-lg">
                    Kalite Dashboard
                  </p>
                  {/* Departman sekmeleri — başlığın altında */}
                  <div className="mt-1 hidden items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-600 dark:bg-slate-800/80 xl:inline-flex">
                    <button
                      className={[
                        "flex min-h-6 items-center rounded-full px-3 text-[11px] font-semibold transition",
                        activeDepartment === "cs"
                          ? "bg-slate-950 text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] dark:bg-slate-100 dark:text-slate-900"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      ].join(" ")}
                      onClick={(e) => { e.preventDefault(); handleDepartmentSwitch("cs"); }}
                      type="button"
                    >
                      CS
                    </button>
                    <button
                      className={[
                        "flex min-h-6 items-center rounded-full px-3 text-[11px] font-semibold transition",
                        activeDepartment === "sales"
                          ? "bg-slate-950 text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] dark:bg-slate-100 dark:text-slate-900"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      ].join(" ")}
                      onClick={(e) => { e.preventDefault(); handleDepartmentSwitch("sales"); }}
                      type="button"
                    >
                      Satış
                    </button>
                    {canSeeQualityTab ? (
                      <button
                        className={[
                          "flex min-h-6 items-center rounded-full px-3 text-[11px] font-semibold transition",
                          activeDepartment === "quality"
                            ? "bg-slate-950 text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] dark:bg-slate-100 dark:text-slate-900"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                        ].join(" ")}
                        onClick={(e) => { e.preventDefault(); handleDepartmentSwitch("quality"); }}
                        type="button"
                      >
                        Kalite
                      </button>
                    ) : null}
                  </div>
                </div>
              </Link>
            </div>

            {/* Mobil: aktif sayfa başlığı */}
            <div className="min-w-0 flex-1 xl:hidden">
              <p className="truncate font-display text-sm font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
                {currentNavigationItem?.label ?? "KaliteDB"}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {props.currentUser ? roleLabel(props.currentUser.role) : "Misafir görünümü"}
              </p>
            </div>

            {/* Masaüstü: navigasyon linkleri (ortada) */}
            <nav className="hidden flex-1 items-center justify-center gap-1 xl:flex">
              {activeNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) =>
                      [
                        "flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium transition",
                        isActive
                          ? "border-slate-900 bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900"
                          : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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

              {/* Dönem filtresi sayfa başlıklarına taşındı (PeriodPills) */}
            </nav>

            {/* Kullanıcı kontrolleri */}
            <div className="ml-auto flex items-center gap-1.5">
              <SkyToggle />
              {props.currentUser ? (
                <>
                  <div className="hidden items-center xl:flex">
                    <div className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {userInitial}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 xl:hidden">
                    <div className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {userInitial}
                    </div>
                    <button
                      aria-expanded={isDrawerOpen}
                      aria-label="Sayfaları aç"
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
                      onClick={() => setIsDrawerOpen(true)}
                      type="button"
                    >
                      <Menu size={16} />
                      <span>Sayfalar</span>
                    </button>
                  </div>

                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
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
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 xl:hidden"
                    onClick={() => setIsDrawerOpen(true)}
                    type="button"
                  >
                    <Menu size={16} />
                    <span>Sayfalar</span>
                  </button>
                  <Link
                    className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
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
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            aria-label="Menüyü kapat"
            className="absolute inset-0 bg-slate-950/28 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[320px] flex-col border-l border-slate-200 bg-white px-4 py-4 shadow-[0_26px_80px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
              <p className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">Sayfalar</p>
              <button
                aria-label="Menüyü kapat"
                className="inline-flex size-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:text-slate-950 dark:border-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
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
                  "flex-1 rounded-[10px] border py-2.5 text-sm font-semibold transition",
                  activeDepartment === "cs"
                    ? "border-slate-900 bg-slate-950 text-white dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500"
                ].join(" ")}
                onClick={() => { handleDepartmentSwitch("cs"); setIsDrawerOpen(false); }}
                type="button"
              >
                CS
              </button>
              <button
                className={[
                  "flex-1 rounded-[10px] border py-2.5 text-sm font-semibold transition",
                  activeDepartment === "sales"
                    ? "border-slate-900 bg-slate-950 text-white dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500"
                ].join(" ")}
                onClick={() => { handleDepartmentSwitch("sales"); setIsDrawerOpen(false); }}
                type="button"
              >
                Satış
              </button>
              {canSeeQualityTab ? (
                <button
                  className={[
                    "flex-1 rounded-[10px] border py-2.5 text-sm font-semibold transition",
                    activeDepartment === "quality"
                      ? "border-slate-900 bg-slate-950 text-white dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500"
                  ].join(" ")}
                  onClick={() => { handleDepartmentSwitch("quality"); setIsDrawerOpen(false); }}
                  type="button"
                >
                  Kalite
                </button>
              ) : null}
            </div>

            <nav className="mt-3 flex flex-1 flex-col gap-2">
              {activeNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) =>
                      [
                        "flex min-h-11 items-center gap-3 rounded-[10px] border px-4 text-sm font-medium transition",
                        isActive
                          ? "border-slate-900 bg-slate-950 text-white dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-200"
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

            <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Oturum</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-200">
                {props.currentUser ? roleLabel(props.currentUser.role) : "Misafir görünümü"}
              </p>
              {!props.currentUser ? (
                <Link
                  className="mt-3 inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-slate-100"
                  to="/login"
                >
                  Giriş yap
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {auth.authMode === "dev" && !auth.user ? (
        <div className="mx-auto mt-4 max-w-[1680px] px-3 sm:px-5 lg:px-8">
          <div className="flex items-center gap-3 rounded-[10px] border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>
              Firestore erişimi için{" "}
              <Link className="font-semibold underline underline-offset-2" to="/login">
                Google ile bağlanın
              </Link>
              . Dev token rol sağlar, ancak veritabanı okuma/yazma için Google oturumu gereklidir.
            </p>
          </div>
        </div>
      ) : null}

      <main className="flex-1 px-3 pb-12 pt-6 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-[1680px]">{props.children ?? <Outlet />}</div>
      </main>
    </div>
  );
}
