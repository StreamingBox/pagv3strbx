import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

function parseLocal(str) {
    if (!str) return null;
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function toStr(date) {
    if (!date) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function formatDisplay(str) {
    if (!str) return null;
    const [y, m, d] = str.split("-");
    return `${d}/${m}/${y}`;
}

/* ─── Calendar dropdown ─── */
function Calendar({ value, minDate, maxDate, onChange, onClose }) {
    const selected = parseLocal(value);
    const today = new Date();
    const [view, setView] = useState(() => ({
        year: selected?.getFullYear() ?? today.getFullYear(),
        month: selected?.getMonth() ?? today.getMonth(),
    }));

    function prevMonth() {
        setView(v => {
            if (v.month === 0) return { year: v.year - 1, month: 11 };
            return { ...v, month: v.month - 1 };
        });
    }
    function nextMonth() {
        setView(v => {
            if (v.month === 11) return { year: v.year + 1, month: 0 };
            return { ...v, month: v.month + 1 };
        });
    }

    // Build grid: days of month + padding from previous month
    const firstDay = new Date(view.year, view.month, 1).getDay(); // 0 = Dom
    const daysInMo = new Date(view.year, view.month + 1, 0).getDate();
    const daysInPrev = new Date(view.year, view.month, 0).getDate();

    const cells = [];
    // Trailing days of prev month
    for (let i = firstDay - 1; i >= 0; i--) {
        cells.push({ day: daysInPrev - i, thisMonth: false });
    }
    // Current month
    for (let d = 1; d <= daysInMo; d++) {
        cells.push({ day: d, thisMonth: true });
    }
    // Leading days of next month
    const remainder = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
    for (let d = 1; d <= remainder; d++) {
        cells.push({ day: d, thisMonth: false });
    }

    function isDisabled(cell) {
        if (!cell.thisMonth) return true;
        const d = new Date(view.year, view.month, cell.day);
        if (minDate && d < minDate) return true;
        if (maxDate && d > maxDate) return true;
        return false;
    }

    function isSelected(cell) {
        if (!cell.thisMonth || !selected) return false;
        return cell.day === selected.getDate()
            && view.month === selected.getMonth()
            && view.year === selected.getFullYear();
    }

    function isToday(cell) {
        if (!cell.thisMonth) return false;
        return cell.day === today.getDate()
            && view.month === today.getMonth()
            && view.year === today.getFullYear();
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0,
                zIndex: 500, width: 280,
                background: "var(--card)",
                border: "1px solid var(--stroke)",
                borderRadius: 16,
                boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
                backdropFilter: "blur(20px)",
                overflow: "hidden",
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px 10px",
                borderBottom: "1px solid var(--stroke2)",
            }}>
                <button onClick={prevMonth} style={navBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>
                    {MONTHS[view.month]} {view.year}
                </span>
                <button onClick={nextMonth} style={navBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            </div>

            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "10px 12px 4px", gap: 2 }}>
                {DAYS.map(d => (
                    <div key={d} style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.5px", padding: "2px 0" }}>
                        {d}
                    </div>
                ))}
            </div>

            {/* Day grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 12px 12px", gap: 2 }}>
                {cells.map((cell, i) => {
                    const disabled = isDisabled(cell);
                    const sel = isSelected(cell);
                    const tod = isToday(cell);
                    return (
                        <button
                            key={i}
                            disabled={disabled}
                            onClick={() => {
                                if (!disabled) {
                                    onChange(toStr(new Date(view.year, view.month, cell.day)));
                                    onClose();
                                }
                            }}
                            style={{
                                width: "100%", aspectRatio: "1",
                                borderRadius: 8, border: "none",
                                fontSize: 13, fontWeight: sel ? 800 : tod ? 700 : 500,
                                cursor: disabled ? "default" : "pointer",
                                transition: "all 0.12s ease",
                                fontFamily: "var(--font)",
                                background: sel
                                    ? "var(--accent)"
                                    : tod && !sel
                                        ? "rgba(13,166,242,0.15)"
                                        : "transparent",
                                color: sel
                                    ? "#fff"
                                    : disabled
                                        ? "rgba(255,255,255,0.15)"
                                        : tod
                                            ? "var(--accent)"
                                            : "var(--text)",
                                boxShadow: sel ? "0 4px 12px rgba(13,166,242,0.4)" : "none",
                                outline: !sel && tod ? "1px solid rgba(13,166,242,0.35)" : "none",
                            }}
                            onMouseEnter={e => {
                                if (!disabled && !sel) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                            }}
                            onMouseLeave={e => {
                                if (!disabled && !sel) e.currentTarget.style.background = tod ? "rgba(13,166,242,0.15)" : "transparent";
                            }}
                        >
                            {cell.day}
                        </button>
                    );
                })}
            </div>

            {/* Footer actions */}
            <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 16px", borderTop: "1px solid var(--stroke2)",
            }}>
                <button
                    onClick={() => { onChange(""); onClose(); }}
                    style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)", padding: "4px 0" }}
                >
                    Borrar
                </button>
                <button
                    onClick={() => {
                        const t = new Date();
                        setView({ year: t.getFullYear(), month: t.getMonth() });
                        onChange(toStr(t));
                        onClose();
                    }}
                    style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)", padding: "4px 0" }}
                >
                    Hoy
                </button>
            </div>
        </motion.div>
    );
}

const navBtn = {
    width: 30, height: 30, borderRadius: 8,
    border: "1px solid var(--stroke)", background: "var(--bg0)",
    color: "var(--text)", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center",
};

/* ─── DatePicker ─── */
export default function DatePicker({ value, onChange, placeholder = "Fecha", minDate, maxDate }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        function handler(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        if (open) document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const isActive = !!value;
    const minD = parseLocal(minDate) ?? null;
    const maxD = parseLocal(maxDate) ?? null;

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    height: 36,
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "0 12px", borderRadius: 10,
                    background: isActive ? "rgba(13,166,242,0.08)" : "var(--card)",
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    border: isActive ? "1px solid rgba(13,166,242,0.35)" : "1px solid var(--stroke)",
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    cursor: "pointer", fontFamily: "var(--font)",
                    whiteSpace: "nowrap", transition: "all 0.15s ease",
                    minWidth: 120,
                }}
            >
                {/* Calendar icon */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="3" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                </svg>
                <span>{isActive ? formatDisplay(value) : placeholder}</span>
                {isActive && (
                    <span
                        onClick={e => { e.stopPropagation(); onChange(""); }}
                        style={{ marginLeft: 2, fontSize: 15, opacity: 0.6, lineHeight: 1, cursor: "pointer" }}
                    >×</span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <Calendar
                        value={value}
                        minDate={minD}
                        maxDate={maxD}
                        onChange={v => { onChange(v); setOpen(false); }}
                        onClose={() => setOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
