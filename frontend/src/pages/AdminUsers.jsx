import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import { useAdminUsers } from "../hooks/useAdminUsers";
import { fetchAdminWalletTransactions } from "../api/adminUsersApi";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import CreateUserCard from "../components/adminUsers/CreateUserCard";
import TopupCard from "../components/adminUsers/TopupCard";
import ChangePasswordCard from "../components/adminUsers/ChangePasswordCard";
import ChangeCurrencyCard from "../components/adminUsers/ChangeCurrencyCard";
import TransactionsList from "../components/wallet/TransactionsList";
import "../styles/special-effects.css";

const TABS = [
    { id: "list", icon: "📋", label: "Lista de Usuarios" },
    { id: "create", icon: "➕", label: "Crear Usuario" },
    { id: "balance", icon: "💰", label: "Saldo / Ganancia" },
    { id: "password", icon: "🔑", label: "Contraseña" },
    { id: "currency", icon: "🌍", label: "Moneda" },
];

const fmtNum = (n) => Number(n || 0).toLocaleString("es-CO");

const selStyle = {
    appearance: "none", height: 32, padding: "0 24px 0 10px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke2)", borderRadius: 8,
    fontSize: 12, fontWeight: 500, cursor: "pointer",
    fontFamily: "var(--font)", outline: "none",
};

const inputSrch = {
    appearance: "none", height: 36, padding: "0 12px 0 34px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 13, fontWeight: 500, outline: "none", width: 260,
    fontFamily: "var(--font)", transition: "border-color 0.2s",
};

export default function AdminUsers() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [activeTab, setActiveTab] = useState("list");
    const [historyUser, setHistoryUser] = useState(null);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

    const {
        users, allUsers, usersById,
        loading, saving, error,
        page, limit, total, totalPages,
        stats, loadUsers,
        doTopup, doAdjustProfit,
        doCreateUser, doChangePassword, doUpdateCurrency,
        doResetInvestment, doAdjustInvested,
    } = useAdminUsers();

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try { localStorage.removeItem("user"); localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); } catch { }
        navigate("/", { replace: true });
    }

    const statColors = { COP: "#10b981", MXN: "#f59e0b", USD: "#8b5cf6" };
    const statIcons = { COP: "🇨🇴", MXN: "🇲🇽", USD: "🇺🇸" };

    const filteredUsers = useMemo(() => {
        let list = users || [];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(u =>
                u.email?.toLowerCase().includes(q) ||
                u.name?.toLowerCase().includes(q) ||
                String(u.id).includes(q)
            );
        }
        if (roleFilter !== "all") list = list.filter(u => u.role === roleFilter);
        return list;
    }, [users, search, roleFilter]);

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <AdminSidebar
                    user={user} logoSrc="/api/branding/logo" logoOk={true}
                    setLogoOk={() => { }} uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main" style={{ padding: "20px 24px 40px" }}>

                    {/* ── Header ── */}
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--stroke)", flexWrap: "wrap", gap: 16 }}>

                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,rgba(13,166,242,0.15),rgba(99,51,255,0.15))", border: "1px solid rgba(13,166,242,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 16px rgba(13,166,242,0.2)", flexShrink: 0 }}>👥</div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>Usuarios</h1>
                                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>Gestiona usuarios, saldos, contraseñas y ajustes de moneda.</p>
                            </div>
                        </div>

                        {/* KPI stat chips */}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {(stats || []).map(s => (
                                <div key={s.currency} style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "10px 16px", minWidth: 140 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                                        {statIcons[s.currency]} Ganancia {s.currency}
                                    </div>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: statColors[s.currency] || "#0da6f2" }}>
                                        {fmtNum(s.total_profit)} <span style={{ fontSize: 12 }}>{s.currency}</span>
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

                    {/* ── Tab Bar ── */}
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                        style={{ display: "flex", gap: 6, marginBottom: 20, background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 14, padding: 6, flexWrap: "wrap" }}>
                        {TABS.map(t => (
                            <button key={t.id} onClick={() => setActiveTab(t.id)}
                                style={{
                                    flex: "1 1 auto", minWidth: 120,
                                    height: 40, padding: "0 16px",
                                    borderRadius: 10, border: "none", cursor: "pointer",
                                    fontFamily: "var(--font)", fontSize: 13, fontWeight: 700,
                                    transition: "all 0.2s",
                                    background: activeTab === t.id ? "linear-gradient(135deg,#0da6f2,#6333ff)" : "transparent",
                                    color: activeTab === t.id ? "#fff" : "var(--muted)",
                                    boxShadow: activeTab === t.id ? "0 4px 14px rgba(13,166,242,0.3)" : "none",
                                }}>
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </motion.div>

                    {/* ── Tab Content ── */}
                    <AnimatePresence mode="wait">
                        <motion.div key={activeTab}
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}>

                            {/* TAB: Lista */}
                            {activeTab === "list" && (
                                <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                                    {/* Table toolbar */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--stroke)", flexWrap: "wrap", gap: 10 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>👤 Lista de Usuarios</h3>
                                            <span style={{ background: "rgba(99,51,255,0.12)", border: "1px solid rgba(99,51,255,0.25)", color: "#8b5cf6", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>{total}</span>
                                        </div>
                                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                            <div style={{ position: "relative" }}>
                                                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.4, pointerEvents: "none" }}>🔎</span>
                                                <input style={inputSrch} placeholder="Buscar por email, nombre..."
                                                    value={search} onChange={e => setSearch(e.target.value)}
                                                    onFocus={e => e.target.style.borderColor = "#0da6f2"}
                                                    onBlur={e => e.target.style.borderColor = "var(--stroke)"}
                                                />
                                            </div>
                                            <div style={{ position: "relative" }}>
                                                <select style={selStyle} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                                                    <option value="all">Todos los roles</option>
                                                    <option value="admin">Admin</option>
                                                    <option value="user">User</option>
                                                </select>
                                                <span style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", fontSize: 8, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                            </div>
                                            <button className="btn-ghost" onClick={() => loadUsers(1, limit)} disabled={loading}
                                                style={{ height: 34, padding: "0 14px", fontSize: 12, borderRadius: 8 }}>
                                                {loading ? "⟳" : "⟳"} Refrescar
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ overflowX: "auto" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ background: "rgba(0,0,0,0.25)", textAlign: "left" }}>
                                                    {["ID", "Usuario", "Rol", "Moneda", "Saldo", "Ganancia", "Inversión", "Acciones"].map(h => (
                                                        <th key={h} style={{ padding: "12px 16px", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", whiteSpace: "nowrap" }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loading ? (
                                                    <tr><td colSpan={8} style={{ padding: "60px", textAlign: "center" }}>
                                                        <div style={{ width: 32, height: 32, border: "3px solid var(--stroke)", borderTopColor: "#0da6f2", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
                                                    </td></tr>
                                                ) : filteredUsers.length === 0 ? (
                                                    <tr><td colSpan={8} style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>
                                                        <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
                                                        {search ? "Sin resultados para esa búsqueda." : "No hay usuarios registrados."}
                                                    </td></tr>
                                                ) : filteredUsers.map((u, idx) => {
                                                    const isAdmin = u.role === "admin";
                                                    const base = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)";
                                                    return (
                                                        <tr key={u.id}
                                                            style={{ borderBottom: "1px solid var(--stroke2)", background: base }}
                                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.05)"}
                                                            onMouseLeave={e => e.currentTarget.style.background = base}>
                                                            <td style={{ padding: "13px 16px", fontFamily: "monospace", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>#{u.id}</td>
                                                            <td style={{ padding: "13px 16px" }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${isAdmin ? "#6333ff" : "#0da6f2"},${isAdmin ? "#0da6f2" : "#10b981"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                                                        {(u.name || u.email || "?")[0].toUpperCase()}
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 13 }}>{u.name || "—"}</div>
                                                                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{u.email}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: "13px 16px" }}>
                                                                <span style={{
                                                                    background: isAdmin ? "rgba(99,51,255,0.12)" : "rgba(13,166,242,0.1)",
                                                                    color: isAdmin ? "#8b5cf6" : "#0da6f2",
                                                                    border: `1px solid ${isAdmin ? "rgba(99,51,255,0.25)" : "rgba(13,166,242,0.25)"}`,
                                                                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800
                                                                }}>{u.role}</span>
                                                            </td>
                                                            <td style={{ padding: "13px 16px", color: "var(--muted)", fontWeight: 600 }}>{u.currency}</td>
                                                            <td style={{ padding: "13px 16px", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                                                                {fmtNum(u.balance)} <span style={{ fontSize: 10, color: "var(--muted)" }}>{u.currency}</span>
                                                            </td>
                                                            <td style={{ padding: "13px 16px", color: "#10b981", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                                                +{fmtNum(u.profit_total)} <span style={{ fontSize: 10, color: "rgba(16,185,129,0.7)" }}>{u.currency}</span>
                                                            </td>
                                                            <td style={{ padding: "13px 16px" }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                    <span style={{
                                                                        background: "rgba(20,184,166,0.1)",
                                                                        border: "1px solid rgba(20,184,166,0.3)",
                                                                        color: "#14b8a6",
                                                                        borderRadius: 6, padding: "3px 8px",
                                                                        fontSize: 11, fontWeight: 700,
                                                                        fontVariantNumeric: "tabular-nums",
                                                                        display: "flex", alignItems: "center", gap: 4
                                                                    }}>
                                                                        <span style={{ fontSize: 10, opacity: 0.7 }}>$</span>
                                                                        {fmtNum(u.total_invested)}
                                                                    </span>
                                                                    <button
                                                                        title="Resetear inversión total"
                                                                        disabled={saving || !u.total_invested || Number(u.total_invested) === 0}
                                                                        onClick={async () => {
                                                                            if (!window.confirm(`¿Resetear la inversión total de ${u.name || u.email}? El saldo no se verá afectado.`)) return;
                                                                            try { await doResetInvestment(u.id); }
                                                                            catch { }
                                                                        }}
                                                                        style={{
                                                                            background: "rgba(239,68,68,0.08)",
                                                                            color: Number(u.total_invested) > 0 ? "#ef4444" : "var(--muted)",
                                                                            border: `1px solid ${Number(u.total_invested) > 0 ? "rgba(239,68,68,0.3)" : "var(--stroke2)"}`,
                                                                            borderRadius: 6, padding: "3px 8px",
                                                                            fontSize: 11, fontWeight: 700,
                                                                            cursor: Number(u.total_invested) > 0 ? "pointer" : "default",
                                                                            opacity: Number(u.total_invested) > 0 ? 1 : 0.35,
                                                                            fontFamily: "var(--font)",
                                                                            transition: "all 0.2s",
                                                                        }}
                                                                    >🗑</button>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: "13px 16px" }}>
                                                                <button onClick={() => setHistoryUser(u)}
                                                                    style={{ background: "rgba(13,166,242,0.08)", color: "#0da6f2", border: "1px solid rgba(13,166,242,0.25)", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}>
                                                                    Ver historial
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    {!loading && total > 0 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: "1px solid var(--stroke)", background: "rgba(0,0,0,0.15)" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12 }}>
                                                <span>Filas:</span>
                                                <div style={{ position: "relative" }}>
                                                    <select style={selStyle} value={limit} onChange={e => loadUsers(1, Number(e.target.value))}>
                                                        {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                    <span style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", fontSize: 8, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                                </div>
                                                <span>· {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} de {total}</span>
                                            </div>
                                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                                <button className="btn-ghost" disabled={page <= 1 || loading} onClick={() => loadUsers(page - 1, limit)}
                                                    style={{ width: "auto", padding: "6px 14px", fontSize: 12, borderRadius: 8, opacity: page <= 1 ? 0.35 : 1 }}>
                                                    ← Anterior
                                                </button>
                                                <span style={{ fontSize: 13, color: "var(--text)" }}>Página <b style={{ color: "#0da6f2" }}>{page}</b> / {totalPages || 1}</span>
                                                <button className="btn-ghost" disabled={page >= totalPages || loading} onClick={() => loadUsers(page + 1, limit)}
                                                    style={{ width: "auto", padding: "6px 14px", fontSize: 12, borderRadius: 8, opacity: page >= totalPages ? 0.35 : 1 }}>
                                                    Siguiente →
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB: Crear */}
                            {activeTab === "create" && (
                                <CreateUserCard saving={saving} onCreate={doCreateUser} />
                            )}

                            {/* TAB: Saldo */}
                            {activeTab === "balance" && (
                                <TopupCard
                                    users={allUsers} usersById={usersById}
                                    saving={saving} onTopup={doTopup} onAdjustProfit={doAdjustProfit}
                                    onAdjustInvested={doAdjustInvested}
                                />
                            )}

                            {/* TAB: Contraseña */}
                            {activeTab === "password" && (
                                <ChangePasswordCard users={allUsers} saving={saving} onChangePassword={doChangePassword} />
                            )}

                            {/* TAB: Moneda */}
                            {activeTab === "currency" && (
                                <ChangeCurrencyCard users={allUsers} saving={saving} onUpdateCurrency={doUpdateCurrency} />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            {/* ── History Modal ── */}
            <AnimatePresence>
                {historyUser && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, padding: 20 }}
                        onClick={e => { if (e.target === e.currentTarget) setHistoryUser(null); }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                            style={{ width: "100%", maxWidth: 820, background: "#0d1117", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.8)" }}>
                            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>📋 Historial de transacciones</h2>
                                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--muted)" }}>{historyUser.email}</p>
                                </div>
                                <button onClick={() => setHistoryUser(null)}
                                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "var(--font)", fontWeight: 600, fontSize: 13 }}>
                                    ✕ Cerrar
                                </button>
                            </div>
                            <div style={{ padding: 20, overflowY: "auto" }}>
                                <TransactionsList userId={historyUser.id} fetchFn={fetchAdminWalletTransactions} />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
