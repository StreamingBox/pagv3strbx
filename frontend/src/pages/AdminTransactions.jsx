import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import { fetchAdminGlobalTransactions, fetchUsers } from "../api/adminUsersApi";
import TransactionsList from "../components/wallet/TransactionsList";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

export default function AdminTransactions() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [allUsers, setAllUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);

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

    useEffect(() => {
        async function load() {
            try {
                const uData = await fetchUsers({ page: 1, limit: 1000 });
                setAllUsers(uData.items || []);
            } catch (error) {
                console.error("Error loading users:", error);
            } finally {
                setLoadingUsers(false);
            }
        }
        load();
    }, []);

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 32px" }}>
                    {/* ── Page header ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ marginBottom: 24 }}
                    >
                        <button
                            className="btn-ghost"
                            onClick={() => navigate("/admin")}
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                fontSize: 13, padding: "6px 14px", marginBottom: 16, borderRadius: 10,
                            }}
                        >
                            ← Volver al panel
                        </button>

                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            {/* Icon badge */}
                            <div style={{
                                width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                                background: "linear-gradient(135deg, #0da6f2, #8b5cf6)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 20, boxShadow: "0 4px 16px rgba(13,166,242,0.35)",
                            }}>
                                💳
                            </div>
                            <div>
                                <h1 style={{
                                    margin: 0, fontSize: 22, fontWeight: 900,
                                    color: "var(--text)", letterSpacing: "-0.4px",
                                }}>
                                    Transacciones Globales
                                </h1>
                                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                                    Historial completo de movimientos de saldo y ganancias de la plataforma.
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Transactions table + KPIs ── */}
                    {loadingUsers ? (
                        <div style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            padding: "80px 20px", gap: 14, color: "var(--muted)", flexDirection: "column",
                        }}>
                            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                            <span style={{ fontSize: 14 }}>Cargando usuarios...</span>
                        </div>
                    ) : (
                        <TransactionsList
                            fetchFn={fetchAdminGlobalTransactions}
                            users={allUsers}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}
