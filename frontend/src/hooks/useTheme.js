import { useEffect, useState } from "react";

function getStoredTheme() {
    try {
        const saved = localStorage.getItem("sb-theme");
        return saved === "light" || saved === "dark" ? saved : "dark";
    } catch {
        return "dark";
    }
}

export default function useTheme() {
    const [theme, setTheme] = useState(getStoredTheme);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem("sb-theme", theme);
        } catch {
            /* ignore theme persistence failures */
        }
    }, [theme]);

    function setThemeAndPersist(next) {
        setTheme(next);
    }

    function toggleTheme() {
        setThemeAndPersist(theme === "dark" ? "light" : "dark");
    }

    return { theme, toggleTheme, setTheme: setThemeAndPersist };
}
