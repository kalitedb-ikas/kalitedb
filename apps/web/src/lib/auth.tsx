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
 * Google Identity Services ile credential al, Firebase'e gir.
 * Popup/redirect kullanmaz — tarayıcı kısıtlamalarından etkilenmez.
 */
function loginWithGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google?.accounts?.id) {
      reject(new Error("Google Identity Services yüklenemedi"));
      return;
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        try {
          if (!firebaseAuth) throw new Error("Firebase Auth hazır değil");
          const credential = GoogleAuthProvider.credential(response.credential);
          await signInWithCredential(firebaseAuth, credential);
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      auto_select: false,
      ux_mode: "popup"
    });

    google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One Tap gösterilemedi — klasik OAuth popup aç
        google.accounts.oauth2.initCodeClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: "openid email profile",
          ux_mode: "popup",
          callback: async (response: { code?: string; error?: string }) => {
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            // Code flow için token exchange gerekir, bunun yerine
            // doğrudan id_token isteyelim
          }
        });

        // Alternatif: Token client ile id_token al
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: "openid email profile",
          callback: async (tokenResponse: { access_token?: string; error?: string }) => {
            if (tokenResponse.error || !tokenResponse.access_token) {
              reject(new Error(tokenResponse.error ?? "Token alınamadı"));
              return;
            }
            try {
              if (!firebaseAuth) throw new Error("Firebase Auth hazır değil");
              const credential = GoogleAuthProvider.credential(null, tokenResponse.access_token);
              await signInWithCredential(firebaseAuth, credential);
              resolve();
            } catch (err) {
              reject(err);
            }
          }
        });
        tokenClient.requestAccessToken({ prompt: "select_account" });
      }
    });
  });
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

        // GitHub Pages'ta GIS kullan (popup/redirect çalışmıyor)
        if (window.location.hostname.endsWith("github.io")) {
          await loginWithGIS();
          return;
        }

        // Localhost'ta klasik popup kullan
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
