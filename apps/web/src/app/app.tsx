import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "../components/app-shell";
import { useAuth } from "../lib/auth";
import { api, type AuthenticatedUser } from "../lib/api";
import { AdminPage } from "../pages/admin-page";
import { AuditPage } from "../pages/audit-page";
import { CsatPage } from "../pages/csat-page";
import { DashboardPage } from "../pages/dashboard-page";
import { LoginPage } from "../pages/login-page";
import { QtPage } from "../pages/qt-page";
import { QuestionsPage } from "../pages/questions-page";
import { RepresentativesPage } from "../pages/representatives-page";
import { SalesAdminPage } from "../pages/sales-admin-page";
import { SalesAuditPage } from "../pages/sales-audit-page";
import { SalesDashboardPage } from "../pages/sales-dashboard-page";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoaderCircle className="animate-spin" />
    </div>
  );
}

function canAccessAdmin(currentUser: AuthenticatedUser | undefined) {
  if (!currentUser) return false;
  return ["admin", "manager", "team_leader", "team", "qt"].includes(currentUser.role);
}

function AppRoutes() {
  const auth = useAuth();
  const meQuery = useQuery({
    enabled: Boolean(auth.token),
    queryKey: ["me", auth.token],
    queryFn: () => api.getMe(auth.token),
    retry: false,
    staleTime: 5 * 60 * 1000
  });

  if (auth.loading) {
    return <LoadingScreen />;
  }

  const currentUser = meQuery.isSuccess ? meQuery.data : undefined;

  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />
      <Route element={<AppShell currentUser={currentUser} />}>
        {/* CS rotaları */}
        <Route element={<DashboardPage />} path="/cs" />
        <Route element={<AuditPage />} path="/cs/audit" />
        <Route element={<QuestionsPage />} path="/cs/questions" />
        <Route element={<CsatPage />} path="/cs/csat" />
        <Route element={<QtPage />} path="/cs/qt" />
        <Route element={<RepresentativesPage />} path="/cs/representatives" />

        {/* Satış rotaları */}
        <Route element={<SalesDashboardPage />} path="/sales" />
        <Route element={<SalesAuditPage />} path="/sales/audit" />
        <Route
          element={
            auth.token && meQuery.isPending
              ? <LoadingScreen />
              : canAccessAdmin(currentUser)
              ? <SalesAdminPage />
              : auth.token
                ? <Navigate replace to="/sales" />
                : <Navigate replace to="/login" />
          }
          path="/sales/admin"
        />

        {/* Yönetim */}
        <Route
          element={
            auth.token && meQuery.isPending
              ? <LoadingScreen />
              : canAccessAdmin(currentUser)
              ? <AdminPage currentUserRole={currentUser?.role} />
              : auth.token
                ? <Navigate replace to="/cs" />
                : <Navigate replace to="/login" />
          }
          path="/admin"
        />

        {/* Kök → CS'e yönlendir */}
        <Route element={<Navigate replace to="/cs" />} path="/" />

        {/* Geriye dönük uyumluluk: eski URL'ler CS'e yönlendirilir */}
        <Route element={<Navigate replace to="/cs/audit" />} path="/audit" />
        <Route element={<Navigate replace to="/cs/questions" />} path="/questions" />
        <Route element={<Navigate replace to="/cs/csat" />} path="/csat" />
        <Route element={<Navigate replace to="/cs/qt" />} path="/qt" />
        <Route element={<Navigate replace to="/cs/representatives" />} path="/representatives" />
        <Route element={<Navigate replace to="/cs" />} path="/presentation" />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppRoutes />
    </BrowserRouter>
  );
}
