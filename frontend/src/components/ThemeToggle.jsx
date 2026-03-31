import useTheme from "../hooks/useTheme";

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    const isDark = theme === "dark";

    return (
        <button
            className="btn-ghost"
            onClick={toggleTheme}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 999,
            }}
            title="Cambiar tema"
        >
            <span style={{ fontSize: 16 }}>{isDark ? "🌙" : "☀️"}</span>
            <span style={{ fontWeight: 900, fontSize: 13, color: "var(--text)" }}>
                {isDark ? "Oscuro" : "Claro"}
            </span>
        </button>
    );
}
