export default function IconBadge({ icon, tone = "accent" }) {
    const TONES = {
        blue: "#3b82f6",
        emerald: "#10b981",
        violet: "#8b5cf6",
        amber: "#f59e0b",
        pink: "#ec4899",
        cyan: "#06b6d4",
        orange: "#f97316",
        lime: "#84cc16",
        red: "#ef4444",
        indigo: "#6366f1",
        fuchsia: "#d946ef",
        sky: "#0ea5e9",
        rose: "#f43f5e",
        teal: "#14b8a6",
        green: "#22c55e",
    };

    const color = TONES[tone] || "#7c3aed";
    const toneColor = `${color}25`; // 15% opacity
    const border = `${color}45`;    // 27% opacity

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
