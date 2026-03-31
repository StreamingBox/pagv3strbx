import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { getApiBase } from "../config/apiBase.js";

export default function CredentialRedirect() {
    const { token } = useParams();

    useEffect(() => {
        const API_BASE = getApiBase();
        // Eliminar posibles slashes finales
        let base = String(API_BASE).replace(/\/+$/, "");
        // Ya no cortamos /api. Redireccionamos a VITE_API_BASE/s/token directamente
        // porque en el backend agregamos app.use("/api", shareRoutes) para evadir NGINX.
        const redirectUrl = `${base}/s/${token}`;

        // Redirigir el navegador forzosamente a la URL del backend
        window.location.replace(redirectUrl);
    }, [token]);

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "white", background: "#060606", fontFamily: "sans-serif" }}>
            <p>Redirigiendo a tu cuenta segura...</p>
        </div>
    );
}
