import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DarkSelect from "./DarkSelect";

const lbl = { fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6, display: "block" };

const currencyOptions = [
    { value: "COP", label: "🇨🇴 COP — Peso Colombiano" },
    { value: "MXN", label: "🇲🇽 MXN — Peso Mexicano" },
    { value: "USD", label: "🇺🇸 USD — Dólar Estadounidense" },
];

export default function ChangeCurrencyCard({ users, saving, onUpdateCurrency }) {
    const [userId, setUserId] = useState("");
    const [currency, setCurrency] = useState("COP");
    const [success, setSuccess] = useState("");
    const [err, setErr] = useState("");

    const userOptions = useMemo(() =>
        users.map(u => ({ value: String(u.id), label: `#${u.id} — ${u.email} | ${Number(u.balance).toLocaleString()} ${u.currency}` }))
        , [users]);

    async function handleSave() {
        setErr("");
        try {
            await onUpdateCurrency({ userId, currency });
            setUserId("");
            setCurrency("COP");
            setSuccess("✅ Moneda actualizada correctamente.");
            setTimeout(() => setSuccess(""), 4000);
        } catch (e) {
            setErr("Error: " + e.message);
        }
    }

    return (
        <motion.div className="admin-users-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "24px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>

            <div className="admin-users-cardTitle" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
                <span style={{ fontSize: 18 }}>🌍</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Cambiar Moneda de Usuario</h3>
            </div>

            <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "rgba(245,158,11,0.85)" }}>
                ⚠ Recomendación: si el usuario tiene saldo activo, considera vaciarlo antes de cambiar la moneda.
            </div>

            <div className="admin-users-formGrid admin-users-formGrid--two" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                    <span style={lbl}>👤 Usuario *</span>
                    <DarkSelect options={userOptions} value={userId} onChange={setUserId} placeholder="Seleccionar usuario..." />
                </div>
                <div>
                    <span style={lbl}>💱 Nueva Moneda</span>
                    <DarkSelect options={currencyOptions} value={currency} onChange={setCurrency} searchable={false} />
                </div>
            </div>

            <button className="btn admin-users-submitBtn" style={{ height: 42, padding: "0 24px", borderRadius: 10, fontWeight: 700, fontSize: 14 }}
                disabled={saving || !userId} onClick={handleSave}>
                {saving ? "Guardando..." : "🌍 Guardar Moneda"}
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
