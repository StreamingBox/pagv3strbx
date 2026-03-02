import { useEffect, useState } from "react";

export default function useTheme() {
    const [theme, setTheme] = useState("dark");

    useEffect(() => {
        // 1) Preferencia guardada
        const saved = localStorage.getItem("theme");
        if (saved === "light" || saved === "dark") {
            setTheme(saved);
            document.documentElement.setAttribute("data-theme", saved);
            return;
        }

        // 2) App siempre inicia en dark por defecto (plataforma de streaming premium)
        const defaultTheme = "dark";

        setTheme(defaultTheme);
        document.documentElement.setAttribute("data-theme", defaultTheme);
    }, []);

    function setThemeAndPersist(next) {
        setTheme(next);
        localStorage.setItem("theme", next);
        document.documentElement.setAttribute("data-theme", next);
    }

    function toggleTheme() {
        setThemeAndPersist(theme === "dark" ? "light" : "dark");
    }

    return { theme, toggleTheme, setTheme: setThemeAndPersist };
}
