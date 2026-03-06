import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Sun, Moon, User, Mail, Lock, Phone, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { countries } from "../utils/countries";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = "/api/branding/logo";
const WA_NUMBER = "573152485340";

function getInitialTheme() {
    try { return localStorage.getItem("sb-theme") || "dark"; } catch { return "dark"; }
}

export default function Auth() {
    const navigate = useNavigate();
    const location = useLocation();
    const { setUser } = useAuth();
    
    // Switch between login and register based on mount or toggle
    const [isRegister, setIsRegister] = useState(location.pathname === "/register");
    const [theme, setTheme] = useState(getInitialTheme);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // Form states
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [phone, setPhone] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    
    // Country selector states
    const [country, setCountry] = useState({ code: "+57", flag: "🇨🇴", name: "Colombia" });
    const [showCountries, setShowCountries] = useState(false);
    const [countrySearch, setCountrySearch] = useState("");

    const filteredCountries = useMemo(() => {
        const s = countrySearch.toLowerCase().trim();
        return countries.filter(c => 
            c.name.toLowerCase().includes(s) || 
            c.code.includes(s)
        );
    }, [countrySearch]);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem("sb-theme", theme); } catch { }
    }, [theme]);

    useEffect(() => {
        setIsRegister(location.pathname === "/register");
        setError("");
    }, [location.pathname]);

    const handleToggle = () => {
        setError("");
        setIsRegister(!isRegister);
        navigate(!isRegister ? "/register" : "/");
    };

    async function handleLogin(e) {
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
            if (!res.ok) throw new Error(data?.message || "Error al iniciar sesión.");
            setUser(data?.user || null);
            const role = String(data?.user?.role || "user").toLowerCase();
            navigate(role === "admin" ? "/admin" : "/dashboard", { replace: true });
        } catch (err) {
            setError(err?.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        setError("");
        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
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
            if (!res.ok) throw new Error(data?.message || "Error al crear cuenta.");
            setSuccess(true);
        } catch (err) {
            setError(err?.message);
        } finally {
            setLoading(false);
        }
    }

    const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hola! Acabo de registrarme con el correo ${email} y quiero activar mi cuenta.`)}`;

    if (success) {
        return (
            <div className="auth-shell">
                <div className="auth-container" style={{ height: "auto", padding: "40px" }}>
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 60, marginBottom: 20 }}>✅</div>
                        <h2 className="auth-title">¡Registro Exitoso!</h2>
                        <p style={{ color: "var(--muted)", marginBottom: 30 }}>
                            Tu cuenta está en espera. Haz clic abajo para contactar al administrador vía WhatsApp y activarla.
                        </p>
                        <a href={waLink} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0 40px' }}>
                             Contactar WhatsApp
                        </a>
                        <div style={{ marginTop: 20 }}>
                            <button onClick={() => setSuccess(false)} style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', textDecoration: 'underline' }}>Volver</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-shell">
            <div className={`auth-container ${isRegister ? 'active' : ''}`}>
                <div className="auth-card-inner">
                    
                    {/* LOGIN FORM */}
                    <div className="form-box login">
                        <form onSubmit={handleLogin}>
                            <h2 className="auth-title" style={{ color: 'var(--cyan)' }}>Login</h2>
                            
                            <div className="input-group">
                                <input 
                                    type="email" 
                                    className="input-modern" 
                                    placeholder="Email" 
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required 
                                />
                                <Mail className="icon" size={18} />
                            </div>

                            <div className="input-group">
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    className="input-modern" 
                                    placeholder="Contraseña" 
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required 
                                />
                                <Lock className="icon" size={18} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position:'absolute', right: 45, top: '50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}>
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {error && !isRegister && <div className="error">{error}</div>}

                            <button type="submit" className="btn" style={{ width: '100%', marginTop: 10 }} disabled={loading}>
                                {loading ? "Cargando..." : "Sign In"}
                            </button>
                        </form>
                    </div>

                    {/* REGISTER FORM */}
                    <div className="form-box register">
                        <form onSubmit={handleRegister}>
                            <h2 className="auth-title" style={{ color: 'var(--cyan)' }}>Register</h2>
                            
                            <div className="input-group">
                                <input type="text" className="input-modern" placeholder="Nombre Completo" value={name} onChange={e => setName(e.target.value)} required />
                                <User className="icon" size={18} />
                            </div>

                            <div className="input-group">
                                <input type="email" className="input-modern" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
                                <Mail className="icon" size={18} />
                            </div>

                            <div className="input-group" style={{ display: 'flex', gap: 10 }}>
                                <div 
                                    onClick={() => setShowCountries(!showCountries)}
                                    style={{ borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 5, padding: '10px 0', cursor: 'pointer', minWidth: 70 }}
                                >
                                    <span>{country.flag}</span>
                                    <span style={{ fontSize: 13 }}>{country.code}</span>
                                </div>
                                <input 
                                    type="text" 
                                    className="input-modern" 
                                    placeholder="WhatsApp" 
                                    value={phone} 
                                    onChange={e => setPhone(e.target.value.replace(/\D/g, ""))} 
                                    required 
                                    style={{ flex: 1 }}
                                />
                                <Phone className="icon" size={18} />

                                <AnimatePresence>
                                    {showCountries && (
                                        <motion.div 
                                            initial={{ opacity:0, y: 10 }}
                                            animate={{ opacity:1, y: 0 }}
                                            exit={{ opacity:0, y: 10 }}
                                            style={{ position: 'absolute', bottom: '100%', left: 0, width: '100%', background: 'var(--bg0)', border: '1px solid var(--line)', borderRadius: 12, maxHeight: 250, overflowY: 'auto', zIndex: 1000, boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}
                                        >
                                            <div className="country-search-box">
                                                <input 
                                                    type="text" 
                                                    className="country-search-input" 
                                                    placeholder="Buscar país..." 
                                                    value={countrySearch}
                                                    onChange={e => setCountrySearch(e.target.value)}
                                                    autoFocus
                                                />
                                            </div>
                                            {filteredCountries.map(c => (
                                                <div 
                                                    key={c.name + c.code}
                                                    onClick={() => { setCountry(c); setShowCountries(false); }}
                                                    style={{ padding: '10px 15px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}
                                                    className="country-item-hover"
                                                >
                                                    <span>{c.flag}</span>
                                                    <span style={{ flex: 1 }}>{c.name}</span>
                                                    <span style={{ opacity: 0.5 }}>{c.code}</span>
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="input-group">
                                <input type="password" className="input-modern" placeholder="Contraseña (min 8 car.)" value={password} onChange={e => setPassword(e.target.value)} required />
                                <Lock className="icon" size={18} />
                            </div>

                            <div className="input-group">
                                <input type="password" className="input-modern" placeholder="Confirmar Contraseña" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                                <Lock className="icon" size={18} />
                            </div>

                            {error && isRegister && <div className="error">{error}</div>}

                            <button type="submit" className="btn" style={{ width: '100%', marginTop: 5 }} disabled={loading}>
                                {loading ? "Cargando..." : "Sign Up"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* OVERLAY PANEL */}
                <div className="toggle-container">
                    <div className="toggle-panel">
                        <div className="toggle-content toggle-left">
                            <h2 className="auth-title">Welcome Back!</h2>
                            <p className="auth-desc">Para mantenerte conectado con nosotros, inicia sesión con tu cuenta personal.</p>
                            <button className="btn-toggle" onClick={handleToggle}>Sign In</button>
                        </div>
                        <div className="toggle-content toggle-right">
                            <h2 className="auth-title">Welcome!</h2>
                            <p className="auth-desc">Regístrate y comienza tu viaje con Streaming Box hoy mismo.</p>
                            <button className="btn-toggle" onClick={handleToggle}>Sign Up</button>
                        </div>
                    </div>
                </div>

            </div>

            {/* Float Theme Toggle */}
            <motion.button
                className="theme-toggle-float"
                onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                style={{ top: 20, right: 20 }}
            >
                {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </motion.button>
        </div>
    );
}
