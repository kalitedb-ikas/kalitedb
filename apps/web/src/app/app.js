import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/app-shell";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { AdminPage } from "../pages/admin-page";
import { AuditPage } from "../pages/audit-page";
import { CsatPage } from "../pages/csat-page";
import { DashboardPage } from "../pages/dashboard-page";
import { LoginPage } from "../pages/login-page";
import { PresentationPage } from "../pages/presentation-page";
import { QtPage } from "../pages/qt-page";
import { QuestionsPage } from "../pages/questions-page";
function ProtectedRoutes() {
    const auth = useAuth();
    const meQuery = useQuery({
        enabled: Boolean(auth.token),
        queryKey: ["me", auth.token],
        queryFn: () => api.getMe(auth.token)
    });
    if (auth.loading) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center", children: _jsx(LoaderCircle, { className: "animate-spin" }) }));
    }
    if (!auth.token) {
        return _jsx(Navigate, { replace: true, to: "/login" });
    }
    if (meQuery.isError) {
        return _jsx(Navigate, { replace: true, to: "/login" });
    }
    if (meQuery.isPending) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center", children: _jsx(LoaderCircle, { className: "animate-spin" }) }));
    }
    return (_jsx(Routes, { children: _jsxs(Route, { element: _jsx(AppShell, {}), children: [_jsx(Route, { element: _jsx(DashboardPage, {}), path: "/" }), _jsx(Route, { element: _jsx(AuditPage, {}), path: "/audit" }), _jsx(Route, { element: _jsx(QuestionsPage, {}), path: "/questions" }), _jsx(Route, { element: _jsx(CsatPage, {}), path: "/csat" }), _jsx(Route, { element: _jsx(QtPage, {}), path: "/qt" }), _jsx(Route, { element: _jsx(AdminPage, {}), path: "/admin" }), _jsx(Route, { element: _jsx(PresentationPage, {}), path: "/presentation" })] }) }));
}
export function App() {
    return (_jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { element: _jsx(LoginPage, {}), path: "/login" }), _jsx(Route, { element: _jsx(ProtectedRoutes, {}), path: "/*" })] }) }));
}
