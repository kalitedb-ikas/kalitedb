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
import { PresentationPage } from "../pages/presentation-page";
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

function AccessErrorScreen(props: { message: string; onLogout: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-coral">Erişim hatası</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">Oturum açıldı ama yetki alınamadı</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{props.message}</p>
        <button
          className="mt-6 rounded-full bg-brand-ink px-5 py-3 text-sm font-semibold text-white"
          onClick={props.onLogout}
          type="button"
        >
          Oturumu kapat
        </button>
      </div>
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
    retry: false
  });

  if (auth.loading) {
    return <LoadingScreen />;
  }

  if (auth.token && meQuery.isError) {
    const message = meQuery.error instanceof Error ? meQuery.error.message : "Oturum doğrulanamadı.";
    return <AccessErrorScreen message={message} onLogout={() => void auth.logout()} />;
  }

  if (auth.token && meQuery.isPending) {
    return <LoadingScreen />;
  }

  const currentUser = meQuery.data;

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
            canAccessAdmin(currentUser)
              ? <AdminPage currentUserRole={currentUser?.role} />
              : auth.token
                ? <Navigate replace to="/" />
                : <Navigate replace to="/login" />
          }
          path="/admin"
        />
        <Route element={<PresentationPage />} path="/presentation" />
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
