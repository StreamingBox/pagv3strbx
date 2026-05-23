export default function AuthSuccess({ S, onBack }) {
    return (
        <div style={{ ...S.shell, flexDirection: "column", gap: 20 }}>
            <div style={{ ...S.orb1 }} />
            <div style={{ ...S.orb2 }} />
            <div style={{ ...S.gridBg }} />
            <div style={{ textAlign: "center", zIndex: 10, maxWidth: 440, background: "rgba(7,14,40,.85)", padding: "48px 40px", borderRadius: 28, border: "1px solid rgba(255,255,255,.07)", backdropFilter: "blur(24px)" }}>
                <div style={{ fontSize: 64, marginBottom: 20 }}>OK</div>
                <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginBottom: 14 }}>Cuenta creada con exito</h2>
                <p style={{ color: "rgba(200,215,245,.7)", lineHeight: 1.7, marginBottom: 20, fontSize: 15 }}>
                    Tu cuenta esta <strong style={{ color: "#06b6d4" }}>pendiente de aprobacion</strong>.<br />
                    Espera a que un administrador la active.
                </p>
                <button onClick={onBack}
                    style={{ background: "none", border: "none", color: "rgba(200,215,245,.5)", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>
                    Volver al inicio de sesion
                </button>
            </div>
        </div>
    );
}
