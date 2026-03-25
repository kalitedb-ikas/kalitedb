import { ArrowRight, Gauge } from "lucide-react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../lib/auth";

export function LoginPage() {
  const auth = useAuth();

  if (auth.token) {
    return <Navigate replace to="/" />;
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl items-center justify-center">
        <section className="surface-elevated w-full rounded-[32px] p-6 sm:p-8 lg:p-10">
          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-600">
              <Gauge className="h-4 w-4 text-primary" />
              Güvenli oturum
            </div>
            <h2 className="mt-6 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              Giriş yapın
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              Devam etmek için kurum hesabınızla oturum açın.
            </p>

            <button
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={auth.authMode === "none"}
              onClick={() => void auth.loginWithGoogle()}
              type="button"
            >
              Google ile oturum aç
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
