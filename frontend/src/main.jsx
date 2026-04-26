import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./styles/auth.css";
import "./styles/adminSupport.css";

import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { clearLegacySession } from "./api/api.js";

// ✅ Limpieza legacy (tokens + user) para que NO se vea nada de sesión en localStorage
function getInitialTheme() {
    try {
        const savedTheme = localStorage.getItem("sb-theme");
        return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
    } catch {
        return "dark";
    }
}

clearLegacySession();

// Aplica el tema lo antes posible (evita "flash") — DARK por defecto siempre
const initialTheme = getInitialTheme();
document.documentElement.setAttribute("data-theme", initialTheme);

if (import.meta.env.DEV && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
            if (registration.scope === `${window.location.origin}/`) {
                registration.unregister().catch(() => {});
            }
        });
    }).catch(() => {});
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
            console.error("[pwa] No se pudo registrar el service worker:", error);
        });
    });
}

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <App />
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);
