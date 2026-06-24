import { useEffect, useRef, useState } from "react";

function CustomPlatformSelect({ value, onChange, platforms, selStyle }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filtered = platforms.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    const currentName = value === "all" ? "Todas las plataformas" : (platforms.find(p => p.slug === value)?.name || "Seleccionar...");

    return (
        <div ref={dropdownRef} style={{ position: "relative", width: "100%", height: "100%" }}>
            <div
                style={{ ...selStyle, display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%", userSelect: "none" }}
                onClick={() => { setOpen(!open); setSearch(""); }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentName}
                </span>
                <span style={{ fontSize: 10, color: "var(--muted)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
            </div>

            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "var(--bg1)", border: "1px solid var(--stroke)", borderRadius: 12,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 100, overflow: "hidden",
                    display: "flex", flexDirection: "column"
                }}>
                    <input
                        type="text"
                        autoFocus
                        placeholder="Buscar plataforma..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            background: "rgba(0,0,0,0.2)", border: "none", borderBottom: "1px solid var(--stroke)",
                            padding: "12px 14px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", fontFamily: "var(--font)"
                        }}
                    />
                    <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
                        <div
                            style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: value === "all" ? "rgba(13,166,242,0.1)" : "transparent", color: value === "all" ? "var(--accent)" : "var(--text)", transition: "background 0.1s" }}
                            onClick={() => { onChange("all"); setOpen(false); }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                            onMouseLeave={e => e.currentTarget.style.background = value === "all" ? "rgba(13,166,242,0.1)" : "transparent"}
                        >
                            Todas las plataformas
                        </div>
                        {filtered.map(p => (
                            <div
                                key={p.id}
                                style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, background: value === p.slug ? "rgba(13,166,242,0.1)" : "transparent", color: value === p.slug ? "var(--accent)" : "var(--text)", transition: "background 0.1s" }}
                                onClick={() => { onChange(p.slug); setOpen(false); }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                                onMouseLeave={e => e.currentTarget.style.background = value === p.slug ? "rgba(13,166,242,0.1)" : "transparent"}
                            >
                                {p.name}
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ padding: "16px 14px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>No hay coincidencias</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Componente de grupo por cuenta ─────────────────────────────────────────

export default CustomPlatformSelect;
