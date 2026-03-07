import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import Auth from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import CredentialRedirect from "./pages/CredentialRedirect.jsx";

// ─── Lazy imports (admin + menos frecuentes) ───────────────────────────
const Admin = lazy(() => import("./pages/Admin.jsx"));
const AdminUsers = lazy(() => import("./pages/AdminUsers.jsx"));
const AdminTransactions = lazy(() => import("./pages/AdminTransactions.jsx"));
const AdminPlatforms = lazy(() => import("./pages/AdminPlatforms.jsx"));
const AdminAccounts = lazy(() => import("./pages/AdminAccounts.jsx"));
const AdminOrders = lazy(() => import("./pages/AdminOrders.jsx"));
const AdminPrices = lazy(() => import("./pages/AdminPrices.jsx"));
const AdminInventory = lazy(() => import("./pages/AdminInventory.jsx"));
const AdminDurations = lazy(() => import("./pages/AdminDurations.jsx"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics.jsx"));
const AdminCategories = lazy(() => import("./pages/AdminCategories.jsx"));
const AdminCodeLogs = lazy(() => import("./pages/AdminCodeLogs.jsx"));
const AdminCodeRequests = lazy(() => import("./pages/AdminCodeRequests.jsx"));
const AdminSupport = lazy(() => import("./pages/AdminSupport.jsx"));
const AdminRenewals = lazy(() => import("./pages/AdminRenewals.jsx"));
const AdminExpirations = lazy(() => import("./pages/AdminExpirations.jsx"));
const AdminStockNotify = lazy(() => import("./pages/AdminStockNotify.jsx"));
const Codes = lazy(() => import("./pages/Codes.jsx"));
const Orders = lazy(() => import("./pages/Orders.jsx"));
const Wallet = lazy(() => import("./pages/Wallet.jsx"));
const UserAnalyticsPage = lazy(() => import("./pages/UserAnalyticsPage.jsx"));
const UserExpirations = lazy(() => import("./pages/UserExpirations.jsx"));

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
        <Suspense fallback={null}>
            <Routes>
                {/* ================= Login / Register ================= */}
                <Route path="/" element={<Auth />} />
                <Route path="/register" element={<Auth />} />

                {/* ================= Dashboard ================= */}
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute roles={["admin", "user"]}>
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />

                {/* ================= Wallet ================= */}
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
                    path="/admin/code-requests"
                    element={
                        <ProtectedRoute roles={["admin"]}>
                            <AdminCodeRequests />
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
                    path="/admin/stock-notify"
                    element={
                        <ProtectedRoute roles={["admin"]}>
                            <AdminStockNotify />
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
        </Suspense>
    );
}

