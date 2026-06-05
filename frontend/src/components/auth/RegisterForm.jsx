import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

const MotionButton = motion.button;

export default function RegisterForm({
    S,
    C,
    isRegister,
    isMobile,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    acceptedTerms,
    setAcceptedTerms,
    showPwd,
    setShowPwd,
    showConfirm,
    setShowConfirm,
    loading,
    error,
    onSubmit,
    toggle,
    onOpenTerms,
}) {
    return (
        <div
            style={S.regSide(isRegister)}
            aria-hidden={!isRegister}
            inert={!isRegister ? true : undefined}
        >
            <h2 style={{ ...S.heading, marginBottom: 24 }}>Crear Cuenta</h2>
            <form onSubmit={onSubmit}>
                <label style={S.label}>
                    Nombre Completo
                    <input style={S.input} type="text" placeholder="Tu nombre" value={name} onChange={(event) => setName(event.target.value)} onFocus={(event) => (event.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={(event) => (event.target.style.boxShadow = "none")} required />
                </label>
                <label style={S.label}>
                    Email
                    <input style={S.input} type="email" placeholder="tu@correo.com" value={email} onChange={(event) => setEmail(event.target.value)} onFocus={(event) => (event.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={(event) => (event.target.style.boxShadow = "none")} required />
                </label>
                <label style={S.label}>
                    Contraseña
                    <div style={S.relativeWrap}>
                        <input style={{ ...S.input, width: "100%", paddingRight: 44 }} type={showPwd ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} onFocus={(event) => (event.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={(event) => (event.target.style.boxShadow = "none")} required />
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
                <label style={S.label}>
                    Confirmar Contraseña
                    <div style={S.relativeWrap}>
                        <input style={{ ...S.input, width: "100%", paddingRight: 44 }} type={showConfirm ? "text" : "password"} placeholder="Repite tu contraseña" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onFocus={(event) => (event.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={(event) => (event.target.style.boxShadow = "none")} required />
                        <button
                            type="button"
                            style={S.eyeBtn}
                            aria-label={showConfirm ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"}
                            title={showConfirm ? "Ocultar confirmación" : "Mostrar confirmación"}
                            onClick={() => setShowConfirm(!showConfirm)}
                        >
                            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </label>
                <label style={S.checkboxRow}>
                    <input
                        style={S.checkbox}
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(event) => setAcceptedTerms(event.target.checked)}
                    />
                    <span style={S.checkboxText}>
                        Acepto los{" "}
                        <button className="tos-link" style={S.legalLink} type="button" onClick={onOpenTerms}>
                            Términos y Condiciones
                        </button>
                    </span>
                </label>
                {error && isRegister ? <div style={S.err}>{error}</div> : null}
                <MotionButton type="submit" style={S.btn} whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(37,99,235,.45)" }} whileTap={{ scale: .97 }} disabled={loading}>
                    {loading ? "Creando cuenta..." : "Registrarse"}
                </MotionButton>
                {isMobile ? (
                    <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: C.muted }}>
                        ¿Ya tienes cuenta?{" "}
                        <button type="button" onClick={toggle} style={{ background: "none", border: 0, padding: 0, color: "#0ea5e9", fontWeight: 700, cursor: "pointer" }}>Inicia Sesión</button>
                    </div>
                ) : null}
            </form>
        </div>
    );
}
