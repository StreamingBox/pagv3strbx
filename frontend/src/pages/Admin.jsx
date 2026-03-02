import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import AdminKpiCards from "../components/admin/AdminKpiCards.jsx";
import { apiLogout } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/special-effects.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const LOGO_URL = "/logo.png";

export default function Admin() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const fileRef = useRef(null);
    const [logoOk, setLogoOk] = useState(true);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    async function logout() {
        try { await apiLogout(); } catch (e) { console.error(e); } finally {
            setUser(null);
            try {
                localStorage.removeItem("user");
                localStorage.removeItem("accessToken");
                localStorage.removeItem("refreshToken");
            } catch { }
            navigate("/", { replace: true });
        }
    }

    function openLogoPicker() { fileRef.current?.click(); }

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
                method: "POST", credentials: "include",
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
            <div className="bg-grid" />
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />

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
                    <motion.div
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
                    >
                        <div>
                            <h1 className="title">Panel Administrador</h1>
                            <p className="subtitle">Gestión centralizada de servicios</p>
                        </div>

                        <motion.div
                            className="stitch-beam-container"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.96 }}
                        >
                            <button
                                className="stitch-beam-content"
                                onClick={() => navigate("/dashboard")}
                                style={{ fontSize: 13, border: "none" }}
                            >
                                Ir a Dashboard
                            </button>
                        </motion.div>
                    </motion.div>

                    <AdminKpiCards onNavigate={navigate} />
                </main>
            </div>
        </div>
    );
}
