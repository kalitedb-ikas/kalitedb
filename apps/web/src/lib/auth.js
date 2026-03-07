import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { firebaseAuth, googleProvider, isFirebaseConfigured } from "./firebase";
const AuthContext = createContext(undefined);
const DEV_TOKEN_KEY = "kalitedb.devToken";
export function AuthProvider(props) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [devToken, setDevToken] = useState(null);
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
    const value = useMemo(() => ({
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
    }), [devToken, loading, token, user]);
    return _jsx(AuthContext.Provider, { value: value, children: props.children });
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
}
