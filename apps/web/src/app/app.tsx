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
import { CsPeriodComparePage } from "../pages/cs-period-compare-page";
import { SalesComparePage } from "../pages/sales-compare-page";
import { SalesCompanyComparePage } from "../pages/sales-company-compare-page";
import { AuditLogPage } from "../pages/audit-log-page";
import { SalesRampPage } from "../pages/sales-ramp-page";
import { ROLEPLAY_VISIBLE } from "../lib/feature-flags";
import { useRepScope } from "../lib/use-rep-scope";
import { useEnsureCurrentPeriods } from "../lib/use-ensure-current-period";
import { canAccessDepartment, getDefaultDepartment } from "../lib/department-access";

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
  useEnsureCurrentPeriods(currentUser);
  const repScope = useRepScope(currentUser);
  const defaultDepartment = getDefaultDepartment(currentUser);
  const defaultDepartmentHome =
    defaultDepartment === "sales" ? "/sales" : defaultDepartment === "quality" ? "/quality/qt" : "/cs";
  const repHome = repScope.department === "sales" ? "/sales" : "/cs";
  // Temsilci yalnızca kendi performans sayfasını görür; diğer her şey redirect.
  const repPersonalPath = repScope.department === "sales" ? "/sales/representatives" : "/cs/representatives";
  const repBlocked = isRepresentative(currentUser);
  const blockForRep = (element: ReactElement): ReactElement =>
    repBlocked ? <Navigate replace to={repPersonalPath} /> : element;
  const restrictToDept = (dept: "cs" | "sales" | "quality", element: ReactElement): ReactElement => {
    if (!currentUser) return element;
    return canAccessDepartment(currentUser, dept) ? element : <Navigate replace to={defaultDepartmentHome} />;
  };

  if (auth.loading) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />
      <Route element={<AppShell currentUser={currentUser} />}>
        {/* CS rotaları */}
        <Route element={restrictToDept("cs", blockForRep(<DashboardPage />))} path="/cs" />
        <Route element={restrictToDept("cs", blockForRep(<AuditPage />))} path="/cs/audit" />
        <Route element={restrictToDept("cs", blockForRep(<QuestionsPage />))} path="/cs/questions" />
        <Route element={restrictToDept("cs", blockForRep(<CsatPage />))} path="/cs/csat" />
        <Route element={restrictToDept("cs", <RepresentativesPage />)} path="/cs/representatives" />
        <Route
          element={restrictToDept("cs", blockForRep(<CsComparePage />))}
          path="/cs/compare"
        />
        <Route
          element={restrictToDept("cs", blockForRep(<CsPeriodComparePage />))}
          path="/cs/period-compare"
        />

        {/* Kalite rotaları */}
        <Route element={restrictToDept("quality", <Navigate replace to="/quality/qt" />)} path="/quality" />
        <Route element={restrictToDept("quality", blockForRep(<QtPage />))} path="/quality/qt" />
        <Route
          element={restrictToDept(
            "quality",
            auth.token && meQuery.isPending
              ? <LoadingScreen />
              : canAccessAdmin(currentUser)
              ? <QualityAdminPage currentUserRole={currentUser?.role} />
              : auth.token
                ? <Navigate replace to="/quality/qt" />
                : <Navigate replace to="/login" />
          )}
          path="/quality/admin"
        />

        {/* Satış rotaları */}
        <Route element={restrictToDept("sales", blockForRep(<SalesDashboardPage />))} path="/sales" />
        <Route element={restrictToDept("sales", blockForRep(<SalesKpiPage />))} path="/sales/kpi" />
        <Route element={restrictToDept("sales", blockForRep(<SalesSuccessIndexPage />))} path="/sales/success-index" />
        <Route element={restrictToDept("sales", blockForRep(<SalesRampPage />))} path="/sales/ramp" />
        <Route element={restrictToDept("sales", blockForRep(<SalesPerformancePage />))} path="/sales/performance" />
        <Route element={restrictToDept("sales", <Navigate replace to="/sales/performance" />)} path="/sales/audit" />
        <Route element={restrictToDept("sales", blockForRep(<SalesEvaluationQuestionsPage />))} path="/sales/evaluation-questions" />
        <Route element={restrictToDept("sales", blockForRep(<SalesMeetingsPage />))} path="/sales/meetings" />
        <Route element={restrictToDept("sales", <SalesRepresentativesPage />)} path="/sales/representatives" />
        {ROLEPLAY_VISIBLE ? (
          <Route element={restrictToDept("sales", blockForRep(<SalesRoleplayPage />))} path="/sales/roleplay" />
        ) : null}
        <Route element={restrictToDept("sales", blockForRep(<SalesComparePage />))} path="/sales/compare" />
        <Route element={restrictToDept("sales", blockForRep(<SalesCompanyComparePage />))} path="/sales/kpi/compare" />
        <Route element={restrictToDept("sales", blockForRep(<SalesTargetCalibrationPage />))} path="/sales/kpi/target-calibration" />
        <Route element={restrictToDept("sales", blockForRep(<SalesCalendarPage currentUser={currentUser} />))} path="/sales/calendar" />
        <Route
          element={restrictToDept(
            "sales",
            auth.token && meQuery.isPending
              ? <LoadingScreen />
              : canAccessAdmin(currentUser)
              ? <SalesAdminPage />
              : auth.token
                ? <Navigate replace to="/sales" />
                : <Navigate replace to="/login" />
          )}
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
        <Route element={<Navigate replace to={repBlocked ? repHome : defaultDepartmentHome} />} path="/" />

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
