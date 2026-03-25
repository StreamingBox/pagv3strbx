import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogout, clearLegacySession } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function useAppLogout() {
    const navigate = useNavigate();
    const { setUser } = useAuth();

    return useCallback(async () => {
        try {
            await apiLogout();
        } catch (error) {
            console.error(error);
        } finally {
            setUser(null);
            clearLegacySession();
            navigate("/", { replace: true });
        }
    }, [navigate, setUser]);
}
