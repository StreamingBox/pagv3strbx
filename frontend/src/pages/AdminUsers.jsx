import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminUsers } from "../hooks/useAdminUsers";
import { fetchAdminWalletTransactions } from "../api/adminUsersApi";

import CreateUserCard from "../components/adminUsers/CreateUserCard";
import TopupCard from "../components/adminUsers/TopupCard";
import ChangePasswordCard from "../components/adminUsers/ChangePasswordCard";
import ChangeCurrencyCard from "../components/adminUsers/ChangeCurrencyCard";
import UsersTable from "../components/adminUsers/UsersTable";
import TransactionsList from "../components/wallet/TransactionsList";

export default function AdminUsers() {
    const navigate = useNavigate();
    const [historyUser, setHistoryUser] = useState(null);

    const {
        users,
        allUsers,
        usersById,
        loading,
        saving,
        error,
        page,
        limit,
        total,
        totalPages,
        stats,
        loadUsers,
        doTopup,
        doAdjustProfit,
        doCreateUser,
        doChangePassword,
        doUpdateCurrency,
    } = useAdminUsers();

    return (
        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Usuarios & Monedero</p>

                    <div className="nav-item" onClick={() => navigate("/admin")}>
                        <span>Volver al panel</span>
                        <span style={{ opacity: 0.7 }}>→</span>
                    </div>

                    <button
                        className="btn-ghost"
                        style={{ width: "100%", marginTop: 10 }}
                        onClick={() => loadUsers(1, limit)}
                        disabled={loading}
                    >
                        {loading ? "Cargando..." : "Refrescar"}
                    </button>
                </aside>

                <main className="main">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <h1 style={{ margin: 0 }}>Usuarios</h1>
                            <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                                Crear usuarios, cambiar contraseña, recargar saldo y ajustar ganancias.
                            </p>
                        </div>

                        <div style={{ display: "flex", gap: 12 }}>
                            {stats.map(s => (
                                <div key={s.currency} className="kpi" style={{ minWidth: 160, padding: "12px 20px" }}>
                                    <div style={{ fontSize: 13, color: "rgba(234,241,255,.65)", marginBottom: 4 }}>Ganancia ({s.currency})</div>
                                    <div style={{ fontSize: 22, fontWeight: 900 }}>
                                        {Number(s.total_profit).toLocaleString()} {s.currency}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {error ? <div className="error">{error}</div> : null}

                    <CreateUserCard saving={saving} onCreate={doCreateUser} />

                    <TopupCard
                        users={allUsers}
                        usersById={usersById}
                        saving={saving}
                        onTopup={doTopup}
                        onAdjustProfit={doAdjustProfit}
                    />

                    <ChangePasswordCard users={allUsers} saving={saving} onChangePassword={doChangePassword} />
                    <ChangeCurrencyCard users={allUsers} saving={saving} onUpdateCurrency={doUpdateCurrency} />

                    <UsersTable
                        users={users}
                        loading={loading}
                        page={page}
                        limit={limit}
                        total={total}
                        totalPages={totalPages}
                        loadUsers={loadUsers}
                        onViewHistory={setHistoryUser}
                    />

                    {historyUser && (
                        <div style={{
                            position: "fixed",
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: "rgba(0,0,0,0.8)",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            zIndex: 9999,
                            padding: 20
                        }}>
                            <div style={{
                                width: "100%",
                                maxWidth: 800,
                                backgroundColor: "#0f172a",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.1)",
                                maxHeight: "90vh",
                                display: "flex",
                                flexDirection: "column"
                            }}>
                                <div style={{
                                    padding: "16px 20px",
                                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center"
                                }}>
                                    <h2 style={{ margin: 0, fontSize: 18 }}>
                                        Historial de {historyUser.email}
                                    </h2>
                                    <button
                                        className="btn-ghost"
                                        style={{ padding: "4px 12px" }}
                                        onClick={() => setHistoryUser(null)}
                                    >
                                        Cerrar
                                    </button>
                                </div>
                                <div style={{ padding: 20, overflowY: "auto" }}>
                                    <TransactionsList
                                        userId={historyUser.id}
                                        fetchFn={fetchAdminWalletTransactions}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
