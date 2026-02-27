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

        // 2) Preferencia del sistema
        const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
        const defaultTheme = prefersLight ? "light" : "dark";

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
