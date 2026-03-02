import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/auth.css";
import "./styles/adminSupport.css";

import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

// ✅ Limpieza legacy (tokens + user) para que NO se vea nada de sesión en localStorage
try {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
} catch { }

// Aplica el tema lo antes posible (evita "flash") — DARK por defecto siempre
const savedTheme = localStorage.getItem("theme");
const initialTheme = (savedTheme === "light" || savedTheme === "dark") ? savedTheme : "dark";
document.documentElement.setAttribute("data-theme", initialTheme);

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <App />
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);
