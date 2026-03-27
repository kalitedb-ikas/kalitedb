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

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoaderCircle className="animate-spin" />
    </div>
  );
}

function canAccessAdmin(currentUser: AuthenticatedUser | undefined) {
  return currentUser?.role === "admin" || currentUser?.role === "qt";
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
        <Route element={<DashboardPage />} path="/" />
        <Route element={<AuditPage />} path="/audit" />
        <Route element={<QuestionsPage />} path="/questions" />
        <Route element={<CsatPage />} path="/csat" />
        <Route element={<QtPage />} path="/qt" />
        <Route
          element={
            auth.token && meQuery.isPending
              ? <LoadingScreen />
              : canAccessAdmin(currentUser)
              ? <AdminPage currentUserRole={currentUser?.role} />
              : auth.token
                ? <Navigate replace to="/" />
                : <Navigate replace to="/login" />
          }
          path="/admin"
        />
        <Route element={<Navigate replace to="/" />} path="/presentation" />
        <Route element={<RepresentativesPage />} path="/representatives" />
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
