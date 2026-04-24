import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Fingerprint } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { apiLogout } from "../../api/api.js";
import {
    authenticateWithBiometrics,
    clearBiometricPreference,
    getBiometricAvailability,
    isBiometricEnabledForUser,
    isNativeAndroidApp,
} from "../../native/biometricAuth.js";

const shellStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
        "radial-gradient(800px 480px at 20% 12%, rgba(37,99,235,.24), transparent 55%), radial-gradient(700px 460px at 88% 85%, rgba(34,211,238,.18), transparent 50%), linear-gradient(180deg, #060b1d 0%, #101936 100%)",
    padding: "24px",
};

const cardStyle = {
    width: "100%",
    maxWidth: "420px",
    padding: "28px 24px",
    borderRadius: "28px",
    background: "linear-gradient(180deg, rgba(10,18,44,.96), rgba(16,25,54,.94))",
    border: "1px solid rgba(96,165,250,.18)",
    boxShadow: "0 28px 56px rgba(0,0,0,.45)",
    color: "#ffffff",
};

const buttonStyle = {
    height: "50px",
    borderRadius: "16px",
    border: "none",
    fontSize: "15px",
    fontWeight: 800,
    cursor: "pointer",
};

export default function BiometricGate({ children }) {
    const { user, setUser, authLoading } = useAuth();
    const [available, setAvailable] = useState(false);
    const [ready, setReady] = useState(false);
    const [locked, setLocked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const promptRef = useRef(false);
    const resumePendingRef = useRef(false);
    const [promptNonce, setPromptNonce] = useState(0);

    const enabledForUser = useMemo(
        () => isBiometricEnabledForUser(user?.id),
        [user?.id]
    );

    useEffect(() => {
        let mounted = true;

        async function checkAvailability() {
            const result = await getBiometricAvailability();
            if (!mounted) return;
            setAvailable(!!result.available);
            setReady(true);
        }

        if (!isNativeAndroidApp()) {
            setReady(true);
            return () => {};
        }

        checkAvailability();
        return () => {
            mounted = false;
        };
    }, []);

    const unlockWithBiometrics = useCallback(async () => {
        if (promptRef.current || busy) return;
        promptRef.current = true;
        setBusy(true);
        setError("");

        const result = await authenticateWithBiometrics({
            title: "Streaming Box",
            subtitle: "Desbloquea tu sesión",
            reason: "Usa tu huella o bloqueo del dispositivo para entrar",
        });

        if (result.ok) {
            setLocked(false);
            setError("");
        } else {
            setLocked(true);
            setError(result.message || "No se pudo validar tu identidad.");
        }

        setBusy(false);
        promptRef.current = false;
    }, [busy]);

    useEffect(() => {
        if (!ready || authLoading) return;

        if (!user?.id || !available || !enabledForUser) {
            setLocked(false);
            return;
        }

        setLocked(true);
        setPromptNonce((value) => value + 1);
    }, [authLoading, available, enabledForUser, ready, user?.id]);

    useEffect(() => {
        if (!locked || !user?.id || !available || !enabledForUser) return;
        unlockWithBiometrics();
    }, [available, enabledForUser, locked, promptNonce, unlockWithBiometrics, user?.id]);

    useEffect(() => {
        if (!ready || !available || !enabledForUser || !user?.id) return;

        function handleVisibility() {
            if (document.hidden) {
                resumePendingRef.current = true;
                return;
            }

            if (!resumePendingRef.current) return;

            resumePendingRef.current = false;
            setLocked(true);
            setPromptNonce((value) => value + 1);
        }

        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [available, enabledForUser, ready, user?.id]);

    async function handleDisableAndLogout() {
        clearBiometricPreference();
        try {
            await apiLogout();
        } catch {
            // ignore logout failures here
        }
        setUser(null);
        setLocked(false);
        window.location.href = "/";
    }

    if (!ready || authLoading || !locked) {
        return children;
    }

    return (
        <div style={shellStyle}>
            <div style={cardStyle}>
                <div
                    style={{
                        width: 60,
                        height: 60,
                        borderRadius: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "linear-gradient(135deg, rgba(34,211,238,.22), rgba(37,99,235,.26))",
                        border: "1px solid rgba(125,211,252,.24)",
                        marginBottom: 18,
                    }}
                >
                    <Fingerprint size={28} color="#67e8f9" />
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Entrada protegida</div>
                <div style={{ color: "rgba(226,232,240,.82)", lineHeight: 1.6, fontSize: 14, marginBottom: 18 }}>
                    Esta app Android tiene acceso biométrico activado. Usa tu huella o el bloqueo del dispositivo para continuar.
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 14px",
                        borderRadius: 16,
                        background: "rgba(255,255,255,.04)",
                        border: "1px solid rgba(255,255,255,.06)",
                        color: "#cbd5e1",
                        fontSize: 13,
                        marginBottom: 18,
                    }}
                >
                    <ShieldCheck size={18} color="#93c5fd" />
                    El desbloqueo biométrico protege esta sesión dentro de la APK.
                </div>
                {error ? (
                    <div
                        style={{
                            marginBottom: 14,
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(248,113,113,.26)",
                            background: "rgba(127,29,29,.25)",
                            color: "#fecaca",
                            fontSize: 13,
                            lineHeight: 1.5,
                        }}
                    >
                        {error}
                    </div>
                ) : null}
                <button
                    type="button"
                    onClick={unlockWithBiometrics}
                    disabled={busy}
                    style={{
                        ...buttonStyle,
                        width: "100%",
                        background: "linear-gradient(135deg, #22d3ee 0%, #2563eb 58%, #1d4ed8 100%)",
                        color: "#fff",
                        boxShadow: "0 16px 32px rgba(37,99,235,.34)",
                        marginBottom: 12,
                    }}
                >
                    {busy ? "Validando..." : "Ingresar con huella"}
                </button>
                <button
                    type="button"
                    onClick={handleDisableAndLogout}
                    style={{
                        ...buttonStyle,
                        width: "100%",
                        background: "rgba(255,255,255,.06)",
                        color: "#cbd5e1",
                        border: "1px solid rgba(255,255,255,.08)",
                    }}
                >
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
}
