import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import StreamingBoxLogo from "../StreamingBoxLogo.jsx";
import TermsModal from "./TermsModal.jsx";

const MotionButton = motion.button;

export default function AuthLayout({
    S,
    theme,
    setTheme,
    isRegister,
    toggle,
    showTerms,
    setShowTerms,
    children,
}) {
    return (
        <div style={S.shell}>
            <div style={S.orb1} />
            <div style={S.orb2} />
            <div style={S.gridBg} />

            <MotionButton
                type="button"
                style={S.themeBtn}
                aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
                title={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
                whileHover={{ scale: 1.08 }}
                onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}
            >
                {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </MotionButton>

            <div style={S.container}>
                {children}

                <div style={S.overlay(isRegister)}>
                    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 50%, rgba(255,255,255,.12), transparent 70%)", pointerEvents: "none" }} />
                    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <StreamingBoxLogo
                            size={120}
                            showText={false}
                            onDark
                            style={{
                                marginBottom: 40,
                                filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.3))",
                            }}
                        />

                        {!isRegister ? (
                            <>
                                <div style={S.overlayTitle}>BIENVENIDO</div>
                                <p style={S.overlayText}>
                                    ¿No tienes cuenta?<br />Regístrate y comienza a disfrutar de Streaming Box.
                                </p>
                                <MotionButton type="button" style={S.overlayBtn} whileHover={{ background: "rgba(255,255,255,.25)", transform: "translateY(-2px)" }} onClick={toggle}>
                                    Regístrate
                                </MotionButton>
                            </>
                        ) : (
                            <>
                                <div style={S.overlayTitle}>DE VUELTA</div>
                                <p style={S.overlayText}>
                                    ¿Ya tienes cuenta?<br />Inicia sesión para continuar con tu experiencia.
                                </p>
                                <MotionButton type="button" style={S.overlayBtn} whileHover={{ background: "rgba(255,255,255,.25)", transform: "translateY(-2px)" }} onClick={toggle}>
                                    Ingresar
                                </MotionButton>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div style={S.legalBar}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#06b6d4", boxShadow: "0 0 10px rgba(6,182,212,.7)" }} />
                (c) Streaming Box 2026
                <span className="tos-sep">-</span>
                <button className="tos-link" style={S.legalLink} type="button" onClick={() => setShowTerms(true)}>
                    Términos y Condiciones
                </button>
            </div>
            <TermsModal open={showTerms} onClose={() => setShowTerms(false)} />
        </div>
    );
}
