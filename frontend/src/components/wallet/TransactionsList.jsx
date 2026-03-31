import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DatePicker from "../DatePicker.jsx";

/* ─── Type badge config ─── */
const TYPE_META = {
    purchase: { label: "Compra", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.25)", icon: "🛒" },
    topup: { label: "Recarga", color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.25)", icon: "💳" },
    profit: { label: "Ganancia Venta", color: "#0da6f2", bg: "rgba(13,166,242,0.12)", border: "rgba(13,166,242,0.25)", icon: "💰" },
    adjustment: { label: "Ajuste Admin", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", icon: "⚙️" },
    profit_adj: { label: "Ajuste Ganancia", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.25)", icon: "🔧" },
};

function getType(type) {
    return TYPE_META[type] || { label: type, color: "var(--muted)", bg: "rgba(255,255,255,0.06)", border: "var(--stroke)", icon: "📋" };
}

function TypeBadge({ type }) {
    const { label, color, bg, border, icon } = getType(type);
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 20,
            background: bg, border: `1px solid ${border}`,
            color, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
        }}>
            {icon} {label}
        </span>
    );
}

function AmountCell({ amount }) {
    const val = Number(amount);
    if (val > 0) return (
        <span style={{ color: "#10b981", fontWeight: 800, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 10 }}>▲</span> +{val.toLocaleString("es-CO")}
        </span>
    );
    if (val < 0) return (
        <span style={{ color: "#ef4444", fontWeight: 800, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 10 }}>▼</span> {val.toLocaleString("es-CO")}
        </span>
    );
    return <span style={{ fontWeight: 600 }}>0</span>;
}

/* ─── Searchable User Dropdown ─── */
function UserDropdown({ users, value, onChange, onClose }) {
    const [search, setSearch] = useState("");
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current?.focus(); }, []);

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        String(u.id).includes(search)
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0,
                width: 300, zIndex: 300,
                background: "var(--card)", backdropFilter: "blur(20px)",
                border: "1px solid var(--stroke)", borderRadius: 16, overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
        >
            {/* Search */}
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--stroke2)" }}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "var(--bg0)", border: "1px solid var(--stroke)",
                    borderRadius: 10, padding: "7px 12px",
                }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar correo o ID..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            flex: 1, border: "none", outline: "none",
                            background: "transparent", color: "var(--text)",
                            fontSize: 13, fontFamily: "var(--font)",
                        }}
                    />
                    {search && (
                        <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14, padding: 0 }}>×</button>
                    )}
                </div>
            </div>

            {/* List */}
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {/* All option */}
                <UserRow
                    label="👥 Todos los usuarios"
                    sublabel="Vista global"
                    selected={value === ""}
                    onClick={() => { onChange(""); onClose(); }}
                />
                {filtered.map(u => (
                    <UserRow
                        key={u.id}
                        label={u.email}
                        sublabel={`#${u.id}${u.name ? ` · ${u.name}` : ""}`}
                        selected={String(value) === String(u.id)}
                        onClick={() => { onChange(String(u.id)); onClose(); }}
                    />
                ))}
                {filtered.length === 0 && (
                    <div style={{ padding: "20px 14px", fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                        Sin coincidencias
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function UserRow({ label, sublabel, selected, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 14px", cursor: "pointer",
                background: selected ? "rgba(13,166,242,0.1)" : "transparent",
                borderLeft: selected ? "3px solid var(--accent)" : "3px solid transparent",
                transition: "background 0.1s ease",
            }}
            onMouseEnter={e => !selected && (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            onMouseLeave={e => !selected && (e.currentTarget.style.background = "transparent")}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: selected ? 700 : 500, color: selected ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                </div>
                {sublabel && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{sublabel}</div>}
            </div>
            {selected && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            )}
        </div>
    );
}

/* ─── Transaction Detail Modal ─── */
function TransactionModal({ tx, onClose }) {
    if (!tx) return null;
    const { label, color, bg, icon } = getType(tx.type);
    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: "fixed", inset: 0, zIndex: 500,
                    background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                }}
            >
                <motion.div
                    key="modal"
                    initial={{ opacity: 0, scale: 0.94, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 20 }}
                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: "var(--card)", border: "1px solid var(--stroke)",
                        borderRadius: 20, padding: "28px 32px", maxWidth: 480, width: "100%",
                        boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{icon}</div>
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)" }}>Detalle de transacción</div>
                            <div style={{ fontSize: 13, color, fontWeight: 700, marginTop: 2 }}>{label}</div>
                        </div>
                        <button onClick={onClose} style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--stroke)", background: "var(--bg0)", color: "var(--muted)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>

                    {/* Amount hero */}
                    <div style={{ background: "var(--bg0)", border: "1px solid var(--stroke)", borderRadius: 14, padding: "18px 20px", marginBottom: 20, textAlign: "center" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Monto</div>
                        <div style={{ fontSize: 32, fontWeight: 900 }}><AmountCell amount={tx.amount} /></div>
                    </div>

                    {[
                        { label: "ID", value: `#${tx.id}` },
                        { label: "Usuario", value: tx.user_email || `ID: ${tx.user_id}` },
                        tx.product_name && { label: "Producto", value: `${tx.product_name}${tx.duration_name ? ` · ${tx.duration_name}` : ""}` },
                        { label: "Concepto", value: tx.note || "—" },
                        { label: "Saldo tras transacción", value: `$${Number(tx.balance_after).toLocaleString("es-CO")}` },
                        { label: "Referencia", value: tx.reference_id ? `${tx.reference_type} #${tx.reference_id}` : "—" },
                        { label: "Fecha", value: new Date(tx.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" }) },
                    ].filter(Boolean).map(row => (
                        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--stroke2)" }}>
                            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>{row.label}</span>
                            <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 700, textAlign: "right", maxWidth: "60%", wordBreak: "break-all" }}>{row.value}</span>
                        </div>
                    ))}

                    <button onClick={onClose} style={{ marginTop: 20, width: "100%", padding: "10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "var(--font)", boxShadow: "0 4px 16px rgba(13,166,242,0.3)" }}>
                        Cerrar
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

/* ─── Main ─── */
export default function TransactionsList({ fetchFn, userId, users }) {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState("");
    const [filterType, setFilterType] = useState("");
    const [filterUser, setFilterUser] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [search, setSearch] = useState("");          // búsqueda libre
    const [searchInput, setSearchInput] = useState(""); // input controlado
    const [selectedTx, setSelectedTx] = useState(null);
    const [showUserDrop, setShowUserDrop] = useState(false);
    const [exporting, setExporting] = useState(false);
    const userDropRef = useRef(null);

    // Close user dropdown on outside click
    useEffect(() => {
        function handler(e) {
            if (userDropRef.current && !userDropRef.current.contains(e.target)) setShowUserDrop(false);
        }
        if (showUserDrop) document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showUserDrop]);

    async function loadData(pageNum, currentLimit, typeF = filterType, userF = filterUser, qF = search, fromF = dateFrom, toF = dateTo) {
        setLoading(true);
        setError("");
        try {
            const query = { page: pageNum, limit: currentLimit };
            if (typeF) query.type = typeF;
            if (userF) query.userId = userF;
            if (qF) query.q = qF;
            if (fromF) query.dateFrom = fromF;
            if (toF) query.dateTo = toF;
            const data = userId ? await fetchFn(userId, query) : await fetchFn(query);
            const payload = data.ok !== undefined ? data.data : data;
            setTransactions(payload?.items || []);
            setTotal(payload?.total || 0);
            setTotalPages(payload?.totalPages || 1);
            setPage(pageNum);
            setLimit(currentLimit);
        } catch (e) {
            setError(e.message || "Error al cargar el historial.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadData(1, limit, filterType, filterUser, search, dateFrom, dateTo); }, [userId, filterType, filterUser, search, dateFrom, dateTo]);

    // Submit search on Enter
    function handleSearchKeyDown(e) {
        if (e.key === "Enter") setSearch(searchInput.trim());
    }

    /* — KPIs — */
    const ingresos = transactions.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
    const egresos = Math.abs(transactions.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0));

    const kpis = [
        { label: "Total registros", value: total, sub: "en el filtro actual", color: "#0da6f2", icon: "📋" },
        { label: "Ingresos (pág.)", value: `+$${ingresos.toLocaleString("es-CO")}`, sub: "recargas y ganancias", color: "#10b981", icon: "📈" },
        { label: "Egresos (pág.)", value: `-$${egresos.toLocaleString("es-CO")}`, sub: "compras y ajustes", color: "#ef4444", icon: "📉" },
    ];

    const selStyle = {
        appearance: "none", WebkitAppearance: "none",
        height: 36, padding: "0 28px 0 12px",
        background: "var(--card)", color: "var(--text)",
        border: "1px solid var(--stroke)", borderRadius: 10,
        fontSize: 13, fontWeight: 600, cursor: "pointer",
        fontFamily: "var(--font)", outline: "none", minWidth: 140,
    };

    /* Selected user label */
    const selectedUser = users?.find(u => String(u.id) === String(filterUser));
    const userLabel = filterUser
        ? (selectedUser?.email || `Usuario #${filterUser}`)
        : "👥 Todos los usuarios";

    return (
        <>
            <TransactionModal tx={selectedTx} onClose={() => setSelectedTx(null)} />

            {/* ─── KPI Row ─── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
                {kpis.map((k, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        style={{ padding: "16px 20px", borderRadius: 16, background: "var(--card)", border: "1px solid var(--stroke)", borderLeft: `3px solid ${k.color}`, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: -12, right: -12, fontSize: 42, opacity: 0.18 }}>{k.icon}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>{k.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{k.sub}</div>
                    </motion.div>
                ))}
            </div>

            {/* ─── Table Card ─── */}
            <div style={{ background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,0.08)" }}>

                {/* Filters bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--stroke)", flexWrap: "wrap", gap: 10 }}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>Historial de Transacciones</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Haz clic en una fila para ver el detalle</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>

                        {/* 🔍 Búsqueda libre */}
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                            <svg style={{ position: "absolute", left: 10, pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Buscar nota, correo..."
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                onBlur={() => setSearch(searchInput.trim())}
                                style={{
                                    height: 36, paddingLeft: 30, paddingRight: search ? 28 : 12,
                                    borderRadius: 10, background: "var(--card)", color: "var(--text)",
                                    border: search ? "1px solid var(--accent)" : "1px solid var(--stroke)",
                                    fontSize: 13, fontFamily: "var(--font)", outline: "none",
                                    minWidth: 180, transition: "border-color 0.15s",
                                }}
                            />
                            {search && (
                                <button onClick={() => { setSearch(""); setSearchInput(""); }} style={{ position: "absolute", right: 8, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
                            )}
                        </div>

                        {/* 📅 Desde / Hasta */}
                        <DatePicker
                            value={dateFrom}
                            onChange={v => { setDateFrom(v); setPage(1); }}
                            placeholder="Desde"
                            maxDate={dateTo || undefined}
                        />
                        <DatePicker
                            value={dateTo}
                            onChange={v => { setDateTo(v); setPage(1); }}
                            placeholder="Hasta"
                            minDate={dateFrom || undefined}
                        />

                        {/* ✖ Limpiar fechas */}
                        {(dateFrom || dateTo) && (
                            <button
                                onClick={() => { setDateFrom(""); setDateTo(""); }}
                                title="Limpiar rango de fechas"
                                style={{
                                    height: 36, width: 36, borderRadius: 10, flexShrink: 0,
                                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                                    color: "#ef4444", fontSize: 16, cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}
                            >
                                ×
                            </button>
                        )}

                        {/* 👥 User searchable dropdown */}
                        {users && (
                            <div style={{ position: "relative" }} ref={userDropRef}>
                                <button
                                    onClick={() => setShowUserDrop(v => !v)}
                                    style={{
                                        height: 36, display: "inline-flex", alignItems: "center", gap: 8,
                                        padding: "0 12px", borderRadius: 10,
                                        background: filterUser ? "rgba(13,166,242,0.10)" : "var(--card)",
                                        color: filterUser ? "var(--accent)" : "var(--text)",
                                        border: filterUser ? "1px solid rgba(13,166,242,0.35)" : "1px solid var(--stroke)",
                                        fontWeight: 600, fontSize: 13, cursor: "pointer",
                                        fontFamily: "var(--font)", maxWidth: 220,
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}
                                >
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{userLabel}</span>
                                    <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0 }}>▼</span>
                                </button>
                                <AnimatePresence>
                                    {showUserDrop && (
                                        <UserDropdown
                                            users={users}
                                            value={filterUser}
                                            onChange={v => { setFilterUser(v); setPage(1); }}
                                            onClose={() => setShowUserDrop(false)}
                                        />
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Tipo filter */}
                        <div style={{ position: "relative" }}>
                            <select style={selStyle} value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
                                <option value="">📋 Todos los tipos</option>
                                <option value="purchase">🛒 Compras</option>
                                <option value="topup">💳 Recargas</option>
                                <option value="profit">💰 Ganancias</option>
                                <option value="adjustment">⚙️ Ajustes</option>
                            </select>
                            <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                        </div>

                        <div style={{ height: 36, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 10, background: "rgba(13,166,242,0.08)", border: "1px solid rgba(13,166,242,0.2)", color: "var(--accent)", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {total} registros
                        </div>


                    </div>
                </div>

                {error && (
                    <div style={{ margin: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: 13 }}>{error}</div>
                )}

                {loading ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 14, color: "var(--muted)" }}>
                        <div className="spinner" />
                        <span style={{ fontSize: 14 }}>Cargando transacciones...</span>
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "var(--bg0)" }}>
                                        {[
                                            "Fecha",
                                            users && "Usuario",
                                            "Tipo",
                                            "Producto",
                                            "Concepto / Nota",
                                            "Monto",
                                            "Saldo Disp.",
                                        ].filter(Boolean).map((col, i, arr) => (
                                            <th key={i} style={{
                                                padding: "11px 14px",
                                                textAlign: i >= arr.length - 2 ? "right" : "left",
                                                fontSize: 11, fontWeight: 800,
                                                color: "var(--muted)", textTransform: "uppercase",
                                                letterSpacing: "0.7px", borderBottom: "1px solid var(--stroke)",
                                                whiteSpace: "nowrap",
                                            }}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map((t, idx) => (
                                        <motion.tr
                                            key={t.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: idx * 0.015 }}
                                            onClick={() => setSelectedTx(t)}
                                            style={{
                                                cursor: "pointer",
                                                borderBottom: "1px solid var(--stroke2)",
                                                background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
                                                transition: "background 0.1s ease",
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(13,166,242,0.04)"}
                                            onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)"}
                                        >
                                            {/* Fecha */}
                                            <td style={{ padding: "11px 14px", whiteSpace: "nowrap", color: "var(--muted)", fontSize: 12 }}>
                                                {new Date(t.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
                                            </td>
                                            {/* Usuario */}
                                            {users && (
                                                <td style={{ padding: "11px 14px", color: "var(--text)", fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {t.user_email || `#${t.user_id}`}
                                                </td>
                                            )}
                                            {/* Tipo */}
                                            <td style={{ padding: "11px 14px" }}>
                                                <TypeBadge type={t.type} />
                                            </td>
                                            {/* Producto */}
                                            <td style={{ padding: "11px 14px", maxWidth: 160 }}>
                                                {t.product_name ? (
                                                    <div>
                                                        <div style={{ color: "var(--text)", fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                            {t.product_name}
                                                        </div>
                                                        {t.duration_name && (
                                                            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 1 }}>{t.duration_name}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                                                )}
                                            </td>
                                            {/* Concepto */}
                                            <td style={{ padding: "11px 14px", color: "var(--muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                                                {t.note || "—"}
                                            </td>
                                            {/* Monto */}
                                            <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                                                <AmountCell amount={t.amount} />
                                            </td>
                                            {/* Saldo */}
                                            <td style={{ padding: "11px 14px", textAlign: "right", color: "var(--text)", fontWeight: 700, whiteSpace: "nowrap" }}>
                                                ${Number(t.balance_after).toLocaleString("es-CO")}
                                            </td>
                                        </motion.tr>
                                    ))}
                                    {!transactions.length && (
                                        <tr>
                                            <td colSpan={users ? 7 : 6} style={{ padding: "50px 20px", textAlign: "center" }}>
                                                <div style={{ color: "var(--muted)", fontSize: 14 }}>
                                                    <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                                                    No hay transacciones con los filtros aplicados.
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {total > 0 && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid var(--stroke)", flexWrap: "wrap", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13 }}>
                                    <span>Mostrar:</span>
                                    <div style={{ position: "relative" }}>
                                        <select value={limit} onChange={e => loadData(1, Number(e.target.value), filterType, filterUser, search, dateFrom, dateTo)} style={{ ...selStyle, minWidth: "auto", height: 32, padding: "0 24px 0 10px" }}>
                                            {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                        <span style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▼</span>
                                    </div>
                                    <span style={{ color: "var(--text)", fontWeight: 600 }}>Página {page} de {totalPages}</span>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button className="btn-ghost" disabled={page <= 1 || loading} onClick={() => loadData(page - 1, limit, filterType, filterUser, search, dateFrom, dateTo)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>← Anterior</button>
                                    <button className="btn-ghost" disabled={page >= totalPages || loading} onClick={() => loadData(page + 1, limit, filterType, filterUser, search, dateFrom, dateTo)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>Siguiente →</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
