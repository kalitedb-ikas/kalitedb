import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut, type User } from "firebase/auth";

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

const GOOGLE_CLIENT_ID = "838169214324-uh1bpdokm8ase9314qaghiefgok25n9k.apps.googleusercontent.com";

/**
 * GitHub Pages'ta Firebase popup/redirect çalışmıyor (content blocker + COOP).
 * Manuel Google OAuth implicit flow kullan:
 * 1. Google'a tam sayfa yönlendir (response_type=id_token)
 * 2. Google geri yönlendirince URL hash'ten id_token'ı al
 * 3. signInWithCredential ile Firebase'e giriş yap
 */
function buildGoogleOAuthUrl(): string {
  const nonce = crypto.randomUUID();
  sessionStorage.setItem("oauth_nonce", nonce);

  const redirectUri = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    prompt: "select_account"
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function parseIdTokenFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash.substring(1));
  return params.get("id_token");
}

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

    // URL hash'te Google OAuth id_token var mı kontrol et
    const idToken = parseIdTokenFromHash();
    if (idToken) {
      // Hash'i temizle (token URL'de kalmasın)
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      // Firebase'e giriş yap
      const credential = GoogleAuthProvider.credential(idToken);
      signInWithCredential(firebaseAuth, credential)
        .then((result) => {
          console.log("[Auth] Google OAuth başarılı:", result.user.email);
        })
        .catch((err) => {
          console.error("[Auth] signInWithCredential hatası:", err);
        });
    }

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

        // GitHub Pages'ta manuel OAuth redirect kullan
        if (window.location.hostname.endsWith("github.io")) {
          window.location.href = buildGoogleOAuthUrl();
          return;
        }

        // Localhost'ta popup kullan
        await signInWithPopup(firebaseAuth, googleProvider);
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
