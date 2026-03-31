import { useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export default function Login() {
    const [email, setEmail] = useState("admin@pagv2strbx.com");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data?.message || "No se pudo iniciar sesión.");
            }

            // Guardar tokens
            localStorage.setItem("accessToken", data.accessToken);
            localStorage.setItem("refreshToken", data.refreshToken);
            localStorage.setItem("user", JSON.stringify(data.user));

            // Redirección simple por rol
            if (data?.user?.role === "admin") {
                window.location.href = "/admin";
            } else {
                window.location.href = "/dashboard";
            }
        } catch (err) {
            setError(err.message || "Error al iniciar sesión.");
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
                    <div className="logo">
                        <div className="logo-core" />
                        <div className="logo-ring" />
                        <div className="logo-ring ring-2" />
                    </div>
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
                            placeholder="correo@dominio.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </label>

                    <label className="label">
                        Contraseña
                        <input
                            className="input"
                            type="password"
                            autoComplete="current-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
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
