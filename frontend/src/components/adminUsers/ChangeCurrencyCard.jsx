import { useState } from "react";

export default function ChangeCurrencyCard({ users, saving, onUpdateCurrency }) {
    const [currencyUserId, setCurrencyUserId] = useState("");
    const [currencyValue, setCurrencyValue] = useState("COP");

    async function handleSave() {
        await onUpdateCurrency({ userId: currencyUserId, currency: currencyValue });
        setCurrencyUserId("");
        setCurrencyValue("COP");
        alert("Moneda actualizada ✅");
    }

    return (
        <div className="kpi" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Cambiar moneda de usuario</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="label">
                    Usuario
                    <select className="input" value={currencyUserId} onChange={(e) => setCurrencyUserId(e.target.value)}>
                        <option value="">-- Selecciona --</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id}>
                                #{u.id} - {u.email} | saldo: {Number(u.balance).toLocaleString()} {u.currency}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="label">
                    Moneda
                    <select className="input" value={currencyValue} onChange={(e) => setCurrencyValue(e.target.value)}>
                        <option value="COP">COP</option>
                        <option value="MXN">MXN</option>
                        <option value="USD">USD</option>
                    </select>
                </label>
            </div>

            <button className="btn" style={{ marginTop: 12 }} disabled={saving || !currencyUserId} onClick={handleSave}>
                {saving ? "Guardando..." : "Guardar moneda"}
            </button>

            <div style={{ marginTop: 8, color: "rgba(234,241,255,.6)", fontSize: 13 }}>
                Recomendación: si el usuario tiene saldo, el backend debería bloquear el cambio (saldo 0).
            </div>
        </div>
    );
}
