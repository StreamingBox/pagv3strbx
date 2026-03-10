import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Sun, Moon } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { countries } from "../utils/countries";
import StreamingBoxLogo from "../components/StreamingBoxLogo.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = "/api/branding/logo";
const WA_NUMBER = "573152485340";

function getTheme() {
    try { return localStorage.getItem("sb-theme") || "dark"; } catch { return "dark"; }
}

// Convierte emoji de bandera en URL de imagen (Windows no renderiza emoji de banderas)
function flagUrl(flagEmoji) {
    try {
        const pts = [...flagEmoji].map(c => c.codePointAt(0));
        const iso = pts.map(cp => String.fromCharCode(cp - 0x1F1E6 + 97)).join("");
        return `https://flagcdn.com/20x15/${iso}.png`;
    } catch { return ""; }
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
    const [logoOk, setLogoOk] = useState(true);
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
    const [phone, setPhone] = useState("");
    const [showPwd, setShowPwd] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Country
    const [country, setCountry] = useState({ code: "+57", flag: "🇨🇴", name: "Colombia" });
    const [showCountries, setShowCountries] = useState(false);
    const [countrySearch, setCountrySearch] = useState("");
    const countryRef = useRef(null);

    const filteredCountries = useMemo(() => {
        const s = countrySearch.toLowerCase();
        return countries.filter(c => c.name.toLowerCase().includes(s) || c.code.includes(s));
    }, [countrySearch]);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem("sb-theme", theme); } catch { }
    }, [theme]);

    useEffect(() => {
        setIsRegister(location.pathname === "/register");
        setError("");
    }, [location.pathname]);

    // Close countries on outside click
    useEffect(() => {
        const handler = (e) => {
            if (countryRef.current && !countryRef.current.contains(e.target)) {
                setShowCountries(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const toggle = () => {
        setError("");
        const next = !isRegister;
        setIsRegister(next);
        navigate(next ? "/register" : "/");
    };

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
        setLoading(true);
        try {
            const fullPhone = `${country.code}${phone.replace(/\D/g, "")}`;
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password, phone: fullPhone }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "Error al crear cuenta.");
            setSuccess(true);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    }

    const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hola! Me registré en Streaming Box con el correo ${email} y quiero activar mi cuenta.`)}`;

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
            height: isMobile ? "auto" : 600,
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
            padding: "36px 52px", overflowY: "auto",
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
            display: "flex", flexDirection: "column", gap: 6, marginBottom: isMobile ? 12 : 14,
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
    };

    const [hoveredCountry, setHoveredCountry] = useState(null);

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
                    Escríbenos por WhatsApp para activarla.
                </p>

                {/* Número de WhatsApp visible */}
                <div style={{ background: "rgba(37,211,102,.08)", border: "1px solid rgba(37,211,102,.25)", borderRadius: 14, padding: "12px 18px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>📱</span>
                    <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#25d366", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 2 }}>Número de WhatsApp</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>+57 315 248 5340</div>
                    </div>
                </div>
                <motion.a href={`https://wa.me/${WA_NUMBER}?text=Hola%2C%20acabo%20de%20registrarme%20y%20necesito%20activar%20mi%20cuenta.`} target="_blank" rel="noreferrer" whileHover={{ scale: 1.03, y: -2 }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "linear-gradient(135deg,#25d366,#128c7e)", color: "#fff", padding: "14px 28px", borderRadius: 16, textDecoration: "none", fontWeight: 700, fontSize: 16, marginBottom: 16, boxShadow: "0 6px 24px rgba(37,211,102,.3)" }}>
                    <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/><path d="M12.004 2C6.477 2 2 6.478 2 12.004c0 1.944.526 3.764 1.44 5.321L2 22l4.802-1.414A9.959 9.959 0 0012.004 22C17.523 22 22 17.522 22 11.996 22 6.478 17.523 2 12.004 2zm0 18.155a9.13 9.13 0 01-4.854-1.39l-.348-.207-3.585 1.057 1.001-3.522-.227-.36A9.13 9.13 0 012.845 12c0-5.06 4.1-9.155 9.159-9.155 5.055 0 9.151 4.095 9.151 9.155 0 5.055-4.096 9.155-9.151 9.155z"/></svg>
                    Contactar por WhatsApp
                </motion.a>
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
                        {error && !isRegister && <div style={S.err}>{error}</div>}
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
                <div style={{ ...S.regSide(isRegister), padding: "30px 52px", overflowY: "auto" }}>
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
                            WhatsApp
                            <div style={{ position: "relative" }} ref={countryRef}>
                                <div style={S.unifiedInput} className="unified-input">
                                    <button type="button" style={S.countryTrigger} onClick={() => { setShowCountries(v => !v); setCountrySearch(""); }}>
                                        <img src={flagUrl(country.flag)} alt="" style={{ width: 22, height: 16, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} onError={e => e.target.style.display='none'} />
                                        <span style={{ fontSize: 14 }}>{country.code}</span>
                                    </button>
                                    <input style={S.phoneInput} type="text" placeholder="Número (sin indicativo)" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ""))} onFocus={e => (e.target.parentElement.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={e => (e.target.parentElement.style.boxShadow = "none")} required />
                                </div>

                                <AnimatePresence>
                                    {showCountries && (
                                        <motion.div style={S.dropdown} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                                            <div style={S.searchRow}>
                                                <input style={S.searchInput} type="text" placeholder="🔍 Buscar país..." value={countrySearch} onChange={e => setCountrySearch(e.target.value)} autoFocus />
                                            </div>
                                            {filteredCountries.map(c => (
                                                <div key={c.name + c.code}
                                                    style={S.countryRow(hoveredCountry === c.name)}
                                                    onMouseEnter={() => setHoveredCountry(c.name)}
                                                    onMouseLeave={() => setHoveredCountry(null)}
                                                    onClick={() => { setCountry(c); setShowCountries(false); }}>
                                                    <img src={flagUrl(c.flag)} alt="" style={{ width: 20, height: 15, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} onError={e => e.target.style.display='none'} />
                                                    <span style={{ flex: 1, color: C.text }}>{c.name}</span>
                                                    <span style={{ fontSize: 12, color: C.muted }}>{c.code}</span>
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
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

            <div style={{ position: "absolute", bottom: 16, color: C.muted, fontSize: 12, display: "flex", alignItems: "center", gap: 8, zIndex: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#06b6d4", boxShadow: "0 0 10px rgba(6,182,212,.7)" }} />
                © Streaming Box 2026
            </div>
        </div>
    );
}
