import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Sun, Moon, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import StreamingBoxLogo from "../components/StreamingBoxLogo.jsx";
import { getApiBase } from "../config/apiBase.js";
import { isNativeAndroidApp } from "../native/biometricAuth.js";

const API_BASE = getApiBase();
const LOGO_URL = "/api/branding/logo";
const APP_REMEMBER_LOGIN_KEY = "sb-app-remember-login";
const APP_SAVED_EMAIL_KEY = "sb-app-saved-email";
const APP_LEGACY_SAVED_PASSWORD_KEY = "sb-app-saved-password";

function getTheme() {
    try { return localStorage.getItem("sb-theme") || "dark"; } catch { return "dark"; }
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
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 800);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Form
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showPwd, setShowPwd] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [rememberLogin, setRememberLogin] = useState(isNativeAndroidApp());

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem("sb-theme", theme); } catch { }
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

    const toggle = () => {
        setError("");
        const next = !isRegister;
        setIsRegister(next);
        navigate(next ? "/register" : "/");
    };

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
        } catch { }
    }

    async function handleLogin(e) {
        e.preventDefault();
        setError(""); setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Error al iniciar sesión.");
            persistNativeAppCredentials(email, rememberLogin);
            setUser(data?.user || null);
            navigate(data?.user?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    }

    async function handleRegister(e) {
        e.preventDefault();
        setError("");
        if (password !== confirmPassword) return setError("Las contraseñas no coinciden.");
        if (password.length < 8) return setError("La contraseña debe tener mínimo 8 caracteres.");
        if (!acceptedTerms) return setError("Debes aceptar los Términos y Condiciones.");
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Error al crear cuenta.");
            setSuccess(true);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    }

    // ── Theme-aware color tokens ──
    const dark = theme === "dark";
    const C = {
        bg:        dark ? "#070e28"              : "#f0f4ff",
        cardBg:    dark ? "#070e28"              : "#ffffff",
        text:      dark ? "#ffffff"              : "#0f172a",
        muted:     dark ? "rgba(200,215,245,.65)" : "#64748b",
        inputBg:   dark ? "rgba(0,0,0,.3)"       : "rgba(15,23,42,.05)",
        inputBdr:  dark ? "rgba(59,130,246,.25)" : "rgba(37,99,235,.3)",
        dropBg:    dark ? "#0c1438"              : "#f8faff",
        dropBdr:   dark ? "rgba(59,130,246,.2)"  : "rgba(37,99,235,.2)",
        srchBg:    dark ? "rgba(255,255,255,.07)" : "rgba(15,23,42,.05)",
        shell:     dark
            ? `radial-gradient(900px 700px at 15% 10%, rgba(37,99,235,.18), transparent 55%),
               radial-gradient(900px 700px at 90% 80%, rgba(139,92,246,.14), transparent 55%),
               linear-gradient(180deg, #050816, #0A0F29)`
            : `radial-gradient(900px 700px at 15% 10%, rgba(191,219,254,.5), transparent 55%),
               radial-gradient(900px 700px at 90% 80%, rgba(196,181,253,.3), transparent 55%),
               linear-gradient(180deg, #e8f0fe, #f0f4ff)`,
    };

    // ── CSS-in-JS styles ──
    const S = {
        shell: {
            minHeight: "100vh",
            background: C.shell,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", overflow: "hidden",
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            padding: isMobile ? "72px 0 120px" : "40px 0 88px",
            boxSizing: "border-box",
        },
        gridBg: {
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)",
            backgroundSize: "48px 48px", opacity: dark ? .4 : .15,
        },
        orb1: {
            position: "absolute", width: 600, height: 600, borderRadius: "50%",
            left: -200, top: -150,
            background: "radial-gradient(circle, rgba(37,99,235,.4), transparent 70%)",
            filter: "blur(80px)", opacity: dark ? .4 : .12, pointerEvents: "none",
        },
        orb2: {
            position: "absolute", width: 600, height: 600, borderRadius: "50%",
            right: -200, bottom: -200,
            background: "radial-gradient(circle, rgba(139,92,246,.3), transparent 70%)",
            filter: "blur(80px)", opacity: dark ? .35 : .1, pointerEvents: "none",
        },
        container: {
            width: isMobile ? "95%" : 900,
            maxWidth: isMobile ? 420 : "95vw",
            height: isMobile ? "auto" : 720,
            position: "relative", overflow: "hidden",
            borderRadius: 28,
            boxShadow: dark
                ? "0 30px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.07) inset"
                : "0 20px 60px rgba(37,99,235,.15), 0 0 0 1px rgba(37,99,235,.1) inset",
            background: C.cardBg,
            zIndex: 10,
        },
        formSide: (active) => isMobile ? {
            width: "100%", height: "auto",
            display: active ? "none" : "flex",
            flexDirection: "column", justifyContent: "center",
            padding: "40px 24px",
            background: C.cardBg,
        } : {
            width: "50%", height: "100%",
            display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "0 52px",
            transition: "all .65s cubic-bezier(.77,0,.175,1)",
            transform: active ? "translateX(100%)" : "translateX(0)",
            opacity: active ? 0 : 1,
            pointerEvents: active ? "none" : "all",
            position: "absolute", top: 0, left: 0,
            zIndex: active ? 1 : 2,
            background: C.cardBg,
        },
        regSide: (active) => isMobile ? {
            width: "100%", height: "auto",
            display: active ? "flex" : "none",
            flexDirection: "column", justifyContent: "flex-start",
            padding: "40px 24px",
            background: C.cardBg,
        } : {
            width: "50%", height: "100%",
            display: "flex", flexDirection: "column", justifyContent: "flex-start",
            padding: "24px 52px", overflowY: "auto",
            transition: "all .65s cubic-bezier(.77,0,.175,1)",
            transform: active ? "translateX(100%)" : "translateX(200%)",
            opacity: active ? 1 : 0,
            pointerEvents: active ? "all" : "none",
            position: "absolute", top: 0, left: 0,
            zIndex: active ? 2 : 1,
            background: C.cardBg,
        },
        overlay: (active) => ({
            display: isMobile ? "none" : "flex",
            position: "absolute", top: 0, right: 0,
            width: "50%", height: "100%",
            background: "linear-gradient(145deg, #06b6d4 0%, #0284c7 50%, #1d4ed8 100%)",
            transition: "transform .65s cubic-bezier(.77,0,.175,1)",
            transform: active ? "translateX(-100%)" : "translateX(0)",
            zIndex: 100,
            alignItems: "center", justifyContent: "center",
            flexDirection: "column", padding: "0 48px", textAlign: "center",
        }),
        themeBtn: {
            position: "fixed", top: 20, right: 20,
            width: 44, height: 44, borderRadius: 12,
            background: dark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.8)",
            border: dark ? "1px solid rgba(255,255,255,.12)" : "1px solid rgba(37,99,235,.2)",
            color: dark ? "#fff" : "#1d4ed8",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 9999, backdropFilter: "blur(8px)",
            transition: "all .2s", boxShadow: dark ? "none" : "0 2px 8px rgba(37,99,235,.15)",
        },
        heading: {
            fontSize: isMobile ? 24 : 28, fontWeight: 800, letterSpacing: -0.5,
            marginBottom: isMobile ? 18 : 24, color: C.text,
        },
        label: {
            fontSize: 13, color: C.muted,
            display: "flex", flexDirection: "column", gap: 5, marginBottom: isMobile ? 10 : 12,
        },
        input: {
            height: 50, borderRadius: 14,
            border: `1px solid ${C.inputBdr}`,
            background: C.inputBg, color: C.text,
            padding: "0 16px", outline: "none",
            fontSize: 15, transition: "all .2s",
            boxSizing: "border-box",
        },
        btn: {
            height: 50, borderRadius: 14, border: "none",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#fff", fontWeight: 700, fontSize: 16,
            cursor: "pointer", width: "100%", marginTop: 6,
            transition: "all .2s",
            boxShadow: "0 4px 14px rgba(37,99,235,.35)",
        },
        err: {
            background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)",
            color: "#fca5a5", padding: "9px 14px", borderRadius: 12,
            fontSize: 13, marginBottom: 10,
        },
        relativeWrap: { position: "relative" },
        eyeBtn: {
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", color: C.muted,
            cursor: "pointer", display: "flex", alignItems: "center",
        },
        countryTrigger: {
            display: "flex", alignItems: "center", gap: 8,
            height: "100%", border: "none",
            background: "transparent", color: C.text,
            padding: "0 14px", cursor: "pointer", minWidth: 90,
            fontSize: 15, transition: "all .2s", whiteSpace: "nowrap",
            borderRight: `1px solid ${C.inputBdr}`,
        },
        phoneInput: {
            flex: 1, height: "100%", border: "none",
            background: "transparent", color: C.text,
            padding: "0 16px", outline: "none", fontSize: 15,
        },
        unifiedInput: {
            display: "flex", alignItems: "center",
            height: 50, borderRadius: 14,
            border: `1px solid ${C.inputBdr}`,
            background: C.inputBg, overflow: "hidden",
            boxSizing: "border-box", transition: "all .2s",
        },
        dropdown: {
            position: "absolute", bottom: "calc(100% + 6px)", left: 0,
            width: 280, maxHeight: 220, overflowY: "auto",
            background: C.dropBg, border: `1px solid ${C.dropBdr}`,
            borderRadius: 14, zIndex: 500,
            boxShadow: "0 -10px 30px rgba(0,0,0,.4)",
        },
        searchRow: {
            padding: "10px 12px", position: "sticky", top: 0,
            background: C.dropBg, borderBottom: `1px solid ${C.dropBdr}`,
        },
        searchInput: {
            width: "100%", background: C.srchBg,
            border: `1px solid ${C.dropBdr}`, borderRadius: 10,
            padding: "7px 12px", color: C.text, fontSize: 13, outline: "none",
        },
        countryRow: (hovered) => ({
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 16px", cursor: "pointer", fontSize: 13,
            background: hovered ? "rgba(6,182,212,.12)" : "transparent",
            transition: "background .15s",
        }),
        overlayTitle: {
            fontSize: 36, fontWeight: 800, color: "#fff", marginBottom: 16,
            letterSpacing: -1, lineHeight: 1.1,
        },
        overlayText: {
            fontSize: 14, color: "rgba(255,255,255,.85)", lineHeight: 1.7, marginBottom: 32,
        },
        overlayBtn: {
            background: "rgba(255,255,255,.12)", backdropFilter: "blur(12px)",
            border: "2px solid rgba(255,255,255,.5)", color: "#fff",
            padding: "12px 48px", borderRadius: 50, fontWeight: 700, fontSize: 15,
            cursor: "pointer", transition: "all .3s", letterSpacing: 0.3,
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
        appDownloadCard: {
            position: "absolute",
            right: isMobile ? 12 : 20,
            bottom: isMobile ? 68 : 20,
            width: isMobile ? "calc(100% - 24px)" : 320,
            zIndex: 140,
            padding: "16px 16px 18px",
            borderRadius: 22,
            background: dark
                ? "linear-gradient(180deg, rgba(10,18,44,.94), rgba(15,28,63,.92))"
                : "linear-gradient(180deg, rgba(255,255,255,.96), rgba(240,247,255,.94))",
            border: dark ? "1px solid rgba(79, 142, 255, .22)" : "1px solid rgba(37,99,235,.18)",
            backdropFilter: "blur(12px)",
            boxShadow: dark ? "0 20px 44px rgba(0,0,0,.34)" : "0 20px 44px rgba(37,99,235,.16)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
        },
        appDownloadTitle: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 16,
            fontWeight: 800,
            color: C.text,
        },
        appDownloadBadge: {
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            padding: "6px 10px",
            borderRadius: 999,
            background: dark ? "rgba(34,211,238,.12)" : "rgba(37,99,235,.08)",
            border: dark ? "1px solid rgba(34,211,238,.18)" : "1px solid rgba(37,99,235,.14)",
            color: dark ? "#67e8f9" : "#1d4ed8",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.4,
            textTransform: "uppercase",
        },
        appDownloadText: {
            fontSize: 12.5,
            lineHeight: 1.6,
            color: C.muted,
        },
        appDownloadMeta: {
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
        },
        appDownloadMetaCard: {
            padding: "10px 12px",
            borderRadius: 14,
            background: dark ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.72)",
            border: dark ? "1px solid rgba(255,255,255,.06)" : "1px solid rgba(37,99,235,.08)",
        },
        appDownloadMetaLabel: {
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: dark ? "rgba(125,211,252,.9)" : "#2563eb",
            marginBottom: 4,
        },
        appDownloadMetaValue: {
            fontSize: 12.5,
            lineHeight: 1.45,
            color: C.text,
            fontWeight: 600,
        },
        appDownloadBtn: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            height: 52,
            borderRadius: 16,
            border: "none",
            background: "linear-gradient(135deg, #22d3ee 0%, #2563eb 58%, #1d4ed8 100%)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            textDecoration: "none",
            boxShadow: "0 14px 28px rgba(37,99,235,.34), inset 0 1px 0 rgba(255,255,255,.22)",
            letterSpacing: 0.2,
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

    // ── SUCCESS state ──
    if (success) return (
        <div style={{ ...S.shell, flexDirection: "column", gap: 20 }}>
            <div style={{ ...S.orb1 }} />
            <div style={{ ...S.orb2 }} />
            <div style={{ ...S.gridBg }} />
            <div style={{ textAlign: "center", zIndex: 10, maxWidth: 440, background: "rgba(7,14,40,.85)", padding: "48px 40px", borderRadius: 28, border: "1px solid rgba(255,255,255,.07)", backdropFilter: "blur(24px)" }}>
                <div style={{ fontSize: 64, marginBottom: 20 }}>✅</div>
                <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginBottom: 14 }}>¡Cuenta creada con éxito!</h2>
                <p style={{ color: "rgba(200,215,245,.7)", lineHeight: 1.7, marginBottom: 20, fontSize: 15 }}>
                    Tu cuenta está <strong style={{ color: "#06b6d4" }}>pendiente de aprobación</strong>.<br />
                    Espera a que un administrador la active.
                </p>
                <button onClick={() => { setSuccess(false); setIsRegister(false); navigate("/"); }}
                    style={{ background: "none", border: "none", color: "rgba(200,215,245,.5)", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>
                    Volver al inicio de sesión
                </button>
            </div>
        </div>
    );

    return (
        <div style={S.shell}>
            <div style={S.orb1} /><div style={S.orb2} /><div style={S.gridBg} />

            {/* Theme toggle */}
            <motion.button style={S.themeBtn} whileHover={{ scale: 1.08 }} onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </motion.button>

            {/* Main card */}
            <div style={S.container}>

                {/* ── LOGIN FORM ── */}
                <div style={S.formSide(isRegister)}>
                    {/* Logo */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
                        <StreamingBoxLogo
                            size={40}
                            showText={true}
                            onDark={dark}
                            textColor={C.text}
                            subtitle="Bienvenido de nuevo"
                        />
                    </div>

                    <h2 style={S.heading}>Iniciar Sesión</h2>
                    <form onSubmit={handleLogin}>
                        <label style={S.label}>
                            Email
                            <input style={S.input} type="email" placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} onFocus={e => (e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={e => (e.target.style.boxShadow = "none")} required />
                        </label>
                        <label style={S.label}>
                            Contraseña
                            <div style={S.relativeWrap}>
                                <input style={{ ...S.input, width: "100%", paddingRight: 44 }} type={showPwd ? "text" : "password"} placeholder="Tu contraseña" value={password} onChange={e => setPassword(e.target.value)} onFocus={e => (e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={e => (e.target.style.boxShadow = "none")} required />
                                <button type="button" style={S.eyeBtn} onClick={() => setShowPwd(!showPwd)}>
                                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </label>
                        <button
                            type="button"
                            style={S.forgotLink}
                            onClick={() => navigate(email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : "/forgot-password")}
                        >
                            Olvidé mi contraseña
                        </button>
                        {error && !isRegister && <div style={S.err}>{error}</div>}
                        {isNativeAndroidApp() && (
                            <label style={S.checkboxRow}>
                                <input
                                    style={S.checkbox}
                                    type="checkbox"
                                    checked={rememberLogin}
                                    onChange={e => setRememberLogin(e.target.checked)}
                                />
                                <span style={S.checkboxText}>Guardar correo en esta app</span>
                            </label>
                        )}
                        <motion.button type="submit" style={S.btn} whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(37,99,235,.45)" }} whileTap={{ scale: .97 }} disabled={loading}>
                            {loading ? "Cargando..." : "Ingresar"}
                        </motion.button>
                        {isMobile && (
                            <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: C.muted }}>
                                ¿No tienes cuenta?{" "}
                                <span onClick={toggle} style={{ color: "#0ea5e9", fontWeight: 700, cursor: "pointer" }}>Regístrate</span>
                            </div>
                        )}
                    </form>
                </div>

                {/* ── REGISTER FORM ── */}
                <div style={S.regSide(isRegister)}>
                    <h2 style={{ ...S.heading, marginBottom: 24 }}>Crear Cuenta</h2>
                    <form onSubmit={handleRegister}>
                        <label style={S.label}>
                            Nombre Completo
                            <input style={S.input} type="text" placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} onFocus={e => (e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={e => (e.target.style.boxShadow = "none")} required />
                        </label>
                        <label style={S.label}>
                            Email
                            <input style={S.input} type="email" placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} onFocus={e => (e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={e => (e.target.style.boxShadow = "none")} required />
                        </label>
                        <label style={S.label}>
                            Contraseña
                            <div style={S.relativeWrap}>
                                <input style={{ ...S.input, width: "100%", paddingRight: 44 }} type={showPwd ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={password} onChange={e => setPassword(e.target.value)} onFocus={e => (e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={e => (e.target.style.boxShadow = "none")} required />
                                <button type="button" style={S.eyeBtn} onClick={() => setShowPwd(!showPwd)}>
                                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </label>
                        <label style={S.label}>
                            Confirmar Contraseña
                            <div style={S.relativeWrap}>
                                <input style={{ ...S.input, width: "100%", paddingRight: 44 }} type={showConfirm ? "text" : "password"} placeholder="Repite tu contraseña" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onFocus={e => (e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={e => (e.target.style.boxShadow = "none")} required />
                                <button type="button" style={S.eyeBtn} onClick={() => setShowConfirm(!showConfirm)}>
                                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </label>
                        <label style={S.checkboxRow}>
                            <input
                                style={S.checkbox}
                                type="checkbox"
                                checked={acceptedTerms}
                                onChange={(e) => setAcceptedTerms(e.target.checked)}
                            />
                            <span style={S.checkboxText}>
                                Acepto los{" "}
                                <button className="tos-link" style={S.legalLink} type="button" onClick={() => setShowTerms(true)}>
                                    Términos y Condiciones
                                </button>
                            </span>
                        </label>
                        {error && isRegister && <div style={S.err}>{error}</div>}
                        <motion.button type="submit" style={S.btn} whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(37,99,235,.45)" }} whileTap={{ scale: .97 }} disabled={loading}>
                            {loading ? "Creando cuenta..." : "Registrarse"}
                        </motion.button>
                        {isMobile && (
                            <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: C.muted }}>
                                ¿Ya tienes cuenta?{" "}
                                <span onClick={toggle} style={{ color: "#0ea5e9", fontWeight: 700, cursor: "pointer" }}>Inicia Sesión</span>
                            </div>
                        )}
                    </form>
                </div>

                {/* ── SLIDING OVERLAY PANEL ── */}
                <div style={S.overlay(isRegister)}>
                    {/* Overlay glow */}
                    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 50%, rgba(255,255,255,.12), transparent 70%)", pointerEvents: "none" }} />
                    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        {/* Logo en el panel azul convertido en "marca" principal */}
                        <StreamingBoxLogo
                            size={120}
                            showText={false}
                            onDark={true}
                            style={{ 
                                marginBottom: 40,
                                filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.3))" 
                            }}
                        />

                        {!isRegister ? (
                            <>
                                <div style={S.overlayTitle}>¡BIENVENIDO!</div>
                                <p style={S.overlayText}>
                                    ¿No tienes cuenta?<br />Regístrate y comienza a disfrutar de Streaming Box.
                                </p>
                                <motion.button style={S.overlayBtn} whileHover={{ background: "rgba(255,255,255,.25)", transform: "translateY(-2px)" }} onClick={toggle}>
                                    Regístrate
                                </motion.button>
                            </>
                        ) : (
                            <>
                                <div style={S.overlayTitle}>¡DE VUELTA!</div>
                                <p style={S.overlayText}>
                                    ¿Ya tienes cuenta?<br />Inicia sesión para continuar con tu experiencia.
                                </p>
                                <motion.button style={S.overlayBtn} whileHover={{ background: "rgba(255,255,255,.25)", transform: "translateY(-2px)" }} onClick={toggle}>
                                    Ingresar
                                </motion.button>
                            </>
                        )}
                    </div>
                </div>

            </div>

            <div style={S.legalBar}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#06b6d4", boxShadow: "0 0 10px rgba(6,182,212,.7)" }} />
                © Streaming Box 2026
                <span className="tos-sep">·</span>
                <button className="tos-link" style={S.legalLink} type="button" onClick={() => setShowTerms(true)}>
                    Términos y Condiciones
                </button>
            </div>
            <AnimatePresence>
                {showTerms && (
                    <motion.div
                        className="tos-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowTerms(false)}
                    >
                        <motion.div
                            className="tos-modal"
                            initial={{ opacity: 0, scale: 0.92, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 16 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="tos-header">
                                <h2>Términos y Condiciones</h2>
                                <motion.button
                                    className="tos-close"
                                    type="button"
                                    onClick={() => setShowTerms(false)}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                >
                                    <X size={20} />
                                </motion.button>
                            </div>
                            <div className="tos-body">
                                <p><strong>1. Aceptación de los Términos</strong><br />
                                    Al registrarte o usar Streaming Box aceptas estos Términos y Condiciones. Si no estás de acuerdo, no debes usar la plataforma.</p>
                                <p><strong>2. Objeto del Servicio</strong><br />
                                    Streaming Box es una plataforma privada para gestionar y comercializar accesos digitales, pedidos y saldos internos para usuarios autorizados.</p>
                                <p><strong>3. Requisitos de Uso</strong><br />
                                    Debes proporcionar información veraz, mantener tus datos actualizados y resguardar tus credenciales. Eres responsable de toda actividad realizada desde tu cuenta.</p>
                                <p><strong>4. Uso Prohibido</strong><br />
                                    Queda prohibido compartir accesos, revender sin autorización, automatizar consultas mediante scraping o bots, vulnerar la seguridad de la plataforma o usarla para fines ilícitos.</p>
                                <p><strong>5. Pagos, Saldos y Reembolsos</strong><br />
                                    Los saldos acreditados en wallet se consideran consumibles dentro de la plataforma. Salvo obligación legal o falla comprobable del servicio, las compras son finales y no reembolsables.</p>
                                <p><strong>6. Disponibilidad y Servicios de Terceros</strong><br />
                                    Algunas prestaciones dependen de proveedores externos. Streaming Box no garantiza continuidad absoluta ni responde por cambios, bloqueos o interrupciones causadas por terceros.</p>
                                <p><strong>7. Suspensión o Cierre de Cuenta</strong><br />
                                    Podemos limitar, suspender o cerrar cuentas por incumplimientos, actividad sospechosa, fraude o riesgos de seguridad, sin perjuicio de acciones adicionales que correspondan.</p>
                                <p><strong>8. Limitación de Responsabilidad</strong><br />
                                    En la máxima medida permitida por la ley, Streaming Box no será responsable por daños indirectos, incidentales o lucro cesante derivados del uso o imposibilidad de uso de la plataforma.</p>
                                <p><strong>9. Privacidad y Datos Personales</strong><br />
                                    Tratamos tus datos para operación, soporte, seguridad y cumplimiento. Al usar la plataforma aceptas este tratamiento conforme a la normativa aplicable.</p>
                                <p><strong>10. Modificaciones, Ley Aplicable y Jurisdicción</strong><br />
                                    Podemos actualizar estos términos en cualquier momento. La versión vigente será la publicada en la plataforma. Cualquier controversia se regirá por la ley aplicable y la jurisdicción competente del domicilio del operador.</p>
                                <p className="tos-legal">Última actualización: 11 de marzo de 2026.<br />
                                    © 2026 Streaming Box. Todos los derechos reservados. Plataforma desarrollada y operada de forma privada.</p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}


