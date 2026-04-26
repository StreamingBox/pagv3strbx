import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import FullPageLoader from "../components/app/FullPageLoader.jsx";

export default function ProtectedRoute({ children, role, roles }) {
    const { user, authLoading } = useAuth();

    // ⏳ Mientras se consulta /auth/me (cookies)
    if (authLoading) return <FullPageLoader label="Validando sesion..." />;

    // ❌ Sin sesión
    if (!user?.id) return <Navigate to="/" replace />;

    // roles opcional (array)
    const userRole = String(user?.role || "").toLowerCase();

    if (Array.isArray(roles) && roles.length) {
        const allowed = roles.map((r) => String(r).toLowerCase());
        if (!allowed.includes(userRole)) return <Navigate to="/dashboard" replace />;
    }

    // role opcional (string)
    if (role && userRole !== String(role).toLowerCase()) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}
