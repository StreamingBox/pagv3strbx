export default function FullPageLoader({ label = "Cargando..." }) {
    return (
        <div
            className="page-shell"
            style={{
                minHeight: "100dvh",
                display: "grid",
                placeItems: "center",
                padding: 24,
            }}
        >
            <div className="page-shell-bg" aria-hidden="true">
                <div className="bg-grid" />
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
            </div>
            <div
                style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    borderRadius: 14,
                    border: "1px solid var(--stroke)",
                    background: "var(--card)",
                    boxShadow: "var(--shadow)",
                }}
            >
                <span className="spinner" aria-hidden="true" />
                <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 700 }}>
                    {label}
                </span>
            </div>
        </div>
    );
}
