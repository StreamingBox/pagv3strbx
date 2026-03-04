import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import { useAdminPrices } from "../hooks/useAdminPrices";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import PricesForm from "../components/prices/PricesForm";
import PricesTable from "../components/prices/PricesTable";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

export default function AdminPrices() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const {
        platforms, durations, prices,
        loading, saving, error,
        page, limit, total, totalPages,
        q, setQ,
        loadAll, saveMulti, toggleAll,
    } = useAdminPrices();

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try { localStorage.removeItem("user"); localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); } catch { }
        navigate("/", { replace: true });
    }

    // Count active per currency
    const copActive = prices.filter(p => p.active_cop).length;
    const mxnActive = prices.filter(p => p.active_mxn).length;
    const usdActive = prices.filter(p => p.active_usd).length;

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <AdminSidebar
                    user={user} logoSrc={LOGO_URL} logoOk={true}
                    setLogoOk={() => { }} uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 40px" }}>
                    {/* ── Header ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--stroke)", flexWrap: "wrap", gap: 16 }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,rgba(13,166,242,0.15),rgba(99,51,255,0.15))", border: "1px solid rgba(13,166,242,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.2)", flexShrink: 0 }}>💲</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>Planes / Precios</h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Gestiona precios por plataforma, duración y moneda (COP / MXN / USD).</p>
                            </div>
                        </div>

                        {/* KPI row */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {[
                                { label: "Total Planes", value: total, color: "#0da6f2", icon: "📋" },
                                { label: "COP Activos", value: copActive, color: "#10b981", icon: "🇨🇴" },
                                { label: "MXN Activos", value: mxnActive, color: "#f59e0b", icon: "🇲🇽" },
                                { label: "USD Activos", value: usdActive, color: "#8b5cf6", icon: "🇺🇸" },
                            ].map(k => (
                                <div key={k.label} style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, boxShadow: `0 4px 16px ${k.color}10` }}>
                                    <span style={{ fontSize: 16 }}>{k.icon}</span>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{k.label}</div>
                                        <div style={{ fontSize: 18, fontWeight: 900, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* ── Error ── */}
                    <AnimatePresence>
                        {error && (
                            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                                ⚠ {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Form ── */}
                    <PricesForm
                        platforms={platforms}
                        durations={durations}
                        saving={saving}
                        onSaveMulti={saveMulti}
                    />

                    {/* ── Table ── */}
                    <PricesTable
                        prices={prices}
                        loading={loading}
                        saving={saving}
                        page={page}
                        limit={limit}
                        total={total}
                        totalPages={totalPages}
                        q={q}
                        setQ={setQ}
                        onToggleAll={toggleAll}
                        onSaveMulti={saveMulti}
                        loadAll={loadAll}
                    />
                </main>
            </div>
        </div>
    );
}
