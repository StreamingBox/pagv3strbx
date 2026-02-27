import { useMemo, useState } from "react";

export default function TopupCard({ users, usersById, saving, onTopup }) {
    const [topupUserId, setTopupUserId] = useState("");
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("Recarga admin");

    const selectedUser = useMemo(() => usersById.get(String(topupUserId)), [usersById, topupUserId]);

    async function handleTopup() {
        await onTopup({ userId: topupUserId, amount, note });
        setAmount("");
        alert("Saldo recargado ✅");
    }

    return (
        <div className="kpi" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Recargar saldo</div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr .6fr 1fr", gap: 10 }}>
                <label className="label">
                    Usuario
                    <select className="input" value={topupUserId} onChange={(e) => setTopupUserId(e.target.value)}>
                        <option value="">-- Selecciona --</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id}>
                                #{u.id} - {u.email} ({u.role})
                            </option>
                        ))}
                    </select>
                </label>

                <label className="label">
                    Monto
                    <input className="input" type="number" placeholder="Ej: 50000" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" />
                </label>

                <label className="label">
                    Nota
                    <input className="input" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
            </div>

            {selectedUser ? (
                <div style={{ marginTop: 10, color: "rgba(234,241,255,.75)" }}>
                    Saldo actual de <b>{selectedUser.email}</b>:{" "}
                    <b>
                        {Number(selectedUser.balance).toLocaleString()} {selectedUser.currency}
                    </b>
                </div>
            ) : null}

            <button className="btn" style={{ marginTop: 12 }} disabled={!topupUserId || !amount || saving} onClick={handleTopup}>
                {saving ? "Recargando..." : "Recargar saldo"}
            </button>
        </div>
    );
}
