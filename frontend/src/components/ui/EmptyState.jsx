export default function EmptyState({ icon = "📭", title, subtitle, action }) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            textAlign: "center",
            minHeight: 200,
        }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>{icon}</div>
            <h3 style={{
                margin: "0 0 8px 0",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text)",
            }}>
                {title}
            </h3>
            {subtitle && (
                <p style={{
                    margin: "0 0 16px 0",
                    fontSize: 13,
                    color: "var(--muted)",
                    maxWidth: 320,
                    lineHeight: 1.5,
                }}>
                    {subtitle}
                </p>
            )}
            {action && <div style={{ marginTop: 8 }}>{action}</div>}
        </div>
    );
}
