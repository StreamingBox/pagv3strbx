import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function ChangePasswordCard({ users, saving, onChangePassword }) {
    const [pwdUserId, setPwdUserId] = useState("");
    const [pwd, setPwd] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    async function handleChange() {
        await onChangePassword({ userId: pwdUserId, password: pwd });
        setPwd("");
        alert("Contraseña actualizada ✅");
    }

    return (
        <div className="kpi" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Cambiar contraseña</div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
                <label className="label">
                    Usuario
                    <select className="input" value={pwdUserId} onChange={(e) => setPwdUserId(e.target.value)}>
                        <option value="">-- Selecciona --</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id}>
                                #{u.id} - {u.email}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="label">
                    Nueva contraseña
                    <div style={{ position: "relative" }}>
                        <input
                            className="input"
                            type={showPassword ? "text" : "password"}
                            value={pwd}
                            onChange={(e) => setPwd(e.target.value)}
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
            </div>

            <button className="btn" style={{ marginTop: 12 }} onClick={handleChange} disabled={saving || !pwdUserId || !pwd}>
                {saving ? "Guardando..." : "Actualizar"}
            </button>
        </div>
    );
}
