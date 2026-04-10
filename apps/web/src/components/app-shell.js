import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BarChart3, ClipboardCheck, LayoutDashboard, LogOut, Presentation, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
const navigation = [
    { label: "Dashboard", to: "/", icon: LayoutDashboard },
    { label: "Audit", to: "/audit", icon: ClipboardCheck },
    { label: "Sorular", to: "/questions", icon: ShieldCheck },
    { label: "CSAT", to: "/csat", icon: BarChart3 },
    { label: "QT", to: "/qt", icon: Sparkles },
    { label: "Admin", to: "/admin", icon: Settings2 },
    { label: "Sunum", to: "/presentation", icon: Presentation }
];
export function AppShell() {
    const auth = useAuth();
    return (_jsx("div", { className: "min-h-screen p-4 md:p-6", children: _jsxs("div", { className: "grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]", children: [_jsxs("aside", { className: "rounded-[2rem] bg-brand-ink p-6 text-white shadow-panel", children: [_jsxs("div", { className: "rounded-3xl border border-white/10 bg-white/5 p-5", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.24em] text-brand-sand", children: "KaliteDB" }), _jsx("h1", { className: "mt-3 text-3xl font-semibold", children: "Aylik kalite merkezi" }), _jsx("p", { className: "mt-2 text-sm text-slate-300", children: "CEO sunumu, draft operasyonu ve kalite ekip yonetimi tek merkezde." })] }), _jsx("nav", { className: "mt-8 space-y-2", children: navigation.map((item) => {
                                const Icon = item.icon;
                                return (_jsxs(NavLink, { className: ({ isActive }) => [
                                        "flex items-center gap-3 rounded-[10px] px-4 py-3 text-sm font-medium transition",
                                        isActive ? "bg-white text-brand-ink" : "text-slate-200 hover:bg-white/10"
                                    ].join(" "), to: item.to, children: [_jsx(Icon, { size: 18 }), item.label] }, item.to));
                            }) }), _jsxs("div", { className: "mt-8 rounded-3xl border border-white/10 bg-white/5 p-4", children: [_jsx("p", { className: "text-sm font-semibold", children: auth.user?.displayName ?? "Giris yapan kullanici" }), _jsx("p", { className: "mt-1 text-xs text-slate-300", children: auth.user?.email ?? auth.authMode.toUpperCase() }), _jsxs("button", { className: "mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-ink", onClick: () => void auth.logout(), type: "button", children: [_jsx(LogOut, { size: 16 }), "Cikis yap"] })] })] }), _jsx("main", { className: "min-w-0", children: _jsx(Outlet, {}) })] }) }));
}
