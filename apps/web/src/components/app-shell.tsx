import {
  BarChart3,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Presentation,
  Settings2,
  ShieldCheck,
  Sparkles
} from "lucide-react";
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
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 h-screen w-64 shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
              <ShieldCheck size={20} />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base font-bold text-slate-900 leading-tight">KaliteDB</h1>
              <p className="text-xs font-medium text-slate-500">Kalite Merkezi</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-slate-600 hover:bg-slate-50"
                  ].join(" ")
                }
                to={item.to}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
              {(auth.user?.displayName ?? "K")[0]?.toUpperCase() ?? "K"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {auth.user?.displayName ?? "Kullanıcı"}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {auth.authMode === "dev" ? "Dev Mode" : auth.user?.email ?? ""}
              </p>
            </div>
            <button
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              onClick={() => void auth.logout()}
              title="Çıkış yap"
              type="button"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
