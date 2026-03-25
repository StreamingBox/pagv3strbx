import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { apiLogout } from "../api/api";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import UserAnalytics from "../components/analytics/UserAnalytics";

import "../styles/dashboard.css";
import "../styles/dashboard-stitch.css";

export default function UserAnalyticsPage() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        navigate("/", { replace: true });
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={null}
                    cartCount={0}
                    onOpenCart={() => { }}
                    onGoOrders={() => navigate("/orders")}
                    onGoWallet={() => navigate("/wallet")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoCodes={() => navigate("/codes")}
                    onGoCodeLogs={() => navigate("/admin/code-logs")}
                    onGoAdmin={() => navigate("/admin")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                <main className="main">
                    <UserAnalytics />
                </main>
            </div>
        </div>
    );
}
