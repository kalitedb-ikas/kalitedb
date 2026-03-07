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
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="animate-spin" />
      </div>
    );
  }

  if (!auth.token) {
    return <Navigate replace to="/login" />;
  }

  if (meQuery.isError) {
    return <Navigate replace to="/login" />;
  }

  if (meQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<AuditPage />} path="/audit" />
        <Route element={<QuestionsPage />} path="/questions" />
        <Route element={<CsatPage />} path="/csat" />
        <Route element={<QtPage />} path="/qt" />
        <Route element={<AdminPage />} path="/admin" />
        <Route element={<PresentationPage />} path="/presentation" />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route element={<ProtectedRoutes />} path="/*" />
      </Routes>
    </BrowserRouter>
  );
}
