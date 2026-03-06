import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Sun, Moon } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = "/api/branding/logo";
const WA_NUMBER = "573152485340";

function getInitialTheme() {
    try { return localStorage.getItem("sb-theme") || "dark"; } catch { return "dark"; }
}

export default function Register() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [logoOk, setLogoOk] = useState(true);
    const [theme, setTheme] = useState(getInitialTheme);

    const [country, setCountry] = useState({ code: "+57", flag: "🇨🇴", name: "Colombia" });
    const [showCountries, setShowCountries] = useState(false);

    const countries = [
        { code: "+57", flag: "🇨🇴", name: "Colombia" },
        { code: "+58", flag: "🇻🇪", name: "Venezuela" },
        { code: "+52", flag: "🇲🇽", name: "México" },
        { code: "+593", flag: "🇪🇨", name: "Ecuador" },
        { code: "+51", flag: "🇵🇪", name: "Perú" },
        { code: "+56", flag: "🇨🇱", name: "Chile" },
        { code: "+54", flag: "🇦🇷", name: "Argentina" },
        { code: "+507", flag: "🇵🇦", name: "Panamá" },
        { code: "+34", flag: "🇪🇸", name: "España" },
        { code: "+1", flag: "🇺🇸", name: "USA" },
    ];

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem("sb-theme", theme); } catch { }
    }, [theme]);

    const canSubmit = name.trim().length > 1 && email.trim().length > 3 && phone.trim().length > 5 && password.length >= 8 && !loading;

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        if (password.length < 8) {
            setError("La contraseña debe tener al menos 8 caracteres.");
            return;
        }

        setLoading(true);
        try {
            const fullPhone = `${country.code}${phone.replace(/\D/g, "")}`;
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password, phone: fullPhone }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "No se pudo crear la cuenta.");
            setSuccess(true);
        } catch (err) {
            setError(err?.message || "Error al crear la cuenta.");
        } finally {
            setLoading(false);
        }
    }

    const waText = encodeURIComponent(
        `Hola! Acabo de registrarme en Streaming Box con el correo ${email} y quiero activar mi cuenta.`
    );
    const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

    return (
        <div className="auth-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            {/* Theme Toggle */}
            <motion.button
                className="theme-toggle-float"
                onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                aria-label="Toggle tema"
            >
                {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </motion.button>

            <motion.div
                className="card"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
                <AnimatePresence mode="wait">
                    {success ? (
                        /* ── SUCCESS STATE ── */
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            style={{ textAlign: "center", padding: "12px 0" }}
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                                style={{ fontSize: 56, marginBottom: 16 }}
                            >
                                ✅
                            </motion.div>
                            <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "var(--text)" }}>
                                ¡Cuenta creada con éxito!
                            </h2>
                            <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
                                Tu cuenta está <strong style={{ color: "var(--text)" }}>pendiente de aprobación</strong>.<br />
                                Escríbenos por WhatsApp para activarla y empezar a disfrutar de Streaming Box.
                            </p>

                            {/* WhatsApp Button */}
                            <motion.a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                whileHover={{ scale: 1.03, y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 10,
                                    width: "100%",
                                    padding: "14px 0",
                                    background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                                    color: "#fff",
                                    fontWeight: 800,
                                    fontSize: 15,
                                    borderRadius: 14,
                                    textDecoration: "none",
                                    boxShadow: "0 6px 24px rgba(37,211,102,0.35)",
                                    marginBottom: 14,
                                }}
                            >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                    <path d="M12.004 2C6.477 2 2 6.478 2 12.004c0 1.944.526 3.764 1.44 5.321L2 22l4.802-1.414C8.285 21.486 10.1 22 12.004 22 17.523 22 22 17.522 22 11.996 22 6.478 17.523 2 12.004 2zm0 18.155a9.13 9.13 0 01-4.854-1.39l-.348-.207-3.585 1.057 1.001-3.522-.227-.36A9.13 9.13 0 012.845 12c0-5.06 4.1-9.155 9.159-9.155 5.055 0 9.151 4.095 9.151 9.155 0 5.055-4.096 9.155-9.151 9.155z"/>
                                </svg>
                                Contactar por WhatsApp
                            </motion.a>

                            <button
                                onClick={() => navigate("/")}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--muted)",
                                    fontSize: 13,
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                    padding: 4,
                                }}
                            >
                                Volver al inicio de sesión
                            </button>
                        </motion.div>
                    ) : (
                        /* ── FORM STATE ── */
                        <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <div className="brand">
                                {logoOk ? (
                                    <motion.img
                                        src={LOGO_URL}
                                        alt="Logo"
                                        className="brand-logo-img"
                                        onError={() => setLogoOk(false)}
                                        animate={{ y: [0, -4, 0] }}
                                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                ) : (
                                    <div className="logo">
                                        <div className="logo-ring" />
                                        <div className="logo-ring ring-2" />
                                        <div className="logo-core" />
                                    </div>
                                )}
                                <div>
                                    <div className="title">Streaming Box</div>
                                    <div className="subtitle">Crea tu cuenta</div>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="form">
                                <label className="label">
                                    Nombre completo
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder="Tu nombre"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        autoComplete="name"
                                    />
                                </label>

                                <label className="label">
                                    Email
                                    <input
                                        className="input"
                                        type="email"
                                        placeholder="tu@correo.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                    />
                                </label>

                                <label className="label">
                                    WhatsApp
                                    <div style={{ display: "flex", gap: "8px", position: "relative" }}>
                                        <div 
                                            onClick={() => setShowCountries(!showCountries)}
                                            style={{
                                                display: "flex", alignItems: "center", gap: "6px",
                                                background: "var(--input-bg)", border: "1px solid var(--stroke)",
                                                borderRadius: "12px", padding: "0 12px", cursor: "pointer",
                                                height: "44px", minWidth: "85px", fontSize: "14px"
                                            }}
                                        >
                                            <span style={{ fontSize: "18px" }}>{country.flag}</span>
                                            <span>{country.code}</span>
                                        </div>

                                        {showCountries && (
                                            <div style={{
                                                position: "absolute", top: "100%", left: 0, zIndex: 100,
                                                background: "var(--bg0)", border: "1px solid var(--stroke)",
                                                borderRadius: "12px", width: "100%", maxHeight: "200px",
                                                overflowY: "auto", marginTop: "4px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
                                            }}>
                                                {countries.map(c => (
                                                    <div 
                                                        key={c.code}
                                                        onClick={() => { setCountry(c); setShowCountries(false); }}
                                                        style={{
                                                            padding: "10px 14px", display: "flex", alignItems: "center",
                                                            gap: "10px", cursor: "pointer", borderBottom: "1px solid var(--stroke-light)"
                                                        }}
                                                        className="country-item-hover"
                                                    >
                                                        <span style={{ fontSize: "18px" }}>{c.flag}</span>
                                                        <span style={{ color: "var(--text)", fontSize: "14px" }}>{c.name}</span>
                                                        <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "12px" }}>{c.code}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <input
                                            className="input"
                                            type="text"
                                            placeholder="Número (ej: 315...)"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                                            autoComplete="tel"
                                            style={{ flex: 1 }}
                                        />
                                    </div>
                                </label>

                                <label className="label">
                                    Contraseña
                                    <div style={{ position: "relative" }}>
                                        <input
                                            className="input"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Mínimo 8 caracteres"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            style={{ paddingRight: "46px" }}
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </label>

                                <label className="label">
                                    Confirmar contraseña
                                    <div style={{ position: "relative" }}>
                                        <input
                                            className="input"
                                            type={showConfirm ? "text" : "password"}
                                            placeholder="Repite tu contraseña"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            style={{ paddingRight: "46px" }}
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
                                        >
                                            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </label>

                                <AnimatePresence>
                                    {error && (
                                        <motion.div
                                            className="error"
                                            initial={{ opacity: 0, height: 0, y: -8 }}
                                            animate={{ opacity: 1, height: "auto", y: 0 }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            {error}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div style={{ marginTop: "10px" }}>
                                    <motion.button
                                        className="btn"
                                        type="submit"
                                        style={{ width: "100%" }}
                                        disabled={!canSubmit}
                                        whileHover={canSubmit ? { scale: 1.02, y: -2 } : {}}
                                        whileTap={canSubmit ? { scale: 0.97 } : {}}
                                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                    >
                                        {loading ? (
                                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                                <motion.span
                                                    animate={{ rotate: 360 }}
                                                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                                                    style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "white", borderRadius: "50%" }}
                                                />
                                                Creando cuenta...
                                            </span>
                                        ) : "Crear cuenta"}
                                    </motion.button>
                                </div>

                                <div style={{ textAlign: "center", marginTop: "14px", fontSize: 13, color: "var(--muted)" }}>
                                    ¿Ya tienes cuenta?{" "}
                                    <button
                                        type="button"
                                        onClick={() => navigate("/")}
                                        style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0 }}
                                    >
                                        Inicia sesión
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            <div className="footer">
                <span className="dot" />
                © Streaming Box 2026
            </div>
        </div>
    );
}
