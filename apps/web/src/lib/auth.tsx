import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";

import { firebaseAuth, isFirebaseConfigured } from "./firebase";
import { logAudit } from "./audit-log";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  authMode: "firebase" | "dev" | "none";
  loginWithGoogle: () => Promise<void>;
  loginAsDev: (role: "admin" | "team" | "ceo" | "qt" | "representative") => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const DEV_TOKEN_KEY = "kalitedb.devToken";

/** Firebase ID tokens expire after 60 min — refresh 5 min early. */
const TOKEN_REFRESH_INTERVAL_MS = 55 * 60 * 1000;

const ALLOWED_EMAIL_DOMAINS = ["ikas.com"];
const ALLOWED_DOMAIN_ERROR_MESSAGE =
  "Bu uygulama yalnızca @ikas.com Google hesaplarına açık. Lütfen iş hesabınızla giriş yapın.";

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function AuthProvider(props: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearRefreshTimer() {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }

  function startRefreshTimer(firebaseUser: User) {
    clearRefreshTimer();
    refreshTimerRef.current = setInterval(async () => {
      try {
        const freshToken = await firebaseUser.getIdToken(true);
        setToken(freshToken);
      } catch {
        // silent
      }
    }, TOKEN_REFRESH_INTERVAL_MS);
  }

  useEffect(() => {
    const storedToken = window.localStorage.getItem(DEV_TOKEN_KEY);
    if (storedToken) {
      setDevToken(storedToken);
    }

    if (!firebaseAuth) {
      setLoading(false);
      return;
    }
    const authInstance = firebaseAuth;

    // Redirect dönüşünü yakala (canlıda signInWithRedirect kullanıldığında).
    // Eğer dönen kullanıcı izinli domain dışındaysa anında oturumu kapat.
    getRedirectResult(authInstance)
      .then(async (result) => {
        if (result?.user && !isAllowedEmail(result.user.email)) {
          await signOut(authInstance);
          window.alert(ALLOWED_DOMAIN_ERROR_MESSAGE);
        }
      })
      .catch(() => {});

    const unsubscribe = onAuthStateChanged(authInstance, async (nextUser) => {
      // Defansif: bir şekilde izinli olmayan bir oturum oluştuysa hemen kapat.
      if (nextUser && !isAllowedEmail(nextUser.email)) {
        await signOut(authInstance);
        setUser(null);
        setToken(null);
        clearRefreshTimer();
        setLoading(false);
        return;
      }

      const wasLoggedOut = !user;
      setUser(nextUser);
      if (nextUser) {
        const freshToken = await nextUser.getIdToken();
        setToken(freshToken);
        startRefreshTimer(nextUser);
        if (wasLoggedOut) {
          void logAudit({
            action: "login",
            resource: "session",
            userEmail: nextUser.email ?? "",
            userName: nextUser.displayName ?? undefined
          });
        }
      } else {
        setToken(null);
        clearRefreshTimer();
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      clearRefreshTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token: devToken ?? token,
      loading,
      authMode: devToken ? "dev" : isFirebaseConfigured ? "firebase" : "none",
      async loginWithGoogle() {
        if (!firebaseAuth) {
          return;
        }

        // Popup dene — COOP yüzünden patlarsa redirect'e düş.
        let result;
        try {
          result = await signInWithPopup(firebaseAuth, googleProvider);
        } catch (err: any) {
          if (err?.code === "auth/popup-blocked" ||
              err?.code === "auth/popup-closed-by-user" ||
              err?.code === "auth/cancelled-popup-request" ||
              err?.code === "auth/internal-error") {
            // Popup çalışmadı — tam sayfa redirect ile dene
            await signInWithRedirect(firebaseAuth, googleProvider);
            return;
          }
          throw err;
        }

        if (!isAllowedEmail(result.user.email)) {
          await signOut(firebaseAuth);
          throw new Error(ALLOWED_DOMAIN_ERROR_MESSAGE);
        }
      },
      loginAsDev(role) {
        const nextToken = `dev-${role}`;
        window.localStorage.setItem(DEV_TOKEN_KEY, nextToken);
        setDevToken(nextToken);
        clearRefreshTimer();
      },
      async logout() {
        if (user?.email) {
          void logAudit({
            action: "logout",
            resource: "session",
            userEmail: user.email,
            userName: user.displayName ?? undefined
          });
        }
        window.localStorage.removeItem(DEV_TOKEN_KEY);
        setDevToken(null);
        clearRefreshTimer();
        if (firebaseAuth) {
          await signOut(firebaseAuth);
        }
        setUser(null);
        setToken(null);
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devToken, loading, token, user]
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
