export default function NavItem({ title, hint, to, onNavigate }) {
    return (
        <div className="nav-item" onClick={() => onNavigate(to)}>
            <div style={{ minWidth: 0 }}>
                <div className="label">{title}</div>
                <div className="hint">{hint}</div>
            </div>
            <div className="arrow">→</div>
        </div>
    );
}
