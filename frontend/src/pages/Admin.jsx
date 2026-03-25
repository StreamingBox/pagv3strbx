import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import AdminKpiCards from "../components/admin/AdminKpiCards.jsx";
import { apiFetch } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/special-effects.css";
import useAppLogout from "../hooks/useAppLogout.js";

const LOGO_URL = "/api/branding/logo";
const MotionDiv = motion.div;

export default function Admin() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();
    const fileRef = useRef(null);
    const [logoOk, setLogoOk] = useState(true);
    const [logoTs, setLogoTs] = useState(Date.now());
    const [uploadingLogo, setUploadingLogo] = useState(false);

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

            const { ok, data } = await apiFetch("/admin/branding/logo", {
                method: "POST",
                body: JSON.stringify({ dataUrl }),
            });
            if (!ok) throw new Error(data?.message || "No se pudo subir el logo.");
            setLogoOk(true);
            setLogoTs(Date.now());
            alert("Logo actualizado ✅");
        } catch (err) {
            console.error("[Logo upload error]", err);
            alert(err?.message || "Error subiendo logo.");
        } finally {
            setUploadingLogo(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-grid" />
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
            </div>

            <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                style={{ display: "none" }}
                onChange={onPickLogo}
            />

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={`${LOGO_URL}?t=${logoTs}`}
                    logoOk={logoOk}
                    setLogoOk={setLogoOk}
                    uploadingLogo={uploadingLogo}
                    onOpenLogoPicker={openLogoPicker}
                    onLogout={logout}
                    onNavigate={navigate}
                />

                <main className="main">
                    <MotionDiv
                        className="admin-page-header"
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div>
                            <h1 className="title">Panel Administrador</h1>
                            <p className="subtitle">Gestión centralizada de servicios</p>
                        </div>

                        <MotionDiv
                            className="stitch-beam-container"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.96 }}
                        >
                            <button
                                className="stitch-beam-content"
                                onClick={() => navigate("/dashboard")}
                                style={{ fontSize: 13, border: "none" }}
                                aria-label="Ir al dashboard de usuario"
                            >
                                Ir a Dashboard
                            </button>
                        </MotionDiv>
                    </MotionDiv>

                    <AdminKpiCards onNavigate={navigate} />
                </main>
            </div>
        </div>
    );
}
