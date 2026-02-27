import { useNavigate } from "react-router-dom";
import { useAdminUsers } from "../hooks/useAdminUsers";

import CreateUserCard from "../components/adminUsers/CreateUserCard";
import TopupCard from "../components/adminUsers/TopupCard";
import ChangePasswordCard from "../components/adminUsers/ChangePasswordCard";
import ChangeCurrencyCard from "../components/adminUsers/ChangeCurrencyCard";
import UsersTable from "../components/adminUsers/UsersTable";

export default function AdminUsers() {
    const navigate = useNavigate();

    const {
        users,
        usersById,
        loading,
        saving,
        error,
        loadUsers,
        doTopup,
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
                        onClick={loadUsers}
                        disabled={loading}
                    >
                        {loading ? "Cargando..." : "Refrescar"}
                    </button>
                </aside>

                <main className="main">
                    <h1 style={{ margin: 0 }}>Usuarios</h1>
                    <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                        Crear usuarios, cambiar contraseña, recargar saldo y cambiar moneda.
                    </p>

                    {error ? <div className="error">{error}</div> : null}

                    <CreateUserCard saving={saving} onCreate={doCreateUser} />
                    <TopupCard users={users} usersById={usersById} saving={saving} onTopup={doTopup} />
                    <ChangePasswordCard users={users} saving={saving} onChangePassword={doChangePassword} />
                    <ChangeCurrencyCard users={users} saving={saving} onUpdateCurrency={doUpdateCurrency} />

                    <UsersTable users={users} loading={loading} />
                </main>
            </div>
        </div>
    );
}
