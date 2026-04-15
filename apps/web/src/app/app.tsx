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
import { QualityAdminPage } from "../pages/quality-admin-page";
import { QuestionsPage } from "../pages/questions-page";
import { RepresentativesPage } from "../pages/representatives-page";
import { SalesAdminPage } from "../pages/sales-admin-page";
import { SalesAuditPage } from "../pages/sales-audit-page";
import { SalesCalendarPage } from "../pages/sales-calendar-page";
import { SalesDashboardPage } from "../pages/sales-dashboard-page";
import { SalesEvaluationQuestionsPage } from "../pages/sales-evaluation-questions-page";
import { SalesKpiPage } from "../pages/sales-kpi-page";
import { SalesMeetingsPage } from "../pages/sales-meetings-page";
import { SalesRepresentativesPage } from "../pages/sales-representatives-page";
import { SalesSuccessIndexPage } from "../pages/sales-success-index-page";
import { CsComparePage } from "../pages/cs-compare-page";
import { SalesComparePage } from "../pages/sales-compare-page";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoaderCircle className="animate-spin" />
    </div>
  );
}

function canAccessAdmin(currentUser: AuthenticatedUser | undefined) {
  if (!currentUser) return false;
  return ["admin", "manager", "team_leader", "team", "qt", "quality"].includes(currentUser.role);
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
        <Route element={<RepresentativesPage />} path="/cs/representatives" />
        <Route element={<CsComparePage />} path="/cs/compare" />

        {/* Kalite rotaları */}
        <Route element={<Navigate replace to="/quality/qt" />} path="/quality" />
        <Route element={<QtPage />} path="/quality/qt" />
        <Route
          element={
            auth.token && meQuery.isPending
              ? <LoadingScreen />
              : canAccessAdmin(currentUser)
              ? <QualityAdminPage currentUserRole={currentUser?.role} />
              : auth.token
                ? <Navigate replace to="/quality/qt" />
                : <Navigate replace to="/login" />
          }
          path="/quality/admin"
        />

        {/* Satış rotaları */}
        <Route element={<SalesDashboardPage />} path="/sales" />
        <Route element={<SalesKpiPage />} path="/sales/kpi" />
        <Route element={<SalesSuccessIndexPage />} path="/sales/success-index" />
        <Route element={<SalesAuditPage />} path="/sales/audit" />
        <Route element={<SalesEvaluationQuestionsPage />} path="/sales/evaluation-questions" />
        <Route element={<SalesMeetingsPage />} path="/sales/meetings" />
        <Route element={<SalesRepresentativesPage />} path="/sales/representatives" />
        <Route element={<SalesComparePage />} path="/sales/compare" />
        <Route element={<SalesCalendarPage currentUser={currentUser} />} path="/sales/calendar" />
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
        <Route element={<Navigate replace to="/quality/qt" />} path="/qt" />
        <Route element={<Navigate replace to="/quality/qt" />} path="/cs/qt" />
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
