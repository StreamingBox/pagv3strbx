import IconBadge from "./IconBadge.jsx";

export default function NavItem({ icon, tone, title, hint, to, onNavigate }) {
    return (
        <div className="nav-item" onClick={() => onNavigate(to)}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <IconBadge icon={icon} tone={tone} />
                <div style={{ minWidth: 0 }}>
                    <div className="label">{title}</div>
                    <div className="hint">{hint}</div>
                </div>
            </div>
            <div className="arrow">→</div>
        </div>
    );
}
