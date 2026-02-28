import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Orders from "./pages/Orders.jsx";
import AdminCategories from "./pages/AdminCategories.jsx";

import ProtectedRoute from "./routes/ProtectedRoute.jsx";

import AdminUsers from "./pages/AdminUsers.jsx";
import AdminTransactions from "./pages/AdminTransactions.jsx";
import AdminPlatforms from "./pages/AdminPlatforms.jsx";
import AdminAccounts from "./pages/AdminAccounts.jsx";
import AdminOrders from "./pages/AdminOrders.jsx";
import AdminPrices from "./pages/AdminPrices.jsx";
import AdminInventory from "./pages/AdminInventory.jsx";
import AdminDurations from "./pages/AdminDurations.jsx";
import AdminAnalytics from "./pages/AdminAnalytics.jsx";

import Codes from "./pages/Codes.jsx";
import AdminCodeLogs from "./pages/AdminCodeLogs.jsx";

import { useAuth } from "./context/AuthContext.jsx";
import AdminSupport from "./pages/AdminSupport.jsx";
import Wallet from "./pages/Wallet.jsx";
import CredentialRedirect from "./pages/CredentialRedirect.jsx";
import UserAnalyticsPage from "./pages/UserAnalyticsPage.jsx";
import AdminRenewals from "./pages/AdminRenewals.jsx";
import UserExpirations from "./pages/UserExpirations.jsx";
import AdminExpirations from "./pages/AdminExpirations.jsx";

/* ==========================================
   Redirección automática por rol
========================================== */
function RedirectByRole() {
    const { user, authLoading } = useAuth();

    if (authLoading) return null;

    if (!user?.id) return <Navigate to="/" replace />;

    const role = String(user?.role || "user").toLowerCase();
    if (role === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/dashboard" replace />;
}

/* ==========================================
   APP ROUTES
========================================== */
export default function App() {
    return (
        <Routes>
            {/* ================= Login ================= */}
            <Route path="/" element={<Login />} />

            {/* ================= Dashboard ================= */}
            <Route
                path="/dashboard"
                element={
                    <ProtectedRoute roles={["admin", "user"]}>
                        <Dashboard />
                    </ProtectedRoute>
                }
            />

            {/* ================= Wallet (Binance Pay) ================= */}
            <Route
                path="/wallet"
                element={
                    <ProtectedRoute roles={["admin", "user"]}>
                        <Wallet />
                    </ProtectedRoute>
                }
            />

            {/* ================= Orders ================= */}
            <Route
                path="/orders"
                element={
                    <ProtectedRoute roles={["admin", "user"]}>
                        <Orders />
                    </ProtectedRoute>
                }
            />

            {/* ================= User Analytics ================= */}
            <Route
                path="/analytics"
                element={
                    <ProtectedRoute roles={["admin", "user"]}>
                        <UserAnalyticsPage />
                    </ProtectedRoute>
                }
            />

            {/* ================= Codes ================= */}
            <Route
                path="/codes"
                element={
                    <ProtectedRoute roles={["admin", "user"]}>
                        <Codes />
                    </ProtectedRoute>
                }
            />

            {/* ================= Admin Home ================= */}
            <Route
                path="/admin"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <Admin />
                    </ProtectedRoute>
                }
            />

            {/* ================= Admin Sections ================= */}
            <Route
                path="/admin/users"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminUsers />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/renewals"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminRenewals />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/analytics"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminAnalytics />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/transactions"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminTransactions />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/platforms"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminPlatforms />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/categories"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminCategories />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/accounts"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminAccounts />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/orders"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminOrders />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/prices"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminPrices />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/inventory"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminInventory />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/durations"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminDurations />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/code-logs"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminCodeLogs />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/expirations"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminExpirations />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/admin/support"
                element={
                    <ProtectedRoute roles={["admin"]}>
                        <AdminSupport />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/expirations"
                element={
                    <ProtectedRoute roles={["admin", "user"]}>
                        <UserExpirations />
                    </ProtectedRoute>
                }
            />

            {/* ================= Shared Credentials (Redirección al Backend) ================= */}
            <Route path="/s/:token" element={<CredentialRedirect />} />

            {/* ================= Catch-all (SIEMPRE al final) ================= */}
            <Route path="*" element={<RedirectByRole />} />
        </Routes>
    );
}
