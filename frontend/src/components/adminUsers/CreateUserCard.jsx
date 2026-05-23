import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DarkSelect from "./DarkSelect";

const inp = {
    appearance: "none", height: 42, padding: "0 14px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 14, fontWeight: 500, outline: "none", width: "100%",
    fontFamily: "var(--font)", transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box",
};

const lbl = { fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6, display: "block" };

const roleOptions = [
    { value: "user", label: "👤 user — Usuario normal" },
    { value: "admin", label: "🛡 admin — Administrador" },
];

const currencyOptions = [
    { value: "COP", label: "🇨🇴 COP — Peso Colombiano" },
    { value: "MXN", label: "🇲🇽 MXN — Peso Mexicano" },
    { value: "USD", label: "🇺🇸 USD — Dólar Estadounidense" },
];

export default function CreateUserCard({ saving, onCreate }) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("user");
    const [currency, setCurrency] = useState("COP");
    const [show, setShow] = useState(false);
    const [success, setSuccess] = useState("");
    const [err, setErr] = useState("");

    async function handleCreate() {
        setErr("");
        try {
            await onCreate({ name, email, password, role, currency });
            setName(""); setEmail(""); setPassword(""); setRole("user"); setCurrency("COP");
            setSuccess("✅ Usuario creado correctamente.");
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
                <span style={{ fontSize: 18 }}>➕</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Crear Nuevo Usuario</h3>
            </div>

            {/* Row 1: Nombre + Email */}
            <div className="admin-users-formGrid admin-users-formGrid--two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                    <span style={lbl}>Nombre</span>
                    <input style={inp} placeholder="Juan Pérez" value={name} onChange={e => setName(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                    <span style={lbl}>Email *</span>
                    <input style={inp} type="email" placeholder="usuario@email.com" value={email} onChange={e => setEmail(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
            </div>

            {/* Row 2: Contraseña + Rol + Moneda */}
            <div className="admin-users-formGrid admin-users-formGrid--three" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div>
                    <span style={lbl}>🔒 Contraseña *</span>
                    <div style={{ position: "relative" }}>
                        <input style={{ ...inp, paddingRight: 42 }} type={show ? "text" : "password"}
                            placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                            onFocus={focus} onBlur={blur} />
                        <button type="button" onClick={() => setShow(v => !v)}
                            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, display: "flex" }}>
                            {show ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>
                <div>
                    <span style={lbl}>Rol</span>
                    <DarkSelect options={roleOptions} value={role} onChange={setRole} searchable={false} />
                </div>
                <div>
                    <span style={lbl}>Moneda</span>
                    <DarkSelect options={currencyOptions} value={currency} onChange={setCurrency} searchable={false} />
                </div>
            </div>

            <button className="btn admin-users-submitBtn" style={{ height: 42, padding: "0 28px", borderRadius: 10, fontWeight: 700, fontSize: 14 }}
                onClick={handleCreate} disabled={saving || !email || !password}>
                {saving ? "Creando..." : "➕ Crear Usuario"}
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
