import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DarkSelect from "./DarkSelect";

const inp = {
    appearance: "none", height: 42, padding: "0 42px 0 14px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 14, fontWeight: 500, outline: "none", width: "100%",
    fontFamily: "var(--font)", transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box",
};

const lbl = { fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6, display: "block" };

export default function ChangePasswordCard({ users, saving, onChangePassword }) {
    const [pwdUserId, setPwdUserId] = useState("");
    const [pwd, setPwd] = useState("");
    const [show, setShow] = useState(false);
    const [success, setSuccess] = useState("");
    const [err, setErr] = useState("");

    const userOptions = useMemo(() =>
        users.map(u => ({ value: String(u.id), label: `#${u.id} — ${u.email}` }))
        , [users]);

    async function handleChange() {
        setErr("");
        try {
            await onChangePassword({ userId: pwdUserId, password: pwd });
            setPwd("");
            setSuccess("✅ Contraseña actualizada correctamente.");
            setTimeout(() => setSuccess(""), 4000);
        } catch (e) {
            setErr("Error: " + e.message);
        }
    }

    const focus = e => { e.target.style.borderColor = "#0da6f2"; e.target.style.boxShadow = "0 0 0 3px rgba(13,166,242,0.12)"; };
    const blur = e => { e.target.style.borderColor = "var(--stroke)"; e.target.style.boxShadow = "none"; };

    return (
        <motion.div className="admin-users-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "24px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>

            <div className="admin-users-cardTitle" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
                <span style={{ fontSize: 18 }}>🔑</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Cambiar Contraseña</h3>
            </div>

            <div className="admin-users-formGrid admin-users-formGrid--two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                    <span style={lbl}>👤 Usuario *</span>
                    <DarkSelect options={userOptions} value={pwdUserId} onChange={setPwdUserId} placeholder="Seleccionar usuario..." />
                </div>
                <div>
                    <span style={lbl}>🔒 Nueva Contraseña *</span>
                    <div style={{ position: "relative" }}>
                        <input style={inp} type={show ? "text" : "password"} placeholder="••••••••"
                            value={pwd} onChange={e => setPwd(e.target.value)}
                            onFocus={focus} onBlur={blur} />
                        <button type="button" onClick={() => setShow(v => !v)}
                            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, display: "flex" }}>
                            {show ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>
            </div>

            <button className="btn admin-users-submitBtn" style={{ height: 42, padding: "0 24px", borderRadius: 10, fontWeight: 700, fontSize: 14 }}
                onClick={handleChange} disabled={saving || !pwdUserId || !pwd}>
                {saving ? "Guardando..." : "🔑 Actualizar Contraseña"}
            </button>

            <AnimatePresence>
                {success && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ marginTop: 14, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{success}</motion.div>}
                {err && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ marginTop: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{err}</motion.div>}
            </AnimatePresence>
        </motion.div>
    );
}
