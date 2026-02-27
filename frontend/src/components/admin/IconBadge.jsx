export default function IconBadge({ icon, tone = "accent" }) {
    const toneColor =
        tone === "green"
            ? "rgba(34,197,94,.18)"
            : tone === "blue"
                ? "rgba(59,130,246,.18)"
                : tone === "orange"
                    ? "rgba(245,158,11,.18)"
                    : "rgba(124,92,255,.18)";

    const border =
        tone === "green"
            ? "rgba(34,197,94,.28)"
            : tone === "blue"
                ? "rgba(59,130,246,.28)"
                : tone === "orange"
                    ? "rgba(245,158,11,.28)"
                    : "rgba(124,92,255,.28)";

    return (
        <div
            style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background: toneColor,
                border: `1px solid ${border}`,
                fontSize: 18,
                flex: "0 0 auto",
            }}
        >
            {icon}
        </div>
    );
}
