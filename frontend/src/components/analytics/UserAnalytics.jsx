import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SalesChart from "./SalesChart";
import DistributionChart from "./DistributionChart";
import WeeklyChart from "./WeeklyChart";
import { apiGet } from "../../api/api";
import { MONTH_COLORS } from "./chartPalette.js";

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, background: "rgba(239,68,68,0.1)", color: "#ef4444", borderRadius: 16, margin: 20, border: "1px solid rgba(239,68,68,0.25)" }}>
                    <h2 style={{ margin: "0 0 8px" }}>Error al cargar los gráficos</h2>
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12 }}>{this.state.error?.toString()}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

const MONTH_NAMES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const MONTH_SHORT = [
    "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } }
};
const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 340, damping: 25 } }
};

const TOP_COLORS = ["#0da6f2", "#8b5cf6", "#10b981", "#f43f5e", "#f59e0b"];

function monthKey(year, month) {
    return `${year}-${String(month).padStart(2, "0")}`;
}

function getApiPayload(res) {
    return res?.data ?? res ?? {};
}

function assertApiOk(res, fallbackMessage) {
    if (res?.ok === false) {
        throw new Error(res?.data?.message || fallbackMessage);
    }
    return getApiPayload(res);
}

/* ── InsightChip ── */
function InsightChip({ emoji, label, value, color = "var(--accent)" }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 14,
            flex: "1 1 auto", minWidth: 120,
        }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", whiteSpace: "nowrap" }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
            </div>
        </div>
    );
}

/* ── MonthPill ── */
function MonthPill({ label, color, selected, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 22,
                border: selected ? `2px solid ${color}` : "1.5px solid var(--stroke)",
                background: selected ? `${color}22` : "var(--card)",
                color: selected ? color : "var(--muted)",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
                transition: "all 0.18s ease", fontFamily: "var(--font)",
                whiteSpace: "nowrap", boxShadow: selected ? `0 0 12px ${color}33` : "none",
            }}
        >
            {selected && <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />}
            {label}
        </button>
    );
}

/* Altura compartida para los 3 controles del header */
const CTRL_H = 34;
const CTRL_STYLE = {
    height: CTRL_H,
    padding: "0 14px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "var(--font)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: "1px solid var(--stroke)",
    background: "var(--card)",
    color: "var(--text)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    transition: "all 0.18s ease",
    outline: "none",
    whiteSpace: "nowrap",
};

/* ── PillSelect (reemplaza <select> con diseño premium) ── */
function PillSelect({ value, onChange, options, icon }) {
    return (
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            {icon && (
                <span style={{
                    position: "absolute", left: 10, fontSize: 13,
                    pointerEvents: "none", zIndex: 1, lineHeight: 1,
                }}>{icon}</span>
            )}
            <select
                value={value}
                onChange={onChange}
                style={{
                    ...CTRL_STYLE,
                    appearance: "none", WebkitAppearance: "none",
                    paddingLeft: icon ? 30 : 14,
                    paddingRight: 28,
                    minWidth: 80,
                }}
            >
                {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <span style={{
                position: "absolute", right: 9, fontSize: 9,
                color: "var(--muted)", pointerEvents: "none",
            }}>▼</span>
        </div>
    );
}

/* ── UserDropdown (mega-menu premium) ── */
function UserDropdown({ users, selectedUserIds, setSelectedUserIds, onClose }) {
    const [search, setSearch] = useState("");
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        String(u.id).includes(search)
    );

    function toggle(uid) {
        setSelectedUserIds(prev => {
            if (prev.includes(uid)) return prev.filter(id => id !== uid);
            if (prev.length >= 5) return prev;
            return [...prev, uid];
        });
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            style={{
                position: "absolute", top: "calc(100% + 10px)", right: 0,
                width: 320, zIndex: 200,
                background: "var(--card)", backdropFilter: "blur(24px)",
                border: "1px solid var(--stroke)",
                borderRadius: 18, overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(13,166,242,0.08)",
            }}
        >
            {/* Header */}
            <div style={{
                padding: "14px 16px 12px",
                borderBottom: "1px solid var(--stroke2)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.4px" }}>
                        Filtrar usuarios
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {selectedUserIds.length === 0 ? "Vista global" : `${selectedUserIds.length}/5 seleccionados`}
                    </div>
                </div>
                {selectedUserIds.length > 0 && (
                    <button
                        onClick={() => setSelectedUserIds([])}
                        style={{
                            fontSize: 11, fontWeight: 700, color: "var(--accent)", cursor: "pointer",
                            background: "rgba(13,166,242,0.08)", border: "1px solid rgba(13,166,242,0.2)",
                            borderRadius: 8, padding: "4px 8px", transition: "all 0.15s",
                        }}
                    >
                        Limpiar
                    </button>
                )}
            </div>

            {/* Search */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--stroke2)" }}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "var(--bg0)", border: "1px solid var(--stroke)",
                    borderRadius: 10, padding: "7px 12px",
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar correo o ID..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            flex: 1, border: "none", outline: "none", background: "transparent",
                            color: "var(--text)", fontSize: 13, fontFamily: "var(--font)",
                        }}
                    />
                </div>
            </div>

            {/* List */}
            <div style={{ maxHeight: 240, overflowY: "auto", padding: "8px 8px" }}>
                {/* Opción "Todos" */}
                {!search && (
                    <UserOption
                        checked={selectedUserIds.length === 0}
                        label="Todos los usuarios"
                        sublabel="Vista global acumulada"
                        emoji="🌟"
                        onChange={() => { setSelectedUserIds([]); onClose(); }}
                    />
                )}
                {filtered.map(u => (
                    <UserOption
                        key={u.id}
                        checked={selectedUserIds.includes(u.id)}
                        disabled={selectedUserIds.length >= 5 && !selectedUserIds.includes(u.id)}
                        label={u.email}
                        sublabel={`#${u.id}${u.name ? ` · ${u.name}` : ""}`}
                        onChange={() => toggle(u.id)}
                    />
                ))}
                {filtered.length === 0 && (
                    <div style={{ padding: "20px 10px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
                        Sin resultados
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--stroke2)" }}>
                <button
                    onClick={onClose}
                    style={{
                        width: "100%", padding: "9px", borderRadius: 10,
                        background: "var(--accent)", color: "#fff",
                        border: "none", fontWeight: 700, fontSize: 13,
                        cursor: "pointer", fontFamily: "var(--font)",
                        boxShadow: "0 4px 14px rgba(13,166,242,0.3)",
                        transition: "opacity 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                    Aplicar filtro
                </button>
            </div>
        </motion.div>
    );
}

function UserOption({ checked, disabled, label, sublabel, emoji, onChange }) {
    return (
        <label style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 10px", borderRadius: 10,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.45 : 1,
            background: checked ? "rgba(13,166,242,0.08)" : "transparent",
            border: checked ? "1px solid rgba(13,166,242,0.2)" : "1px solid transparent",
            marginBottom: 3,
            transition: "background 0.12s ease, border-color 0.12s ease",
        }}>
            {/* Custom checkbox */}
            <div style={{
                width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                background: checked ? "var(--accent)" : "var(--input-bg)",
                border: checked ? "2px solid var(--accent)" : "2px solid var(--stroke)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
            }}>
                {checked && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6.5L4.8 9.5L10 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </div>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} style={{ display: "none" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 13, fontWeight: 600, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {emoji && <span style={{ marginRight: 6 }}>{emoji}</span>}
                    {label}
                </div>
                {sublabel && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{sublabel}</div>
                )}
            </div>
        </label>
    );
}

/* ── KPI Card ── */
function KpiCard({ label, total, orders, topPlatform, color }) {
    return (
        <motion.div
            variants={itemVariants}
            whileHover={{ y: -4, scale: 1.01 }}
            style={{
                padding: "20px 22px", borderRadius: 18,
                background: "var(--card)", border: "1px solid var(--stroke)",
                borderTop: `3px solid ${color}`,
                boxShadow: `0 8px 30px rgba(0,0,0,0.08), 0 0 0 1px ${color}1a`,
                position: "relative", overflow: "hidden",
                minWidth: 0, // Prevent flex blowup
            }}
        >
            {/* Glow bg */}
            <div style={{
                position: "absolute", top: -20, right: -20,
                width: 80, height: 80, borderRadius: "50%",
                background: `${color}18`, filter: "blur(20px)",
                pointerEvents: "none",
            }} />
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "1.2px", color, marginBottom: 10 }}>
                {label}
            </div>
            <div style={{ fontSize: "calc(1.2rem + 0.8vw)", fontWeight: 900, color: "var(--text)", lineHeight: 1, letterSpacing: "-0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ fontSize: "0.6em", color: "var(--muted)", marginRight: 2 }}>$</span>
                {Number(total).toLocaleString("es-CO")}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ whiteSpace: "nowrap" }}>📦 {orders} órd.</span>
                {topPlatform && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🏆 {topPlatform}</span>}
            </div>
        </motion.div>
    );
}

/* ─────────────────────────────────────── */
function UserAnalyticsContent({ admin }) {
    const now = new Date();
    const currentYear = now.getFullYear();

    const [viewMode, setViewMode] = useState("monthly"); // "monthly" | "weekly"
    const [year, setYear] = useState(currentYear);
    const [chartType, setChartType] = useState("area");

    const [users, setUsers] = useState([]);
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [showUserDrop, setShowUserDrop] = useState(false);
    const userDropRef = useRef(null);

    const [allHistorical, setAllHistorical] = useState([]);
    const [availableYears, setAvailableYears] = useState([currentYear]);
    const [loadingMonths, setLoadingMonths] = useState(true);
    const [selectedKeys, setSelectedKeys] = useState([]);

    const [monthsData, setMonthsData] = useState([]);
    const [loadingData, setLoadingData] = useState(false);
    const [error, setError] = useState("");

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e) {
            if (userDropRef.current && !userDropRef.current.contains(e.target)) {
                setShowUserDrop(false);
            }
        }
        if (showUserDrop) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showUserDrop]);

    useEffect(() => {
        if (admin) {
            apiGet("/admin/users?limit=1000")
                .then(res => {
                    const data = assertApiOk(res, "No se pudo cargar la lista de usuarios.");
                    const uList = data?.items || [];
                    setUsers(Array.isArray(uList) ? uList : []);
                })
                .catch(err => {
                    console.error(err);
                    setError(err.message || "No se pudo cargar la lista de usuarios.");
                });
        }
    }, [admin]);

    useEffect(() => {
        let cancelled = false;
        setError("");
        setSelectedKeys([]);
        setMonthsData([]);
        setLoadingMonths(true);
        let url = "/analytics/available-months";
        if (admin && selectedUserIds.length === 0) url += "?global=true";
        if (admin && selectedUserIds.length > 0) url += `?userIds=${selectedUserIds.join(",")}`;

        apiGet(url)
            .then(res => {
                const data = assertApiOk(res, "No se pudieron cargar los meses con ventas.");
                const monthsList = Array.isArray(data?.months) ? data.months : [];
                if (cancelled) return;
                setAllHistorical(monthsList);
                if (monthsList.length > 0) {
                    const years = [...new Set(monthsList.map(m => m.year))].sort((a, b) => b - a);
                    setAvailableYears(years);
                    if (years.length > 0) setYear(prevYear => (years.includes(prevYear) ? prevYear : years[0]));
                } else {
                    setAvailableYears([currentYear]);
                }
            })
            .catch(err => {
                if (cancelled) return;
                setAllHistorical([]);
                setAvailableYears([currentYear]);
                setError(err.message || "No se pudieron cargar los meses con ventas.");
            })
            .finally(() => {
                if (!cancelled) setLoadingMonths(false);
            });

        return () => {
            cancelled = true;
        };
    }, [admin, currentYear, selectedUserIds]);

    const filteredMonths = allHistorical.filter(m => m.year === year);

    useEffect(() => {
        if (!loadingMonths && selectedKeys.length === 0 && filteredMonths.length > 0) {
            const top2 = filteredMonths.slice(0, 2).map(m => monthKey(m.year, m.month));
            setSelectedKeys(top2);
        }
    }, [filteredMonths, loadingMonths, selectedKeys.length]);

    const loadMultiData = useCallback(async () => {
        if (selectedKeys.length === 0) { setMonthsData([]); return; }
        setLoadingData(true);
        setError("");
        try {
            if (admin && selectedUserIds.length >= 2) {
                const primaryMonth = selectedKeys[0];
                const promises = selectedUserIds.map(async (uId) => {
                    const res = await apiGet(`/analytics/sales/multi?months=${primaryMonth}&userIds=${uId}`);
                    const data = assertApiOk(res, "No se pudieron cargar las ventas comparadas.");
                    const list = Array.isArray(data?.months) ? data.months : [];
                    const monthData = list[0];
                    if (!monthData) return null;
                    const userObj = users.find(u => u.id === uId);
                    const displayName = userObj ? (userObj.name || userObj.email.split("@")[0]) : `#${uId}`;
                    return { ...monthData, daily: monthData.daily || [], distribution: Array.isArray(monthData.distribution) ? monthData.distribution : [], label: displayName, isUserCompare: true };
                });
                const results = (await Promise.all(promises)).filter(Boolean);
                setMonthsData(results);
            } else {
                let url = `/analytics/sales/multi?months=${selectedKeys.join(",")}`;
                if (admin && selectedUserIds.length === 0) url += `&global=true`;
                if (admin && selectedUserIds.length === 1) url += `&userIds=${selectedUserIds[0]}`;
                const res = await apiGet(url);
                const data = assertApiOk(res, "No se pudieron cargar las ventas.");
                const list = Array.isArray(data?.months) ? data.months : [];
                const withLabel = list.map(m => ({ ...m, daily: m.daily || [], distribution: Array.isArray(m.distribution) ? m.distribution : [], label: `${MONTH_SHORT[m.month]} ${m.year}` }));
                setMonthsData(withLabel);
            }
        } catch (e) {
            setError(e.message || "Error al cargar datos.");
        } finally {
            setLoadingData(false);
        }
    }, [selectedKeys, admin, selectedUserIds, users]);

    useEffect(() => { loadMultiData(); }, [loadMultiData]);

    useEffect(() => {
        if (admin && selectedUserIds.length >= 2 && selectedKeys.length > 1) {
            setSelectedKeys([selectedKeys[0]]);
        }
    }, [admin, selectedUserIds.length, selectedKeys]);

    function toggleMonth(key) {
        setSelectedKeys(prev => {
            if (admin && selectedUserIds.length >= 2) return [key]; // comparando usuarios: 1 mes
            // Modo semanal: máx 3 meses
            if (viewMode === "weekly") {
                if (prev.includes(key)) return prev.length > 1 ? prev.filter(k => k !== key) : prev; // no dejar vacío
                if (prev.length >= 3) return prev; // máx 3
                return [...prev, key];
            }
            if (prev.includes(key)) return prev.filter(k => k !== key);
            if (prev.length >= 6) return prev;
            return [...prev, key];
        });
    }

    const primary = monthsData[0] ?? null;
    const primaryMarginPct = Number(primary?.marginPct || 0);
    const selectedRevenueTotal = monthsData.reduce((sum, m) => sum + Number(m.total || 0), 0);
    const selectedCostTotal = monthsData.reduce((sum, m) => sum + Number(m.costTotal || 0), 0);
    const selectedNetProfit = monthsData.reduce((sum, m) => sum + Number(m.netProfit || 0), 0);
    const selectedMissingCostCount = monthsData.reduce((sum, m) => sum + Number(m.missingCostCount || 0), 0);
    const selectedMarginPct = selectedRevenueTotal > 0
        ? Number(((selectedNetProfit / selectedRevenueTotal) * 100).toFixed(2))
        : 0;

    const isComparingUsers = admin && selectedUserIds.length >= 2;

    return (
        <motion.div style={{ marginTop: 16 }} initial="hidden" animate="show" variants={containerVariants}>

            {/* ─── HEADER ─── */}
            <motion.div variants={itemVariants} style={{ marginBottom: 24 }}>
                {/* Row: título + controles */}
                <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    flexWrap: "wrap", gap: 12, marginBottom: 18,
                }}>
                    {/* Título */}
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: 34, height: 34, borderRadius: 10,
                                background: "linear-gradient(135deg, var(--accent), #8b5cf6)",
                                fontSize: 16, flexShrink: 0,
                            }}>📊</span>
                            {admin ? "Analíticas Globales" : "Mis Analíticas de Ventas"}
                        </h1>
                        <p style={{ margin: "6px 0 0 42px", fontSize: 13, color: "var(--muted)" }}>
                            {isComparingUsers ? "Comparando usuarios en el mes seleccionado" : viewMode === "weekly" ? "Desglose semanal del mes seleccionado" : "Selecciona hasta 6 meses para comparar"}
                        </p>
                    </div>

                    {/* Controles derechos */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

                        {/* Admin: user picker */}
                        {admin && (
                            <div style={{ position: "relative" }} ref={userDropRef}>
                                <button
                                    onClick={() => setShowUserDrop(v => !v)}
                                    aria-label="Filtrar por usuario"
                                    aria-expanded={showUserDrop}
                                    style={{
                                        ...CTRL_STYLE,
                                        background: selectedUserIds.length > 0 ? "rgba(13,166,242,0.12)" : "var(--card)",
                                        color: selectedUserIds.length > 0 ? "var(--accent)" : "var(--text)",
                                        border: selectedUserIds.length > 0 ? "1px solid rgba(13,166,242,0.35)" : "1px solid var(--stroke)",
                                        boxShadow: selectedUserIds.length > 0 ? "0 0 12px rgba(13,166,242,0.15)" : "0 2px 8px rgba(0,0,0,0.06)",
                                    }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                    </svg>
                                    <span>{selectedUserIds.length === 0 ? "Todos" : `${selectedUserIds.length} usuario${selectedUserIds.length > 1 ? "s" : ""}`}</span>
                                    <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>▼</span>
                                </button>

                                <AnimatePresence>
                                    {showUserDrop && (
                                        <UserDropdown
                                            users={users}
                                            selectedUserIds={selectedUserIds}
                                            setSelectedUserIds={setSelectedUserIds}
                                            onClose={() => setShowUserDrop(false)}
                                        />
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Year picker */}
                        {availableYears.length > 0 && (
                            <PillSelect
                                value={year}
                                onChange={e => { setYear(Number(e.target.value)); setSelectedKeys([]); }}
                                options={availableYears.map(y => ({ value: y, label: y }))}
                                icon="📅"
                            />
                        )}

                        {/* Chart type — disponible en ambos modos */}
                        <PillSelect
                            value={chartType}
                            onChange={e => setChartType(e.target.value)}
                            options={[{ value: "area", label: "Área" }, { value: "bar", label: "Barras" }]}
                            icon="📈"
                        />

                        {/* Tab toggle Mensual / Semanal */}
                        <div style={{
                            display: "inline-flex", background: "var(--bg0)",
                            border: "1px solid var(--stroke)", borderRadius: 12,
                            padding: 3, gap: 2,
                        }}>
                            {[{ key: "monthly", icon: "📅", label: "Mensual" }, { key: "weekly", icon: "📊", label: "Semanal" }].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setViewMode(tab.key)}
                                    style={{
                                        height: CTRL_H, padding: "0 12px", borderRadius: 9,
                                        fontSize: 12, fontWeight: 700, fontFamily: "var(--font)",
                                        cursor: "pointer", border: "none",
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        background: viewMode === tab.key
                                            ? "linear-gradient(135deg, var(--accent), #8b5cf6)"
                                            : "transparent",
                                        color: viewMode === tab.key ? "#fff" : "var(--muted)",
                                        boxShadow: viewMode === tab.key ? "0 2px 12px rgba(13,166,242,0.3)" : "none",
                                        transition: "all 0.18s ease",
                                    }}
                                >
                                    <span>{tab.icon}</span>
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Selector de meses */}
                <div style={{
                    background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 14,
                    padding: "12px 16px",
                }}>
                    {loadingMonths ? (
                        <div style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="spinner" style={{ width: 14, height: 14 }} /> Cargando meses...
                        </div>
                    ) : filteredMonths.length === 0 ? (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>Sin ventas registradas para {year}.</div>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            <span style={{
                                fontSize: 11, fontWeight: 800, color: "var(--muted)",
                                textTransform: "uppercase", letterSpacing: "0.8px", marginRight: 4, flexShrink: 0,
                            }}>
                                {viewMode === "weekly" ? "Mes a desglosar:" : isComparingUsers ? "Mes a analizar:" : "Comparar:"}
                            </span>
                            {filteredMonths.map((m) => {
                                const key = monthKey(m.year, m.month);
                                const selIdx = selectedKeys.indexOf(key);
                                const color = selIdx >= 0 ? MONTH_COLORS[selIdx % MONTH_COLORS.length] : "var(--muted)";
                                return (
                                    <MonthPill
                                        key={key}
                                        label={`${MONTH_SHORT[m.month]} ${m.year}`}
                                        color={color}
                                        selected={selIdx >= 0}
                                        onClick={() => toggleMonth(key)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Error */}
            {error && (
                <motion.div variants={itemVariants} style={{
                    marginBottom: 16, borderRadius: 12, padding: "12px 16px",
                    background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.25)",
                    color: "#ef4444", fontSize: 14, fontWeight: 600,
                }}>{error}</motion.div>
            )}

            {/* Removed redundant insight chips row */}

            {/* Loader */}
            {(loadingData || loadingMonths) && (
                <motion.div variants={itemVariants} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "60px 20px", gap: 14, color: "var(--muted)",
                    background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 18,
                }}>
                    <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                    <span style={{ fontSize: 14 }}>Cargando datos...</span>
                </motion.div>
            )}

            {/* ─── Vista Semanal ─── */}
            {viewMode === "weekly" && !loadingMonths && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    <WeeklyChart
                        selectedMonthKeys={selectedKeys}
                        admin={admin}
                        selectedUserIds={selectedUserIds}
                        chartType={chartType}
                    />
                </motion.div>
            )}

            {/* KPI Cards — solo mensual */}
            {viewMode === "monthly" && monthsData.length > 0 && !loadingData && (
                <motion.div initial="hidden" animate="show" variants={containerVariants}
                    className="kpi-cards-grid"
                    style={{ display: "grid", gap: 14, marginBottom: 20 }}>
                    {monthsData.map((m, idx) => (
                        <KpiCard
                            key={m.label}
                            label={m.label}
                            total={m.total}
                            orders={m.orders}
                            topPlatform={m.distribution?.[0]?.name}
                            color={MONTH_COLORS[idx % MONTH_COLORS.length]}
                        />
                    ))}
                </motion.div>
            )}

            {/* Rentabilidad admin */}
            {admin && viewMode === "monthly" && monthsData.length > 0 && !loadingData && (
                <>
                    <motion.div
                        variants={itemVariants}
                        style={{
                            marginBottom: 12,
                            padding: "12px 14px",
                            borderRadius: 8,
                            border: selectedMissingCostCount > 0 ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(16,185,129,0.25)",
                            background: selectedMissingCostCount > 0 ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.07)",
                            color: selectedMissingCostCount > 0 ? "#f59e0b" : "#10b981",
                            fontSize: 12,
                            fontWeight: 700,
                            lineHeight: 1.45,
                        }}
                    >
                        {selectedMissingCostCount > 0
                            ? `Balance provisional: ${selectedMissingCostCount} venta${selectedMissingCostCount === 1 ? "" : "s"} todavía no tiene${selectedMissingCostCount === 1 ? "" : "n"} costo registrado. Corrige el costo desde Inventario para completar la utilidad neta.`
                            : "Balance completo: todas las ventas del periodo tienen costo registrado."}
                    </motion.div>
                    <motion.div
                        variants={itemVariants}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: 12,
                            marginBottom: 20,
                        }}
                    >
                        <InsightChip emoji="💰" label={selectedMissingCostCount > 0 ? "Utilidad provisional" : "Utilidad neta"} value={`$${selectedNetProfit.toLocaleString("es-CO")}`} color={selectedNetProfit >= 0 ? "#10b981" : "#ef4444"} />
                        <InsightChip emoji="🧾" label="Costo registrado" value={`$${selectedCostTotal.toLocaleString("es-CO")}`} color="#f59e0b" />
                        <InsightChip emoji="📈" label="Margen del periodo" value={`${selectedMarginPct.toLocaleString("es-CO")} %`} color={selectedMarginPct >= 0 ? "#10b981" : "#ef4444"} />
                        <InsightChip emoji="🎯" label={`Margen ${primary?.label || "Mes"}`} value={`${primaryMarginPct.toLocaleString("es-CO")} %`} color={primaryMarginPct >= 0 ? "#10b981" : "#ef4444"} />
                    </motion.div>
                </>
            )}

            {/* Charts — solo en modo mensual */}
            {viewMode === "monthly" && monthsData.length > 0 && !loadingData && (
                <motion.div initial="hidden" animate="show" variants={containerVariants}
                    style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Sales trend chart */}
                    <motion.div variants={itemVariants} style={{
                        padding: "22px 24px", borderRadius: 18,
                        background: "var(--card)", border: "1px solid var(--stroke)",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
                                Tendencia de Ventas
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {monthsData.map((m, i) => (
                                    <span key={i} style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        fontSize: 12, fontWeight: 700, color: MONTH_COLORS[i % MONTH_COLORS.length],
                                        background: `${MONTH_COLORS[i % MONTH_COLORS.length]}15`,
                                        border: `1px solid ${MONTH_COLORS[i % MONTH_COLORS.length]}30`,
                                        borderRadius: 8, padding: "3px 8px",
                                    }}>
                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: MONTH_COLORS[i % MONTH_COLORS.length] }} />
                                        {m.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <SalesChart months={monthsData} chartType={chartType} />
                    </motion.div>

                    {/* Bottom row */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>

                        {/* Distribution chart */}
                        {primary?.distribution && Array.isArray(primary.distribution) && primary.distribution.length > 0 && (
                            <motion.div variants={itemVariants} style={{
                                flex: "1 1 300px", padding: "22px 24px", borderRadius: 18,
                                background: "var(--card)", border: "1px solid var(--stroke)",
                                boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                            }}>
                                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)", marginBottom: 18 }}>
                                    Ventas por plataforma · <span style={{ color: "var(--accent)" }}>{primary.label}</span>
                                </div>
                                <DistributionChart data={primary.distribution} />
                            </motion.div>
                        )}

                        {/* Top products */}
                        {primary?.distribution && Array.isArray(primary.distribution) && primary.distribution.length > 0 && (
                            <motion.div variants={itemVariants} style={{
                                flex: "1 1 300px", padding: "22px 24px", borderRadius: 18,
                                background: "var(--card)", border: "1px solid var(--stroke)",
                                boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
                                display: "flex", flexDirection: "column",
                            }}>
                                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)", marginBottom: 18 }}>
                                    Top Productos · <span style={{ color: "var(--accent)" }}>{primary.label}</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {primary.distribution.slice(0, 5).map((item, idx) => (
                                        <div key={idx} style={{
                                            display: "flex", alignItems: "center", gap: 12,
                                            padding: "11px 14px", borderRadius: 12,
                                            background: "var(--bg0)", border: "1px solid var(--stroke2)",
                                            transition: "border-color 0.15s",
                                        }}>
                                            <div style={{
                                                width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                                                background: `linear-gradient(135deg, ${MONTH_COLORS[idx % MONTH_COLORS.length]}, ${MONTH_COLORS[(idx + 1) % MONTH_COLORS.length]})`,
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                color: "#fff", fontWeight: 900, fontSize: 13,
                                                boxShadow: `0 4px 12px ${MONTH_COLORS[idx % MONTH_COLORS.length]}40`,
                                            }}>
                                                {idx + 1}
                                            </div>
                                            <span style={{
                                                fontWeight: 700, fontSize: 12, color: "var(--text)",
                                                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                minWidth: 0,
                                            }}>
                                                {item.name}
                                            </span>
                                            <span style={{
                                                fontWeight: 900, fontSize: 12, color: "var(--accent)", flexShrink: 0,
                                                background: "rgba(13,166,242,0.08)", padding: "3px 8px", borderRadius: 8,
                                                marginLeft: 4
                                            }}>
                                                ${Number(item.value).toLocaleString("es-CO")}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Sin meses seleccionados */}
            {selectedKeys.length === 0 && !loadingMonths && (
                <motion.div variants={itemVariants} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    textAlign: "center", padding: "70px 20px", color: "var(--muted)",
                    border: "1px dashed var(--stroke)", borderRadius: 18, gap: 10,
                    fontSize: 14,
                }}>
                    <span style={{ fontSize: 36 }}>📅</span>
                    <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Sin período seleccionado</span>
                    <span>Selecciona al menos un mes arriba para ver los gráficos.</span>
                </motion.div>
            )}
        </motion.div>
    );
}

export default function UserAnalytics({ admin = false }) {
    return (
        <ErrorBoundary>
            <UserAnalyticsContent admin={admin} />
        </ErrorBoundary>
    );
}
