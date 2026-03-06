import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { Eye, EyeOff, Sun, Moon, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = "/api/branding/logo";

function getInitialTheme() {
    try { return localStorage.getItem("sb-theme") || "dark"; } catch { return "dark"; }
}

export default function Login() {
    const navigate = useNavigate();
    const { setUser } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [logoOk, setLogoOk] = useState(true);
    const [theme, setTheme] = useState(getInitialTheme);
    const [showTerms, setShowTerms] = useState(false);

    // Apply theme
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem("sb-theme", theme); } catch { }
    }, [theme]);

    // Clean legacy tokens
    useEffect(() => {
        try {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
        } catch { }
    }, []);

    const canSubmit = useMemo(() =>
        email.trim().length > 3 && password.length >= 1 && !loading,
        [email, password, loading]
    );

    async function handleSubmit(e) {
        e.preventDefault();
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
            if (!res.ok) throw new Error(data?.message || "No se pudo iniciar sesión.");
            setUser(data?.user || null);
            try {
                localStorage.removeItem("accessToken");
                localStorage.removeItem("refreshToken");
                localStorage.removeItem("user");
            } catch { }
            const role = String(data?.user?.role || "user").toLowerCase();
            navigate(role === "admin" ? "/admin" : "/dashboard", { replace: true });
        } catch (err) {
            setError(err?.message || "Error al iniciar sesión.");
            setUser(null);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            {/* Theme Toggle — top right */}
            <motion.button
                className="theme-toggle-float"
                onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
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
                            <div className="logo-ring"></div>
                            <div className="logo-ring ring-2"></div>
                            <div className="logo-core"></div>
                        </div>
                    )}
                    <div>
                        <div className="title">Streaming Box</div>
                        <div className="subtitle">Accede a tu plataforma</div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="form">
                    <label className="label">
                        Email
                        <input
                            className="input"
                            type="email"
                            placeholder="Pon tu correo"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </label>

                    <label className="label">
                        Contraseña
                        <div style={{ position: "relative" }}>
                            <input
                                className="input"
                                type={showPassword ? "text" : "password"}
                                placeholder="Pon tu contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ paddingRight: "46px" }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: "absolute",
                                    right: "12px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    color: "var(--muted)",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "4px"
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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

                    <div style={{ marginTop: '10px' }}>
                        <motion.button
                            className="btn"
                            type="submit"
                            style={{ width: '100%' }}
                            disabled={!canSubmit}
                            whileHover={canSubmit ? { scale: 1.02, y: -2 } : {}}
                            whileTap={canSubmit ? { scale: 0.97, y: 0 } : {}}
                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        >
                            {loading ? (
                                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                    <motion.span
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                                        style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "white", borderRadius: "50%" }}
                                    />
                                    Cargando...
                                </span>
                            ) : "Iniciar sesión"}
                        </motion.button>
                    </div>

                    <div style={{ textAlign: "center", marginTop: "14px", fontSize: 13, color: "var(--muted)" }}>
                        ¿No tienes cuenta?{" "}
                        <a href="/register" style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>
                            Regístrate aquí
                        </a>
                    </div>
                </form>

                {/* Footer con T&C */}
                <div className="auth-card-footer">
                    <button className="tos-link" onClick={() => setShowTerms(true)}>
                        Términos y Condiciones
                    </button>
                    <span className="tos-sep">·</span>
                    <span className="tos-copy">Todos los derechos reservados</span>
                </div>
            </motion.div>

            {/* Footer flotante */}
            <div className="footer">
                <span className="dot" />
                © Streaming Box 2026
            </div>

            {/* Modal T&C */}
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
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="tos-header">
                                <h2>Términos y Condiciones</h2>
                                <motion.button
                                    className="tos-close"
                                    onClick={() => setShowTerms(false)}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                >
                                    <X size={20} />
                                </motion.button>
                            </div>
                            <div className="tos-body">
                                <p><strong>1. Uso del Servicio</strong><br />
                                    Streaming Box es una plataforma de gestión y venta de cuentas de servicios de streaming. El acceso está restringido a usuarios autorizados por el administrador.</p>
                                <p><strong>2. Privacidad</strong><br />
                                    Los datos proporcionados son utilizados únicamente con fines operativos. No compartimos información personal con terceros sin consentimiento.</p>
                                <p><strong>3. Responsabilidad</strong><br />
                                    Streaming Box no se hace responsable de interrupciones en los servicios de terceros (Netflix, Disney+, etc.) ni de cambios en sus políticas de uso.</p>
                                <p><strong>4. Pagos y Reembolsos</strong><br />
                                    Los saldos del wallet son no reembolsables una vez acreditados. Las compras de cuentas son definitivas salvo fallo comprobable del servicio.</p>
                                <p><strong>5. Prohibiciones</strong><br />
                                    Está prohibido compartir credenciales de acceso, realizar scraping o cualquier uso no autorizado de la plataforma.</p>
                                <p><strong>6. Modificaciones</strong><br />
                                    Nos reservamos el derecho de modificar estos términos en cualquier momento. El uso continuo implica aceptación de los cambios.</p>
                                <p className="tos-legal">© 2026 Streaming Box. Todos los derechos reservados.<br />
                                    Plataforma desarrollada y operada de forma privada.</p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
