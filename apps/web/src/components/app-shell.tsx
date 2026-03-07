import { BarChart3, ClipboardCheck, LayoutDashboard, LogOut, Presentation, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../lib/auth";

const navigation = [
  { label: "Genel Bakış", to: "/", icon: LayoutDashboard },
  { label: "Audit", to: "/audit", icon: ClipboardCheck },
  { label: "Sorular", to: "/questions", icon: ShieldCheck },
  { label: "CSAT", to: "/csat", icon: BarChart3 },
  { label: "QT", to: "/qt", icon: Sparkles },
  { label: "Yönetim", to: "/admin", icon: Settings2 },
  { label: "Sunum", to: "/presentation", icon: Presentation }
];

export function AppShell() {
  const auth = useAuth();

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] bg-brand-ink p-6 text-white shadow-panel">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-brand-sand">KaliteDB</p>
            <h1 className="mt-3 text-3xl font-semibold">Aylık kalite merkezi</h1>
            <p className="mt-2 text-sm text-slate-300">
              CEO sunumu, taslak operasyonu ve kalite ekip yönetimi tek merkezde.
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                      isActive ? "bg-white text-brand-ink" : "text-slate-200 hover:bg-white/10"
                    ].join(" ")
                  }
                  to={item.to}
                >
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold">{auth.user?.displayName ?? "Giriş yapan kullanıcı"}</p>
            <p className="mt-1 text-xs text-slate-300">{auth.user?.email ?? auth.authMode.toUpperCase()}</p>
            <button
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-ink"
              onClick={() => void auth.logout()}
              type="button"
            >
              <LogOut size={16} />
              Çıkış yap
            </button>
          </div>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
