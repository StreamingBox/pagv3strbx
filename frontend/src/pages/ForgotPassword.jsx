import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import StandaloneAuthLayout from "../components/auth/StandaloneAuthLayout.jsx";
import { apiPost } from "../api/api.js";

export default function ForgotPassword() {
    const [params] = useSearchParams();
    const [email, setEmail] = useState(() => params.get("email") || "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const styles = useMemo(() => ({
        label: {
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 24,
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
            marginTop: 16,
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
        back: {
            color: "#60a5fa",
            textDecoration: "none",
            fontWeight: 600,
        },
    }), []);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setSuccess("");

        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            setError("Ingresa un email válido.");
            return;
        }

        setLoading(true);
        try {
            const res = await apiPost("/auth/forgot-password", { email: normalizedEmail });
            if (!res.ok) throw new Error(res.data?.message || "No fue posible enviar el enlace.");
            setSuccess(res.data?.message || "Si el correo existe, te enviamos un enlace.");
        } catch (err) {
            setError(err.message || "No fue posible enviar el enlace.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <StandaloneAuthLayout
            title="Recuperar contraseña"
            subtitle="Te enviaremos un enlace seguro para restablecer el acceso a tu cuenta."
            footer={<Link to="/" style={styles.back}>Volver al inicio de sesión</Link>}
        >
            <form onSubmit={handleSubmit}>
                <label style={styles.label}>
                    Email
                    <input
                        style={styles.input}
                        type="email"
                        placeholder="tu@correo.com"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </label>

                <p style={styles.helper}>
                    Si el correo existe en la plataforma, recibirás un enlace válido por tiempo limitado.
                </p>

                {error ? <div style={styles.alert("error")}>{error}</div> : null}
                {success ? <div style={styles.alert("success")}>{success}</div> : null}

                <button type="submit" style={styles.button} disabled={loading}>
                    {loading ? "Enviando..." : "Enviar enlace"}
                </button>
            </form>
        </StandaloneAuthLayout>
    );
}
