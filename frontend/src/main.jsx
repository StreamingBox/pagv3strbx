import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./styles/auth.css";
import "./styles/adminSupport.css";

import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { clearLegacySession } from "./api/api.js";
import { queryClient } from "./queryClient.js";

const ReactQueryDevtoolsLazy = import.meta.env.DEV
    ? React.lazy(() =>
        import("@tanstack/react-query-devtools").then((module) => ({
            default: module.ReactQueryDevtools,
        }))
    )
    : null;

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
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </BrowserRouter>
            {ReactQueryDevtoolsLazy ? (
                <React.Suspense fallback={null}>
                    <ReactQueryDevtoolsLazy initialIsOpen={false} />
                </React.Suspense>
            ) : null}
        </QueryClientProvider>
    </React.StrictMode>
);
