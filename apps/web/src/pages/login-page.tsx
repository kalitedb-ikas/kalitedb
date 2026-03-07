import { ShieldCheck } from "lucide-react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../lib/auth";

export function LoginPage() {
  const auth = useAuth();

  if (auth.token) {
    return <Navigate replace to="/" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] bg-brand-ink p-10 text-white shadow-panel">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm">
            <ShieldCheck size={18} />
            Kalite ve eğitim raporlama merkezi
          </div>
          <h1 className="mt-8 text-5xl font-semibold leading-tight">
            CEO sunumu için hazır,
            <br />
            aylık kalite raporlama akışı.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-200">
            Audit, kayıp sorular, CSAT ve QT performansı tek ekranda. Taslak içe aktarma, yayımlama ve sunum modu tek akışta.
          </p>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-coral">Kimlik doğrulama</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-950">Giriş yap</h2>
          <p className="mt-2 text-sm text-slate-500">
            Üretimde yalnız Google girişi kullanılır. Geliştirme modunda bypass düğmeleri açılabilir.
          </p>

          <button
            className="mt-8 w-full rounded-2xl bg-brand-ink px-5 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={auth.authMode === "none"}
            onClick={() => void auth.loginWithGoogle()}
            type="button"
          >
            Google ile giriş yap
          </button>

          {import.meta.env.VITE_DEV_AUTH_MODE === "true" ? (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-300 p-4">
              <p className="text-sm font-semibold text-slate-900">Geliştirme bypass</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="rounded-full border px-4 py-2 text-sm font-semibold" onClick={() => auth.loginAsDev("admin")} type="button">
                  Admin
                </button>
                <button className="rounded-full border px-4 py-2 text-sm font-semibold" onClick={() => auth.loginAsDev("team")} type="button">
                  Ekip
                </button>
                <button className="rounded-full border px-4 py-2 text-sm font-semibold" onClick={() => auth.loginAsDev("ceo")} type="button">
                  CEO
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
