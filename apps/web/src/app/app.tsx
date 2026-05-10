import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import type { ReactElement } from "react";
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
import { SalesPerformancePage } from "../pages/sales-performance-page";
import { SalesCalendarPage } from "../pages/sales-calendar-page";
import { SalesDashboardPage } from "../pages/sales-dashboard-page";
import { SalesEvaluationQuestionsPage } from "../pages/sales-evaluation-questions-page";
import { SalesKpiPage } from "../pages/sales-kpi-page";
import { SalesMeetingsPage } from "../pages/sales-meetings-page";
import { SalesRepresentativesPage } from "../pages/sales-representatives-page";
import { SalesRoleplayPage } from "../pages/sales-roleplay-page";
import { SalesSuccessIndexPage } from "../pages/sales-success-index-page";
import { SalesTargetCalibrationPage } from "../pages/sales-target-calibration-page";
import { CsComparePage } from "../pages/cs-compare-page";
import { SalesComparePage } from "../pages/sales-compare-page";
import { SalesCompanyComparePage } from "../pages/sales-company-compare-page";
import { AuditLogPage } from "../pages/audit-log-page";
import { SalesRampPage } from "../pages/sales-ramp-page";
import { ROLEPLAY_VISIBLE } from "../lib/feature-flags";
import { useRepScope } from "../lib/use-rep-scope";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoaderCircle className="animate-spin" />
    </div>
  );
}

function canAccessAdmin(currentUser: AuthenticatedUser | undefined) {
  return Boolean(currentUser) && currentUser?.role !== "viewer" && currentUser?.role !== "representative";
}

function isRepresentative(currentUser: AuthenticatedUser | undefined) {
  return currentUser?.role === "representative";
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

  const currentUser = meQuery.isSuccess ? meQuery.data : undefined;
  const repScope = useRepScope(currentUser);
  const repHome = repScope.department === "sales" ? "/sales" : "/cs";
  // Temsilci yalnızca kendi performans sayfasını görür; diğer her şey redirect.
  const repPersonalPath = repScope.department === "sales" ? "/sales/representatives" : "/cs/representatives";
  const repBlocked = isRepresentative(currentUser);
  const blockForRep = (element: ReactElement): ReactElement =>
    repBlocked ? <Navigate replace to={repPersonalPath} /> : element;

  if (auth.loading) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />
      <Route element={<AppShell currentUser={currentUser} />}>
        {/* CS rotaları */}
        <Route element={blockForRep(<DashboardPage />)} path="/cs" />
        <Route element={blockForRep(<AuditPage />)} path="/cs/audit" />
        <Route element={blockForRep(<QuestionsPage />)} path="/cs/questions" />
        <Route element={blockForRep(<CsatPage />)} path="/cs/csat" />
        <Route element={<RepresentativesPage />} path="/cs/representatives" />
        <Route
          element={blockForRep(<CsComparePage />)}
          path="/cs/compare"
        />

        {/* Kalite rotaları */}
        <Route element={<Navigate replace to="/quality/qt" />} path="/quality" />
        <Route element={blockForRep(<QtPage />)} path="/quality/qt" />
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
        <Route element={blockForRep(<SalesDashboardPage />)} path="/sales" />
        <Route element={blockForRep(<SalesKpiPage />)} path="/sales/kpi" />
        <Route element={blockForRep(<SalesSuccessIndexPage />)} path="/sales/success-index" />
        <Route element={blockForRep(<SalesRampPage />)} path="/sales/ramp" />
        <Route element={blockForRep(<SalesPerformancePage />)} path="/sales/performance" />
        <Route element={<Navigate replace to="/sales/performance" />} path="/sales/audit" />
        <Route element={blockForRep(<SalesEvaluationQuestionsPage />)} path="/sales/evaluation-questions" />
        <Route element={blockForRep(<SalesMeetingsPage />)} path="/sales/meetings" />
        <Route element={<SalesRepresentativesPage />} path="/sales/representatives" />
        {ROLEPLAY_VISIBLE ? (
          <Route element={blockForRep(<SalesRoleplayPage />)} path="/sales/roleplay" />
        ) : null}
        <Route element={blockForRep(<SalesComparePage />)} path="/sales/compare" />
        <Route element={blockForRep(<SalesCompanyComparePage />)} path="/sales/kpi/compare" />
        <Route element={blockForRep(<SalesTargetCalibrationPage />)} path="/sales/kpi/target-calibration" />
        <Route element={blockForRep(<SalesCalendarPage currentUser={currentUser} />)} path="/sales/calendar" />
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

        {/* İşlem Geçmişi — süper adminler */}
        <Route
          element={
            currentUser?.email && [
              "zafer.coban@ikas.com",
              "cagrican.gumustepe@ikas.com",
              "yavuz.yalcin@ikas.com",
              "sercan.ari@ikas.com",
              "baturay.cetinel@ikas.com"
            ].includes(currentUser.email.toLowerCase())
              ? <AuditLogPage />
              : <Navigate replace to="/" />
          }
          path="/audit-log"
        />

        {/* Yönetim */}
        <Route
          element={
            auth.token && meQuery.isPending
              ? <LoadingScreen />
              : canAccessAdmin(currentUser)
              ? <AdminPage currentUserRole={currentUser?.role} />
              : auth.token
                ? <Navigate replace to={repHome} />
                : <Navigate replace to="/login" />
          }
          path="/admin"
        />

        {/* Kök → kullanıcının departmanına yönlendir */}
        <Route element={<Navigate replace to={repHome} />} path="/" />

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
