import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function CreateUserCard({ saving, onCreate }) {
    const [newName, setNewName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState("user");
    const [newCurrency, setNewCurrency] = useState("COP");
    const [showPassword, setShowPassword] = useState(false);

    async function handleCreate() {
        await onCreate({
            name: newName,
            email: newEmail,
            password: newPassword,
            role: newRole,
            currency: newCurrency,
        });
        setNewName("");
        setNewEmail("");
        setNewPassword("");
        setNewRole("user");
        setNewCurrency("COP");
        alert("Usuario creado ✅");
    }

    return (
        <div className="kpi" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Crear usuario</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="label">
                    Nombre
                    <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </label>

                <label className="label">
                    Email
                    <input className="input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </label>

                <label className="label">
                    Contraseña
                    <div style={{ position: "relative" }}>
                        <input
                            className="input"
                            type={showPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            style={{ paddingRight: "40px" }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                                position: "absolute",
                                right: "12px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                background: "none",
                                border: "none",
                                color: "var(--muted)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                padding: "0"
                            }}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </label>

                <label className="label">
                    Rol
                    <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                    </select>
                </label>

                <label className="label">
                    Moneda
                    <select className="input" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}>
                        <option value="COP">COP</option>
                        <option value="USD">USD</option>
                        <option value="MXN">MXN</option>
                    </select>
                </label>
            </div>

            <button className="btn" style={{ marginTop: 12 }} onClick={handleCreate} disabled={saving || !newEmail || !newPassword}>
                {saving ? "Guardando..." : "Crear"}
            </button>
        </div>
    );
}
