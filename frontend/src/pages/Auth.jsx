import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import AuthSuccess from "../components/auth/AuthSuccess.jsx";
import LoginForm from "../components/auth/LoginForm.jsx";
import RegisterForm from "../components/auth/RegisterForm.jsx";
import { getApiBase } from "../config/apiBase.js";
import { isNativeAndroidApp } from "../native/biometricAuth.js";

const API_BASE = getApiBase();
const APP_REMEMBER_LOGIN_KEY = "sb-app-remember-login";
const APP_SAVED_EMAIL_KEY = "sb-app-saved-email";
const APP_LEGACY_SAVED_PASSWORD_KEY = "sb-app-saved-password";

function getTheme() {
    try {
        return localStorage.getItem("sb-theme") || "dark";
    } catch {
        return "dark";
    }
}

function getIsMobile() {
    return typeof window !== "undefined" && window.innerWidth <= 800;
}

function createPalette(theme) {
    const dark = theme === "dark";
    return {
        dark,
        C: {
            bg: dark ? "#070e28" : "#f0f4ff",
            cardBg: dark ? "#070e28" : "#ffffff",
            text: dark ? "#ffffff" : "#0f172a",
            muted: dark ? "rgba(200,215,245,.65)" : "#64748b",
            inputBg: dark ? "rgba(0,0,0,.3)" : "rgba(15,23,42,.05)",
            inputBdr: dark ? "rgba(59,130,246,.25)" : "rgba(37,99,235,.3)",
            shell: dark
                ? `radial-gradient(900px 700px at 15% 10%, rgba(37,99,235,.18), transparent 55%),
                   radial-gradient(900px 700px at 90% 80%, rgba(139,92,246,.14), transparent 55%),
                   linear-gradient(180deg, #050816, #0A0F29)`
                : `radial-gradient(900px 700px at 15% 10%, rgba(191,219,254,.5), transparent 55%),
                   radial-gradient(900px 700px at 90% 80%, rgba(196,181,253,.3), transparent 55%),
                   linear-gradient(180deg, #e8f0fe, #f0f4ff)`,
        },
    };
}

function createStyles({ C, dark, isMobile }) {
    return {
        shell: {
            minHeight: "100vh",
            background: C.shell,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            padding: isMobile ? "72px 0 120px" : "40px 0 88px",
            boxSizing: "border-box",
        },
        gridBg: {
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage: "linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
            opacity: dark ? 0.4 : 0.15,
        },
        orb1: {
            position: "absolute",
            width: 600,
            height: 600,
            borderRadius: "50%",
            left: -200,
            top: -150,
            background: "radial-gradient(circle, rgba(37,99,235,.4), transparent 70%)",
            filter: "blur(80px)",
            opacity: dark ? 0.4 : 0.12,
            pointerEvents: "none",
        },
        orb2: {
            position: "absolute",
            width: 600,
            height: 600,
            borderRadius: "50%",
            right: -200,
            bottom: -200,
            background: "radial-gradient(circle, rgba(139,92,246,.3), transparent 70%)",
            filter: "blur(80px)",
            opacity: dark ? 0.35 : 0.1,
            pointerEvents: "none",
        },
        container: {
            width: isMobile ? "95%" : 900,
            maxWidth: isMobile ? 420 : "95vw",
            height: isMobile ? "auto" : 720,
            position: "relative",
            overflow: "hidden",
            borderRadius: 28,
            boxShadow: dark
                ? "0 30px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.07) inset"
                : "0 20px 60px rgba(37,99,235,.15), 0 0 0 1px rgba(37,99,235,.1) inset",
            background: C.cardBg,
            zIndex: 10,
        },
        formSide: (active) => isMobile ? {
            width: "100%",
            height: "auto",
            display: active ? "none" : "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "40px 24px",
            background: C.cardBg,
        } : {
            width: "50%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 52px",
            transition: "all .65s cubic-bezier(.77,0,.175,1)",
            transform: active ? "translateX(100%)" : "translateX(0)",
            opacity: active ? 0 : 1,
            pointerEvents: active ? "none" : "all",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: active ? 1 : 2,
            background: C.cardBg,
        },
        regSide: (active) => isMobile ? {
            width: "100%",
            height: "auto",
            display: active ? "flex" : "none",
            flexDirection: "column",
            justifyContent: "flex-start",
            padding: "40px 24px",
            background: C.cardBg,
        } : {
            width: "50%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            padding: "24px 52px",
            overflowY: "auto",
            transition: "all .65s cubic-bezier(.77,0,.175,1)",
            transform: active ? "translateX(100%)" : "translateX(200%)",
            opacity: active ? 1 : 0,
            pointerEvents: active ? "all" : "none",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: active ? 2 : 1,
            background: C.cardBg,
        },
        overlay: (active) => ({
            display: isMobile ? "none" : "flex",
            position: "absolute",
            top: 0,
            right: 0,
            width: "50%",
            height: "100%",
            background: "linear-gradient(145deg, #06b6d4 0%, #0284c7 50%, #1d4ed8 100%)",
            transition: "transform .65s cubic-bezier(.77,0,.175,1)",
            transform: active ? "translateX(-100%)" : "translateX(0)",
            zIndex: 100,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            padding: "0 48px",
            textAlign: "center",
        }),
        themeBtn: {
            position: "fixed",
            top: 20,
            right: 20,
            width: 44,
            height: 44,
            borderRadius: 12,
            background: dark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.8)",
            border: dark ? "1px solid rgba(255,255,255,.12)" : "1px solid rgba(37,99,235,.2)",
            color: dark ? "#fff" : "#1d4ed8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 9999,
            backdropFilter: "blur(8px)",
            transition: "all .2s",
            boxShadow: dark ? "none" : "0 2px 8px rgba(37,99,235,.15)",
        },
        heading: {
            fontSize: isMobile ? 24 : 28,
            fontWeight: 800,
            letterSpacing: 0,
            marginBottom: isMobile ? 18 : 24,
            color: C.text,
        },
        label: {
            fontSize: 13,
            color: C.muted,
            display: "flex",
            flexDirection: "column",
            gap: 5,
            marginBottom: isMobile ? 10 : 12,
        },
        input: {
            height: 50,
            borderRadius: 14,
            border: `1px solid ${C.inputBdr}`,
            background: C.inputBg,
            color: C.text,
            padding: "0 16px",
            outline: "none",
            fontSize: 15,
            transition: "all .2s",
            boxSizing: "border-box",
        },
        btn: {
            height: 50,
            borderRadius: 14,
            border: "none",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            width: "100%",
            marginTop: 6,
            transition: "all .2s",
            boxShadow: "0 4px 14px rgba(37,99,235,.35)",
        },
        err: {
            background: "rgba(239,68,68,.12)",
            border: "1px solid rgba(239,68,68,.25)",
            color: "#fca5a5",
            padding: "9px 14px",
            borderRadius: 12,
            fontSize: 13,
            marginBottom: 10,
        },
        relativeWrap: { position: "relative" },
        eyeBtn: {
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            color: C.muted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
        },
        overlayTitle: {
            fontSize: 36,
            fontWeight: 800,
            color: "#fff",
            marginBottom: 16,
            letterSpacing: 0,
            lineHeight: 1.1,
        },
        overlayText: {
            fontSize: 14,
            color: "rgba(255,255,255,.85)",
            lineHeight: 1.7,
            marginBottom: 32,
        },
        overlayBtn: {
            background: "rgba(255,255,255,.12)",
            backdropFilter: "blur(12px)",
            border: "2px solid rgba(255,255,255,.5)",
            color: "#fff",
            padding: "12px 48px",
            borderRadius: 50,
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            transition: "all .3s",
            letterSpacing: 0.3,
        },
        legalBar: {
            position: "absolute",
            bottom: isMobile ? 14 : 20,
            left: "50%",
            transform: "translateX(-50%)",
            color: dark ? "rgba(255,255,255,.88)" : "#475569",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 120,
            padding: "8px 14px",
            borderRadius: 999,
            background: dark ? "rgba(7,14,40,.42)" : "rgba(255,255,255,.82)",
            border: dark ? "1px solid rgba(255,255,255,.08)" : "1px solid rgba(37,99,235,.14)",
            backdropFilter: "blur(10px)",
            boxShadow: dark ? "0 8px 24px rgba(0,0,0,.22)" : "0 8px 24px rgba(37,99,235,.12)",
            whiteSpace: "nowrap",
            maxWidth: "calc(100vw - 24px)",
        },
        legalLink: {
            background: "none",
            border: "none",
            padding: 0,
            color: dark ? "#7dd3fc" : "#1d4ed8",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
        },
        forgotLink: {
            background: "none",
            border: "none",
            padding: 0,
            margin: "-2px 0 10px auto",
            color: dark ? "#7dd3fc" : "#1d4ed8",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "block",
        },
        checkboxRow: {
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginTop: 8,
            marginBottom: 10,
            color: C.muted,
            fontSize: 13,
            lineHeight: 1.5,
        },
        checkbox: {
            width: 16,
            height: 16,
            marginTop: 2,
            accentColor: "#2563eb",
            cursor: "pointer",
            flexShrink: 0,
        },
        checkboxText: {
            color: C.muted,
        },
    };
}

export default function Auth() {
    const navigate = useNavigate();
    const location = useLocation();
    const { setUser } = useAuth();

    const [isRegister, setIsRegister] = useState(location.pathname === "/register");
    const [theme, setTheme] = useState(getTheme);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [isMobile, setIsMobile] = useState(getIsMobile);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showPwd, setShowPwd] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [rememberLogin, setRememberLogin] = useState(isNativeAndroidApp());

    const { dark, C } = useMemo(() => createPalette(theme), [theme]);
    const S = useMemo(() => createStyles({ C, dark, isMobile }), [C, dark, isMobile]);

    useEffect(() => {
        const handleResize = () => setIsMobile(getIsMobile());
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem("sb-theme", theme);
        } catch {
            // ignore storage failures
        }
    }, [theme]);

    useEffect(() => {
        setIsRegister(location.pathname === "/register");
        setError("");
    }, [location.pathname]);

    useEffect(() => {
        if (!isNativeAndroidApp()) return;
        try {
            const savedRemember = localStorage.getItem(APP_REMEMBER_LOGIN_KEY);
            const nextRemember = savedRemember === null ? true : savedRemember === "1";
            setRememberLogin(nextRemember);
            localStorage.removeItem(APP_LEGACY_SAVED_PASSWORD_KEY);
            if (location.pathname !== "/") return;
            setEmail(nextRemember ? (localStorage.getItem(APP_SAVED_EMAIL_KEY) || "") : "");
            setPassword("");
        } catch {
            setRememberLogin(true);
        }
    }, [location.pathname]);

    function toggle() {
        setError("");
        const next = !isRegister;
        setIsRegister(next);
        navigate(next ? "/register" : "/");
    }

    function persistNativeAppCredentials(nextEmail, shouldRemember) {
        if (!isNativeAndroidApp()) return;
        try {
            localStorage.setItem(APP_REMEMBER_LOGIN_KEY, shouldRemember ? "1" : "0");
            localStorage.removeItem(APP_LEGACY_SAVED_PASSWORD_KEY);
            if (shouldRemember) {
                localStorage.setItem(APP_SAVED_EMAIL_KEY, nextEmail.trim().toLowerCase());
            } else {
                localStorage.removeItem(APP_SAVED_EMAIL_KEY);
            }
        } catch {
            // ignore storage failures
        }
    }

    async function handleLogin(event) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Error al iniciar sesión.");
            persistNativeAppCredentials(email, rememberLogin);
            setUser(data?.user || null);
            navigate(data?.user?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        setError("");
        if (password !== confirmPassword) return setError("Las contraseñas no coinciden.");
        if (password.length < 8) return setError("La contraseña debe tener mínimo 8 caracteres.");
        if (!acceptedTerms) return setError("Debes aceptar los Términos y Condiciones.");
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Error al crear cuenta.");
            setSuccess(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    if (success) {
        return (
            <AuthSuccess
                S={S}
                onBack={() => {
                    setSuccess(false);
                    setIsRegister(false);
                    navigate("/");
                }}
            />
        );
    }

    return (
        <AuthLayout
            S={S}
            theme={theme}
            setTheme={setTheme}
            isRegister={isRegister}
            toggle={toggle}
            showTerms={showTerms}
            setShowTerms={setShowTerms}
        >
            <LoginForm
                S={S}
                C={C}
                dark={dark}
                isRegister={isRegister}
                isMobile={isMobile}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                showPwd={showPwd}
                setShowPwd={setShowPwd}
                rememberLogin={rememberLogin}
                setRememberLogin={setRememberLogin}
                loading={loading}
                error={error}
                onSubmit={handleLogin}
                onForgotPassword={() => navigate(email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : "/forgot-password")}
                toggle={toggle}
            />
            <RegisterForm
                S={S}
                C={C}
                isRegister={isRegister}
                isMobile={isMobile}
                name={name}
                setName={setName}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                confirmPassword={confirmPassword}
                setConfirmPassword={setConfirmPassword}
                acceptedTerms={acceptedTerms}
                setAcceptedTerms={setAcceptedTerms}
                showPwd={showPwd}
                setShowPwd={setShowPwd}
                showConfirm={showConfirm}
                setShowConfirm={setShowConfirm}
                loading={loading}
                error={error}
                onSubmit={handleRegister}
                toggle={toggle}
                onOpenTerms={() => setShowTerms(true)}
            />
        </AuthLayout>
    );
}
