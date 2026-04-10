import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Gauge, LogOut } from "lucide-react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

export function LoginPage() {
  const auth = useAuth();
  const isDevAuthMode = import.meta.env.VITE_DEV_AUTH_MODE === "true";
  const meQuery = useQuery({
    enabled: Boolean(auth.token),
    queryKey: ["me", auth.token],
    queryFn: () => api.getMe(auth.token),
    retry: false,
    staleTime: 5 * 60 * 1000
  });
  const authError =
    auth.token && meQuery.isError
      ? meQuery.error instanceof Error
        ? meQuery.error.message
        : "Giriş doğrulanamadı."
      : null;
  const roleError = authError?.toLocaleLowerCase("tr-TR").includes("rol") ?? false;

  // Dev token + Firebase user → tam erişim, yönlendir
  // Dev token + Firebase user yok → login sayfasında kal, Google bağlantısı sun
  const hasFirebaseUser = Boolean(auth.user);
  if (auth.token && meQuery.isSuccess && (hasFirebaseUser || auth.authMode !== "dev")) {
    return <Navigate replace to="/" />;
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl items-center justify-center">
        <section className="surface-elevated w-full rounded-[10px] p-6 sm:p-8 lg:p-10">
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

            {auth.authMode === "dev" && !hasFirebaseUser ? (
              <div className="mt-6 rounded-[10px] border border-sky-200 bg-sky-50/90 p-4 text-sm text-sky-900">
                <p className="font-semibold">Dev token aktif — Firestore erişimi için Google ile de bağlanın</p>
                <p className="mt-1 text-sky-800/90">Admin rolü dev token'dan gelecek, Google oturumu sadece veritabanı erişimi sağlar.</p>
              </div>
            ) : null}

            <button
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={auth.authMode === "none"}
              onClick={() => void auth.loginWithGoogle()}
              type="button"
            >
              {auth.authMode === "dev" && !hasFirebaseUser ? "Google ile bağlan" : "Google ile oturum aç"}
              <ArrowRight className="h-4 w-4" />
            </button>

            {auth.token && meQuery.isPending ? (
              <p className="mt-4 text-sm text-slate-500">Hesap doğrulanıyor...</p>
            ) : null}

            {authError ? (
              <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-2">
                    <p className="font-semibold">Giriş tamamlandı ama erişim doğrulanamadı.</p>
                    <p>{authError}</p>
                    <p className="text-amber-800/90">
                      {roleError
                        ? `${auth.user?.email ?? "Seçilen hesap"} için rol tanımı yoksa Yönetim > Roller alanından eklenmesi gerekiyor.`
                        : "Firebase oturumu ile API doğrulaması eşleşmedi. Hesabı değiştirip tekrar deneyin."}
                    </p>
                    <button
                      className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
                      onClick={() => void auth.logout()}
                      type="button"
                    >
                      <LogOut className="h-4 w-4" />
                      Oturumu sıfırla
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {auth.authMode === "dev" && !hasFirebaseUser ? (
              <button
                className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                onClick={() => { window.location.href = "/"; }}
                type="button"
              >
                Google olmadan devam et
              </button>
            ) : null}

            {isDevAuthMode ? (
              <div className="mt-6 rounded-[10px] border border-dashed border-slate-300 bg-slate-50/80 p-4">
                <p className="text-sm font-semibold text-slate-900">Geliştirme bypass</p>
                <p className="mt-1 text-sm text-slate-600">Firebase girişinde sorun varsa geçici olarak rol seçip devam edebilirsiniz.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    onClick={() => auth.loginAsDev("admin")}
                    type="button"
                  >
                    Admin
                  </button>
                  <button
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    onClick={() => auth.loginAsDev("team")}
                    type="button"
                  >
                    Team
                  </button>
                  <button
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    onClick={() => auth.loginAsDev("ceo")}
                    type="button"
                  >
                    CEO
                  </button>
                  <button
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    onClick={() => auth.loginAsDev("qt")}
                    type="button"
                  >
                    QT
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
