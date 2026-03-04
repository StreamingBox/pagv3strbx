import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const inputStyle = {
    appearance: "none", height: 42, padding: "0 14px",
    background: "var(--bg0)", color: "var(--text)",
    border: "1px solid var(--stroke)", borderRadius: 10,
    fontSize: 14, fontWeight: 500, outline: "none", width: "100%",
    fontFamily: "var(--font)", transition: "border-color 0.2s",
};

/* ─── Custom dark dropdown ─── */
function CustomSelect({ options, value, onChange, placeholder = "Seleccionar...", disabled = false }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef(null);
    const searchRef = useRef(null);

    const selected = options.find(o => String(o.value) === String(value));

    const filtered = useMemo(() => {
        if (!search.trim()) return options;
        const q = search.toLowerCase();
        return options.filter(o => o.label.toLowerCase().includes(q));
    }, [options, search]);

    useEffect(() => {
        function onClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    useEffect(() => {
        if (open && searchRef.current) {
            searchRef.current.focus();
            setSearch("");
        }
    }, [open]);

    return (
        <div ref={ref} style={{ position: "relative", width: "100%" }}>
            {/* Trigger */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(v => !v)}
                style={{
                    ...inputStyle, cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    borderColor: open ? "#0da6f2" : "var(--stroke)",
                    boxShadow: open ? "0 0 0 3px rgba(13,166,242,0.12)" : "none",
                }}
            >
                <span style={{ color: selected ? "var(--text)" : "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {selected ? selected.label : placeholder}
                </span>
                <span style={{ fontSize: 10, marginLeft: 8, color: "var(--muted)", flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>▼</span>
            </button>

            {/* Dropdown panel */}
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
                            borderRadius: 12, zIndex: 9999, overflow: "hidden",
                            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                            transformOrigin: "top center",
                        }}
                    >
                        {/* Search */}
                        <div style={{ padding: "10px 10px 6px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <input
                                ref={searchRef}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar..."
                                style={{
                                    width: "100%", height: 34, padding: "0 12px",
                                    background: "rgba(255,255,255,0.05)", color: "var(--text)",
                                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                                    fontSize: 13, outline: "none", fontFamily: "var(--font)", boxSizing: "border-box",
                                }}
                                onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
                            />
                        </div>
                        {/* Options list */}
                        <div style={{ maxHeight: 280, overflowY: "auto" }}>
                            {filtered.length === 0 ? (
                                <div style={{ padding: "14px 16px", color: "var(--muted)", fontSize: 13 }}>Sin resultados</div>
                            ) : filtered.map(o => (
                                <div
                                    key={o.value}
                                    onClick={() => { onChange(o.value); setOpen(false); }}
                                    style={{
                                        padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500,
                                        color: String(o.value) === String(value) ? "#0da6f2" : "var(--text)",
                                        background: String(o.value) === String(value) ? "rgba(13,166,242,0.08)" : "transparent",
                                        transition: "background 0.1s",
                                    }}
                                    onMouseEnter={e => { if (String(o.value) !== String(value)) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = String(o.value) === String(value) ? "rgba(13,166,242,0.08)" : "transparent"; }}
                                >
                                    {String(o.value) === String(value) && <span style={{ marginRight: 8 }}>✓</span>}
                                    {o.label}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function PricesForm({ platforms, durations, saving, onSaveMulti }) {
    const [platformId, setPlatformId] = useState("");
    const [durationId, setDurationId] = useState("");
    const [isRenewable, setIsRenewable] = useState(false);
    const [priceCOP, setPriceCOP] = useState("");
    const [priceMXN, setPriceMXN] = useState("");
    const [priceUSD, setPriceUSD] = useState("");
    const [success, setSuccess] = useState("");

    const selectedPlatform = useMemo(() => platforms.find(p => String(p.id) === String(platformId)), [platforms, platformId]);
    const selectedDuration = useMemo(() => durations.find(d => String(d.id) === String(durationId)), [durations, durationId]);

    const canSave = useMemo(() => {
        if (!platformId || !durationId) return false;
        return priceCOP !== "" || priceMXN !== "" || priceUSD !== "";
    }, [platformId, durationId, priceCOP, priceMXN, priceUSD]);

    const platformOptions = useMemo(() => platforms.map(p => ({ value: p.id, label: `#${p.id} – ${p.name}` })), [platforms]);
    const durationOptions = useMemo(() => durations.map(d => ({ value: d.id, label: `${d.name} (${d.days} días)` })), [durations]);

    async function handleSave() {
        const prices = {};
        if (priceCOP !== "") prices.COP = Number(priceCOP);
        if (priceMXN !== "") prices.MXN = Number(priceMXN);
        if (priceUSD !== "") prices.USD = Number(priceUSD);

        await onSaveMulti({ platform_id: Number(platformId), duration_id: Number(durationId), prices, is_renewable: isRenewable });

        setPlatformId(""); setDurationId(""); setPriceCOP(""); setPriceMXN(""); setPriceUSD(""); setIsRenewable(false);
        setSuccess("✅ Precios guardados correctamente.");
        setTimeout(() => setSuccess(""), 4000);
    }

    const focus = e => e.target.style.borderColor = "#0da6f2";
    const blur = e => e.target.style.borderColor = "var(--stroke)";

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "22px 24px", marginBottom: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}
        >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>✨</span>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Crear / Actualizar Precio</h3>
                </div>
                {selectedPlatform && selectedDuration && (
                    <span style={{ background: "rgba(13,166,242,0.1)", border: "1px solid rgba(13,166,242,0.3)", color: "#0da6f2", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                        {selectedPlatform.name} / {selectedDuration.name}
                    </span>
                )}
            </div>

            {/* Row 1: Platform + Duration */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Plataforma *</label>
                    <CustomSelect
                        options={platformOptions}
                        value={platformId}
                        onChange={setPlatformId}
                        placeholder="Seleccionar plataforma..."
                    />
                </div>
                <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Duración *</label>
                    <CustomSelect
                        options={durationOptions}
                        value={durationId}
                        onChange={setDurationId}
                        placeholder="Seleccionar duración..."
                    />
                </div>
            </div>

            {/* Row 2: Prices */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                {[
                    { label: "🇨🇴 Precio COP", value: priceCOP, set: setPriceCOP, placeholder: "0" },
                    { label: "🇲🇽 Precio MXN", value: priceMXN, set: setPriceMXN, placeholder: "0" },
                    { label: "🇺🇸 Precio USD", value: priceUSD, set: setPriceUSD, placeholder: "0.00" },
                ].map(f => (
                    <div key={f.label}>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{f.label}</label>
                        <input
                            style={inputStyle} type="number" min="0" placeholder={f.placeholder}
                            value={f.value} onChange={e => f.set(e.target.value)}
                            onFocus={focus} onBlur={blur}
                        />
                    </div>
                ))}
            </div>

            {/* Row 3: Renewable + Save */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}
                    onClick={() => setIsRenewable(v => !v)}>
                    <div style={{
                        width: 42, height: 24, borderRadius: 12,
                        background: isRenewable ? "#0da6f2" : "rgba(255,255,255,0.1)",
                        border: isRenewable ? "1px solid rgba(13,166,242,0.5)" : "1px solid var(--stroke)",
                        position: "relative", transition: "background 0.2s",
                        boxShadow: isRenewable ? "0 0 10px rgba(13,166,242,0.3)" : "none"
                    }}>
                        <div style={{
                            width: 18, height: 18, borderRadius: "50%", background: "white",
                            position: "absolute", top: 2, left: isRenewable ? 20 : 2,
                            transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)"
                        }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>¿Es Renovable?</span>
                    {isRenewable && <span style={{ fontSize: 11, color: "#0da6f2", fontWeight: 700 }}>Sí</span>}
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        Llenar 1, 2 ó 3 monedas — backend hace <b style={{ color: "var(--text)" }}>upsert</b>.
                    </span>
                    <button className="btn" onClick={handleSave} disabled={saving || !canSave}
                        style={{ height: 42, padding: "0 24px", fontSize: 14, fontWeight: 700, borderRadius: 10, whiteSpace: "nowrap" }}>
                        {saving ? "Guardando..." : "💾 Guardar Precios"}
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {success && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ marginTop: 12, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>
                        {success}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
