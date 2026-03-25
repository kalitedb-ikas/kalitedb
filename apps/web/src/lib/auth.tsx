import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";

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

export function AuthProvider(props: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(DEV_TOKEN_KEY);
    if (storedToken) {
      setDevToken(storedToken);
      setLoading(false);
      return;
    }

    if (!firebaseAuth) {
      setLoading(false);
      return;
    }

    return onAuthStateChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);
      setToken(nextUser ? await nextUser.getIdToken() : null);
      setLoading(false);
    });
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

        const credential = await signInWithPopup(firebaseAuth, googleProvider);
        setUser(credential.user);
        setToken(await credential.user.getIdToken());
      },
      loginAsDev(role) {
        const nextToken = `dev-${role}`;
        window.localStorage.setItem(DEV_TOKEN_KEY, nextToken);
        setDevToken(nextToken);
      },
      async logout() {
        window.localStorage.removeItem(DEV_TOKEN_KEY);
        setDevToken(null);
        if (firebaseAuth) {
          await signOut(firebaseAuth);
        }
        setUser(null);
        setToken(null);
      }
    }),
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
