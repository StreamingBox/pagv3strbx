import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import StreamingBoxLogo from "../StreamingBoxLogo.jsx";
import { isNativeAndroidApp } from "../../native/biometricAuth.js";

const MotionButton = motion.button;

export default function LoginForm({
    S,
    C,
    dark,
    isRegister,
    isMobile,
    email,
    setEmail,
    password,
    setPassword,
    showPwd,
    setShowPwd,
    rememberLogin,
    setRememberLogin,
    loading,
    error,
    onSubmit,
    onForgotPassword,
    toggle,
}) {
    return (
        <div
            style={S.formSide(isRegister)}
            aria-hidden={isRegister}
            inert={isRegister ? true : undefined}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
                <StreamingBoxLogo
                    size={40}
                    showText
                    onDark={dark}
                    textColor={C.text}
                    subtitle="Bienvenido de nuevo"
                />
            </div>

            <h2 style={S.heading}>Iniciar Sesión</h2>
            <form onSubmit={onSubmit}>
                <label style={S.label}>
                    Email
                    <input style={S.input} type="email" placeholder="tu@correo.com" value={email} onChange={(event) => setEmail(event.target.value)} onFocus={(event) => (event.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={(event) => (event.target.style.boxShadow = "none")} required />
                </label>
                <label style={S.label}>
                    Contraseña
                    <div style={S.relativeWrap}>
                        <input style={{ ...S.input, width: "100%", paddingRight: 44 }} type={showPwd ? "text" : "password"} placeholder="Tu contraseña" value={password} onChange={(event) => setPassword(event.target.value)} onFocus={(event) => (event.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={(event) => (event.target.style.boxShadow = "none")} required />
                        <button
                            type="button"
                            style={S.eyeBtn}
                            aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                            title={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                            onClick={() => setShowPwd(!showPwd)}
                        >
                            {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </label>
                <button type="button" style={S.forgotLink} onClick={onForgotPassword}>
                    Olvidé mi contraseña
                </button>
                {error && !isRegister ? <div style={S.err}>{error}</div> : null}
                {isNativeAndroidApp() ? (
                    <label style={S.checkboxRow}>
                        <input
                            style={S.checkbox}
                            type="checkbox"
                            checked={rememberLogin}
                            onChange={(event) => setRememberLogin(event.target.checked)}
                        />
                        <span style={S.checkboxText}>Guardar correo en esta app</span>
                    </label>
                ) : null}
                <MotionButton type="submit" style={S.btn} whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(37,99,235,.45)" }} whileTap={{ scale: .97 }} disabled={loading}>
                    {loading ? "Cargando..." : "Ingresar"}
                </MotionButton>
                {isMobile ? (
                    <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: C.muted }}>
                        ¿No tienes cuenta?{" "}
                        <button type="button" onClick={toggle} style={{ background: "none", border: 0, padding: 0, color: "#0ea5e9", fontWeight: 700, cursor: "pointer" }}>Regístrate</button>
                    </div>
                ) : null}
            </form>
        </div>
    );
}
