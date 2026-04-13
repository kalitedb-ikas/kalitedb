import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";

import { firebaseAuth, googleProvider, isFirebaseConfigured } from "./firebase";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  authMode: "firebase" | "dev" | "none";
  loginWithGoogle: () => Promise<void>;
  loginAsDev: (role: "admin" | "team" | "ceo" | "qt") => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const DEV_TOKEN_KEY = "kalitedb.devToken";

/** Firebase ID tokens expire after 60 min — refresh 5 min early. */
const TOKEN_REFRESH_INTERVAL_MS = 55 * 60 * 1000;

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

    // signInWithRedirect dönüşünü kontrol et
    getRedirectResult(firebaseAuth)
      .then((result) => {
        if (result?.user) {
          console.log("[Auth] Redirect başarılı:", result.user.email);
        }
      })
      .catch(() => {});

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const freshToken = await nextUser.getIdToken();
        setToken(freshToken);
        startRefreshTimer(nextUser);
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
        if (!firebaseAuth || !googleProvider) {
          return;
        }

        await signInWithRedirect(firebaseAuth, googleProvider);
      },
      loginAsDev(role) {
        const nextToken = `dev-${role}`;
        window.localStorage.setItem(DEV_TOKEN_KEY, nextToken);
        setDevToken(nextToken);
        clearRefreshTimer();
      },
      async logout() {
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
