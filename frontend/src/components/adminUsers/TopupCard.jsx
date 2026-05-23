import { useMemo, useState } from "react";
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

export default function TopupCard({ users, usersById, saving, onTopup, onAdjustProfit, onAdjustInvested }) {
    const [topupUserId, setTopupUserId] = useState("");
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("Ajuste admin");
    const [adjustType, setAdjustType] = useState("balance");
    const [operation, setOperation] = useState("add");
    const [success, setSuccess] = useState("");
    const [err, setErr] = useState("");

    const selectedUser = useMemo(() => usersById.get(String(topupUserId)), [usersById, topupUserId]);

    const userOptions = useMemo(() =>
        users.map(u => ({ value: String(u.id), label: `#${u.id} — ${u.email}` }))
        , [users]);

    const typeOptions = [
        { value: "balance", label: "💰 Saldo (Wallet)" },
        { value: "profit", label: "📈 Ganancia" },
        { value: "invested", label: "💹 Inversión" },
    ];

    const opOptions = [
        { value: "add", label: "➕ Sumar (+)" },
        { value: "sub", label: "➖ Restar (−)" },
    ];

    async function handleAction() {
        if (!topupUserId || !amount) return;
        setErr("");
        const finalAmount = operation === "sub" ? -Math.abs(Number(amount)) : Math.abs(Number(amount));
        try {
            if (adjustType === "balance") {
                await onTopup({ userId: topupUserId, amount: finalAmount, note });
            } else if (adjustType === "profit") {
                await onAdjustProfit({ userId: topupUserId, amount: finalAmount, note });
            } else if (adjustType === "invested") {
                await onAdjustInvested({ userId: topupUserId, amount: finalAmount, note });
            }
            setAmount("");
            setSuccess("✅ Ajuste realizado correctamente.");
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
                <span style={{ fontSize: 18 }}>💰</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Gestionar Ajustes (Saldo / Ganancia / Inversión)</h3>
            </div>

            {/* User info chip */}
            {selectedUser && (
                <div style={{ display: "flex", gap: 14, marginBottom: 18, background: "rgba(13,166,242,0.06)", border: "1px solid rgba(13,166,242,0.15)", borderRadius: 10, padding: "12px 16px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        Saldo: <b style={{ color: "var(--text)" }}>{Number(selectedUser.balance).toLocaleString()} {selectedUser.currency}</b>
                    </span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        Ganancia: <b style={{ color: "#10b981" }}>{Number(selectedUser.profit_total).toLocaleString()} {selectedUser.currency}</b>
                    </span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        Inversión: <b style={{ color: "#13c8ec" }}>{Number(selectedUser.total_invested).toLocaleString()} {selectedUser.currency}</b>
                    </span>
                </div>
            )}

            {/* Row 1: Usuario + tipo + operación */}
            <div className="admin-users-formGrid admin-users-formGrid--three" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr", gap: 14, marginBottom: 14 }}>
                <div>
                    <span style={lbl}>👤 Usuario *</span>
                    <DarkSelect options={userOptions} value={topupUserId} onChange={setTopupUserId} placeholder="Seleccionar usuario..." />
                </div>
                <div>
                    <span style={lbl}>¿Qué ajustar?</span>
                    <DarkSelect options={typeOptions} value={adjustType} onChange={setAdjustType} searchable={false} />
                </div>
                <div>
                    <span style={lbl}>Acción</span>
                    <DarkSelect options={opOptions} value={operation} onChange={setOperation} searchable={false} />
                </div>
            </div>

            {/* Row 2: Monto + Nota + Botón */}
            <div className="admin-users-formGrid admin-users-formGrid--action" style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr auto", gap: 14, alignItems: "flex-end" }}>
                <div>
                    <span style={lbl}>Monto</span>
                    <input style={inp} type="number" min="0" placeholder="Ej: 5000"
                        value={amount} onChange={e => setAmount(e.target.value)}
                        onFocus={focus} onBlur={blur} />
                </div>
                <div>
                    <span style={lbl}>Nota</span>
                    <input style={inp} type="text" value={note} onChange={e => setNote(e.target.value)}
                        onFocus={focus} onBlur={blur} />
                </div>
                <button className="btn admin-users-submitBtn" style={{ height: 42, padding: "0 24px", whiteSpace: "nowrap", borderRadius: 10, fontWeight: 700, fontSize: 14 }}
                    disabled={!topupUserId || !amount || saving} onClick={handleAction}>
                    {saving ? "Procesando..." : "Realizar ajuste"}
                </button>
            </div>

            <AnimatePresence>
                {success && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ marginTop: 14, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{success}</motion.div>}
                {err && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ marginTop: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{err}</motion.div>}
            </AnimatePresence>
        </motion.div>
    );
}
