import { useState, useRef, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * DarkSelect — dropdown custom 100% oscuro con buscador
 * Props:
 *   options    : [{ value, label }]
 *   value      : string | number
 *   onChange   : (value) => void
 *   placeholder: string
 *   searchable : bool (default true si options.length > 5)
 *   disabled   : bool
 *   style      : object extra para el trigger
 */
export default function DarkSelect({ options = [], value, onChange, placeholder = "Seleccionar...", searchable, disabled = false, style = {} }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef(null);
    const searchRef = useRef(null);

    const showSearch = searchable !== false && (searchable === true || options.length > 5);
    const selected = options.find(o => String(o.value) === String(value));

    const filtered = useMemo(() => {
        if (!search.trim()) return options;
        const q = search.toLowerCase();
        return options.filter(o => o.label.toLowerCase().includes(q));
    }, [options, search]);

    useEffect(() => {
        function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
        document.addEventListener("mousedown", onOut);
        return () => document.removeEventListener("mousedown", onOut);
    }, []);

    useEffect(() => {
        if (open && showSearch && searchRef.current) searchRef.current.focus();
    }, [open, showSearch]);

    function toggleOpen() {
        setOpen((current) => {
            const next = !current;
            if (next) setSearch("");
            return next;
        });
    }

    const triggerBase = {
        appearance: "none", width: "100%", height: 42, padding: "0 36px 0 14px",
        background: "var(--bg0)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 10,
        fontSize: 14, fontWeight: 500, outline: "none",
        fontFamily: "var(--font)", cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left", display: "flex", alignItems: "center",
        transition: "border-color 0.2s, box-shadow 0.2s",
        ...(open ? { borderColor: "#0da6f2", boxShadow: "0 0 0 3px rgba(13,166,242,0.12)" } : {}),
        opacity: disabled ? 0.5 : 1,
        ...style,
    };

    return (
        <div ref={ref} style={{ position: "relative", width: "100%" }}>
            <button type="button" disabled={disabled} onClick={() => !disabled && toggleOpen()} style={triggerBase}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "var(--text)" : "var(--muted)" }}>
                    {selected ? selected.label : placeholder}
                </span>
                <span style={{ position: "absolute", right: 12, fontSize: 10, color: "var(--muted)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>▼</span>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -4, scaleY: 0.95 }}
                        transition={{ duration: 0.12 }}
                        style={{
                            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                            background: "#131920", border: "1px solid rgba(13,166,242,0.25)",
                            borderRadius: 12, zIndex: 9999,
                            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                            overflow: "hidden", transformOrigin: "top center",
                        }}
                    >
                        {showSearch && (
                            <div style={{ padding: "10px 10px 6px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar..."
                                    onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
                                    style={{
                                        width: "100%", height: 34, padding: "0 12px",
                                        background: "rgba(255,255,255,0.05)", color: "var(--text)",
                                        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                                        fontSize: 13, outline: "none", fontFamily: "var(--font)", boxSizing: "border-box",
                                    }}
                                />
                            </div>
                        )}
                        <div style={{ maxHeight: 260, overflowY: "auto" }}>
                            {filtered.length === 0 ? (
                                <div style={{ padding: "14px 16px", color: "var(--muted)", fontSize: 13 }}>Sin resultados</div>
                            ) : filtered.map(o => {
                                const isActive = String(o.value) === String(value);
                                return (
                                    <div key={o.value}
                                        onClick={() => { onChange(String(o.value)); setOpen(false); }}
                                        style={{
                                            padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500,
                                            color: isActive ? "#0da6f2" : "var(--text)",
                                            background: isActive ? "rgba(13,166,242,0.08)" : "transparent",
                                            transition: "background 0.1s",
                                            display: "flex", alignItems: "center", gap: 8,
                                        }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = isActive ? "rgba(13,166,242,0.08)" : "transparent"; }}
                                    >
                                        {isActive && <span style={{ fontSize: 11, flexShrink: 0 }}>✓</span>}
                                        <span>{o.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
