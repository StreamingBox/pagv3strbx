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
    referralCode = "",
    setReferralCode,
    referralCampaign,
    referralInvite = null,
    referralConsent = false,
    setReferralConsent,
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
    const inviteLinkPresent = referralInvite?.status === "valid";
    const showReferralConsent = inviteLinkPresent || (Boolean(referralCode) && Boolean(referralCampaign?.active));
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
                    <input style={S.input} type="email" placeholder="tu@correo.com" value={email} onChange={(event) => setEmail(event.target.value)} onFocus={(event) => (event.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)")} onBlur={(event) => (event.target.style.boxShadow = "none")} readOnly={inviteLinkPresent || referralInvite?.status === "loading" || referralInvite?.status === "invalid"} required />
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
                {referralInvite?.status === "loading" && <div role="status" style={{ ...S.err, borderColor: "rgba(37,130,180,.35)", color: C.muted }}>Validando el enlace personal…</div>}
                {referralInvite?.status === "invalid" && <div role="alert" style={S.err}>{referralInvite.message || "Esta invitación ya no está disponible. Solicita un enlace nuevo."}</div>}
                {inviteLinkPresent && <div style={{ padding: "11px 13px", marginBottom: 12, borderLeft: "3px solid #10b981", background: "rgba(16,185,129,.09)", color: C.text, fontSize: 13, lineHeight: 1.5 }}>
                    {referralInvite.inviterName ? <><strong>{referralInvite.inviterName}</strong> te invitó a registrarte. </> : "Tienes una invitación personal. "}
                    La invitación se vinculará al correo precargado y solo podrá usarse una vez.
                </div>}
                {!inviteLinkPresent && !referralInvite?.status && (referralCampaign?.active || referralCode) && <label style={S.label}>
                    Código de referido (opcional)
                    <input style={S.input} type="text" maxLength={12} autoComplete="off" value={referralCode} onChange={event => setReferralCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
                    {referralCampaign && !referralCampaign.active && <small style={{ color: C.muted, display: "block", marginTop: 6, lineHeight: 1.4 }}>Campaña pausada. Este registro no generará un premio por referido.</small>}
                </label>}
                {showReferralConsent && <label style={S.checkboxRow}>
                    <input style={S.checkbox} type="checkbox" required checked={referralConsent} onChange={event => setReferralConsent(event.target.checked)} />
                    <span style={S.checkboxText}>Autorizo a quien me invita a ver mi nombre, correo y avance de recargas para acompañarme hasta la meta. Puedo retirar esta autorización en Referidos.</span>
                </label>}
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
                <MotionButton type="submit" style={S.btn} whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(37,99,235,.45)" }} whileTap={{ scale: .97 }} disabled={loading || referralInvite?.status === "loading" || referralInvite?.status === "invalid"}>
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
