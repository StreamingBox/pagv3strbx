import { useMemo, useState } from "react";

export default function TopupCard({ users, usersById, saving, onTopup, onAdjustProfit }) {
    const [topupUserId, setTopupUserId] = useState("");
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("Ajuste admin");
    const [adjustType, setAdjustType] = useState("balance"); // balance | profit
    const [operation, setOperation] = useState("add"); // add | sub

    const selectedUser = useMemo(() => usersById.get(String(topupUserId)), [usersById, topupUserId]);

    async function handleAction() {
        if (!topupUserId || !amount) return;

        const finalAmount = operation === "sub" ? -Math.abs(Number(amount)) : Math.abs(Number(amount));

        try {
            if (adjustType === "balance") {
                await onTopup({ userId: topupUserId, amount: finalAmount, note });
            } else {
                await onAdjustProfit({ userId: topupUserId, amount: finalAmount, note });
            }
            setAmount("");
            alert("Ajuste realizado ✅");
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    return (
        <div className="kpi" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Gestionar Saldo / Ganancia</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 0.6fr 0.8fr 1fr", gap: 10, alignItems: "flex-end" }}>
                <label className="label">
                    Usuario
                    <select className="input" value={topupUserId} onChange={(e) => setTopupUserId(e.target.value)}>
                        <option value="">-- Selecciona --</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id}>
                                #{u.id} - {u.email}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="label">
                    ¿Qué ajustar?
                    <select className="input" value={adjustType} onChange={(e) => setAdjustType(e.target.value)}>
                        <option value="balance">Saldo (Wallet)</option>
                        <option value="profit">Ganancia</option>
                    </select>
                </label>

                <label className="label">
                    Acción
                    <select className="input" value={operation} onChange={(e) => setOperation(e.target.value)}>
                        <option value="add">Sumar (+)</option>
                        <option value="sub">Restar (-)</option>
                    </select>
                </label>

                <label className="label">
                    Monto
                    <input
                        className="input"
                        type="number"
                        placeholder="Ej: 5000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        min="0"
                    />
                </label>

                <label className="label">
                    Nota
                    <input className="input" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
            </div>

            {selectedUser ? (
                <div style={{ marginTop: 12, display: "flex", gap: 20, color: "rgba(234,241,255,.75)" }}>
                    <div>
                        Saldo actual: <b>{Number(selectedUser.balance).toLocaleString()} {selectedUser.currency}</b>
                    </div>
                    <div>
                        Ganancia acumulada: <b style={{ color: "#10b981" }}>{Number(selectedUser.profit_total).toLocaleString()} {selectedUser.currency}</b>
                    </div>
                </div>
            ) : null}

            <button
                className="btn"
                style={{ marginTop: 12 }}
                disabled={!topupUserId || !amount || saving}
                onClick={handleAction}
            >
                {saving ? "Procesando..." : "Realizar ajuste"}
            </button>
        </div>
    );
}
