import { createContext, useContext, useEffect, useState } from "react";
import { apiGet } from "../api/api";

// Context
const AuthContext = createContext(null);

// Provider
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // Cargar sesión desde cookies (HttpOnly)
    async function loadMe() {
        try {
            const res = await apiGet("/auth/me");
            if (res.ok && res.data?.user) {
                setUser(res.data.user);
            } else {
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            setAuthLoading(false);
        }
    }

    useEffect(() => {
        loadMe();
        // eslint-disable-next-line
    }, []);

    return (
        <AuthContext.Provider value={{ user, setUser, authLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

// Hook
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used inside <AuthProvider>");
    }
    return ctx;
}
