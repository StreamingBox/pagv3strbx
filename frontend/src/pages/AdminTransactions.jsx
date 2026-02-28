import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminGlobalTransactions, fetchUsers } from "../api/adminUsersApi";
import TransactionsList from "../components/wallet/TransactionsList";

export default function AdminTransactions() {
    const navigate = useNavigate();
    const [allUsers, setAllUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                // Fetch up to 1000 users for the dropdown
                const uData = await fetchUsers({ page: 1, limit: 1000 });
                setAllUsers(uData.items || []);
            } catch (error) {
                console.error("Error loading users for filter:", error);
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
                <aside className="sidebar">
                    <div className="nav-title">Admin</div>
                    <p className="nav-sub">Transacciones Globales</p>

                    <div className="nav-item" onClick={() => navigate("/admin")}>
                        <span>Volver al panel</span>
                        <span style={{ opacity: 0.7 }}>→</span>
                    </div>
                </aside>

                <main className="main">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                        <div>
                            <h1 style={{ margin: 0 }}>Transacciones Globales</h1>
                            <p style={{ marginTop: 6, color: "rgba(234,241,255,.65)" }}>
                                Visualiza y filtra todas las transacciones de saldo y ganancias de la plataforma.
                            </p>
                        </div>
                    </div>

                    <TransactionsList
                        fetchFn={fetchAdminGlobalTransactions}
                        users={allUsers}
                    />
                </main>
            </div>
        </div>
    );
}
