import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import StandaloneAuthLayout from "../components/auth/StandaloneAuthLayout.jsx";
import { apiGet, apiPost } from "../api/api.js";

export default function ResetPassword() {
    const [params] = useSearchParams();
    const token = params.get("token") || "";

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [validating, setValidating] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const styles = useMemo(() => ({
        label: {
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 18,
            fontSize: 13,
            color: "var(--muted)",
        },
        input: {
            width: "100%",
            height: 50,
            borderRadius: 14,
            border: "1px solid rgba(59,130,246,.22)",
            background: "var(--input-bg, rgba(0,0,0,.18))",
            color: "var(--text)",
            padding: "0 16px",
            outline: "none",
            fontSize: 15,
        },
        button: {
            width: "100%",
            height: 50,
            border: "none",
            borderRadius: 14,
            marginTop: 18,
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
        },
        alert: (kind) => ({
            marginTop: 16,
            borderRadius: 14,
            padding: "12px 14px",
            fontSize: 13,
            lineHeight: 1.6,
            border: kind === "error"
                ? "1px solid rgba(239,68,68,.28)"
                : "1px solid rgba(34,197,94,.24)",
            background: kind === "error"
                ? "rgba(239,68,68,.12)"
                : "rgba(34,197,94,.12)",
            color: kind === "error" ? "#fecaca" : "#bbf7d0",
        }),
        helper: {
            marginTop: 12,
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--muted)",
        },
        link: {
            color: "#60a5fa",
            textDecoration: "none",
            fontWeight: 600,
        },
    }), []);

    useEffect(() => {
        let cancelled = false;

        async function validateToken() {
            if (!token) {
                setError("El enlace de recuperación no es válido.");
                setTokenValid(false);
                setValidating(false);
                return;
            }

            setValidating(true);
            setError("");
            try {
                const res = await apiGet(`/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
                if (!res.ok) throw new Error(res.data?.message || "El enlace expiró o no es válido.");
                if (!cancelled) {
                    setTokenValid(true);
                }
            } catch (err) {
                if (!cancelled) {
                    setTokenValid(false);
                    setError(err.message || "El enlace expiró o no es válido.");
                }
            } finally {
                if (!cancelled) {
                    setValidating(false);
                }
            }
        }

        validateToken();
        return () => {
            cancelled = true;
        };
    }, [token]);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (password.length < 8) {
            setError("La contraseña debe tener al menos 8 caracteres.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }

        setLoading(true);
        try {
            const res = await apiPost("/auth/reset-password", { token, password });
            if (!res.ok) throw new Error(res.data?.message || "No fue posible actualizar la contraseña.");
            setSuccess(res.data?.message || "Contraseña actualizada.");
            setTokenValid(false);
            setPassword("");
            setConfirmPassword("");
        } catch (err) {
            setError(err.message || "No fue posible actualizar la contraseña.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandaloneAuthLayout
            title="Nueva contraseña"
            subtitle="Define una contraseña nueva para volver a entrar a tu cuenta."
            footer={<Link to="/" style={styles.link}>Volver al inicio de sesión</Link>}
        >
            {validating ? (
                <p style={styles.helper}>Validando enlace de recuperación...</p>
            ) : null}

            {!validating && error ? <div style={styles.alert("error")}>{error}</div> : null}
            {success ? <div style={styles.alert("success")}>{success}</div> : null}

            {!validating && tokenValid ? (
                <form onSubmit={handleSubmit}>
                    <label style={styles.label}>
                        Nueva contraseña
                        <input
                            style={styles.input}
                            type="password"
                            autoComplete="new-password"
                            placeholder="Mínimo 8 caracteres"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </label>

                    <label style={styles.label}>
                        Confirmar contraseña
                        <input
                            style={styles.input}
                            type="password"
                            autoComplete="new-password"
                            placeholder="Repite la contraseña"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </label>

                    <p style={styles.helper}>
                        Al cambiarla, se cerrarán las sesiones activas y tendrás que iniciar sesión otra vez.
                    </p>

                    <button type="submit" style={styles.button} disabled={loading}>
                        {loading ? "Actualizando..." : "Guardar nueva contraseña"}
                    </button>
                </form>
            ) : null}
        </StandaloneAuthLayout>
    );
}
