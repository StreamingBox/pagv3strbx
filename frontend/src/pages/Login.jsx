import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Eye, EyeOff } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = `${API_BASE}/branding/logo`;

export default function Login() {
    const navigate = useNavigate();
    const { setUser } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [logoOk, setLogoOk] = useState(true);

    // ✅ Limpia cualquier rastro legacy al abrir Login (tokens + user)
    useEffect(() => {
        try {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
        } catch { }
    }, []);

    const canSubmit = useMemo(() => {
        return email.trim().length > 3 && password.length >= 1 && !loading;
    }, [email, password, loading]);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                credentials: "include", // ✅ cookies HttpOnly
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data?.message || "No se pudo iniciar sesión.");
            }

            // ✅ Guardamos el user SOLO en memoria (AuthContext), NO en localStorage
            setUser(data?.user || null);

            // ✅ Limpieza extra por si queda algo viejo
            try {
                localStorage.removeItem("accessToken");
                localStorage.removeItem("refreshToken");
                localStorage.removeItem("user");
            } catch { }

            // ✅ Redirección sin recargar
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

            <div className="card">
                <div className="brand">
                    {logoOk ? (
                        <img
                            className="brand-logo-img"
                            src={LOGO_URL}
                            alt="Logo"
                            onError={() => setLogoOk(false)}
                        />
                    ) : (
                        <div className="logo">
                            <div className="logo-core" />
                            <div className="logo-ring" />
                            <div className="logo-ring ring-2" />
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
                            autoComplete="email"
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
                                autoComplete="current-password"
                                placeholder="Pon tu contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ paddingRight: "40px" }}
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
                                    padding: "0"
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </label>

                    {error ? <div className="error">{error}</div> : null}

                    <button className="btn" disabled={!canSubmit}>
                        {loading ? "Ingresando..." : "Iniciar sesión"}
                    </button>

                    <div className="hint">
                        * Usuario creado por admin. Si no tienes acceso, contacta al administrador.
                    </div>
                </form>
            </div>

            <div className="footer">
                <span className="dot" /> Azul neón / Dark UI
            </div>
        </div>
    );
}
