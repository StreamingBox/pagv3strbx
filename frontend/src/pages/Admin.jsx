import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import AdminKpiCards from "../components/admin/AdminKpiCards.jsx";
import { apiLogout } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = `${API_BASE}/branding/logo`;

export default function Admin() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const fileRef = useRef(null);
    const [logoOk, setLogoOk] = useState(true);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    async function logout() {
        try {
            await apiLogout();
        } catch (e) {
            console.error(e);
        } finally {
            setUser(null);
            try {
                localStorage.removeItem("user");
                localStorage.removeItem("accessToken");
                localStorage.removeItem("refreshToken");
            } catch { }
            navigate("/", { replace: true });
        }
    }

    function openLogoPicker() {
        fileRef.current?.click();
    }

    async function onPickLogo(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingLogo(true);
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result));
                r.onerror = reject;
                r.readAsDataURL(file);
            });
            const res = await fetch(`${API_BASE}/admin/branding/logo`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataUrl }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "No se pudo subir el logo.");
            setLogoOk(true);
            alert("Logo actualizado ✅");
        } catch (err) {
            alert(err?.message || "Error subiendo logo.");
        } finally {
            setUploadingLogo(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    return (
        <div className="page-shell">
            <div className="bg-grid"></div>
            <div className="bg-orb orb-1"></div>
            <div className="bg-orb orb-2"></div>

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={`${LOGO_URL}?t=${Date.now()}`}
                    logoOk={logoOk}
                    setLogoOk={setLogoOk}
                    uploadingLogo={uploadingLogo}
                    onOpenLogoPicker={openLogoPicker}
                    onLogout={logout}
                    onNavigate={navigate}
                />

                <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: "none" }}
                    onChange={onPickLogo}
                />

                <main className="main">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <h1 className="title">Panel Administrador</h1>
                            <p className="subtitle">Gestión centralizada de servicios</p>
                        </div>

                        <button
                            className="btn-ghost"
                            onClick={() => navigate("/dashboard")}
                        >
                            Ir a Dashboard
                        </button>
                    </div>

                    <AdminKpiCards />

                    <div style={{ marginTop: 24 }}>
                        {/* El contenido de las subrutas se cargará aquí por Admin.jsx original era un layout */}
                        {/* Si el Admin.jsx original tenía más cosas, las recuperaré al ver el archivo */}
                    </div>
                </main>
            </div>
        </div>
    );
}
