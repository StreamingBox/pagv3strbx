import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import UserAnalytics from "../components/analytics/UserAnalytics.jsx";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

export default function AdminAnalytics() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    async function logout() {
        try { await apiLogout(); } catch (e) { console.error(e); }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { }
        navigate("/", { replace: true });
    }

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                {/* Usamos el mismo sidebar admin pero simplificado (sin la subida de logos) para navegación básica */}
                <AdminSidebar
                    user={user}
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")} // Lo enviamos atrás si quiere tocar el logo
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "10px 20px 20px" }}>
                    <button
                        className="btn-ghost"
                        onClick={() => navigate("/admin")}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 14px", marginBottom: 10, borderRadius: 10 }}
                    >
                        <span>←</span>
                        <span>Volver al panel principal</span>
                    </button>

                    {/* Renderiza el UserAnalytics en modo administrador (con multi-select de usuarios) */}
                    <UserAnalytics admin={true} />
                </main>
            </div>
        </div>
    );
}
