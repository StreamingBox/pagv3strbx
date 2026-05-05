import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { apiFetch, apiLogout } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";
const CURRENCY_OPTIONS = [
    { value: "COP", label: "COP" },
    { value: "MXN", label: "MXN" },
    { value: "USD", label: "USDT" },
];

function currentMonthValue() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value || "2026";
    const month = parts.find((part) => part.type === "month")?.value || "01";
    return `${year}-${month}`;
}

function formatMoney(value) {
    return new Intl.NumberFormat("es-CO").format(Number(value || 0));
}

function displayCurrency(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "USD") return "USDT";
    return normalized || "COP";
}

export default function AdminSalesTop() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [monthValue, setMonthValue] = useState(currentMonthValue);
    const [currency, setCurrency] = useState("COP");
    const [showEmails, setShowEmails] = useState(true);
    const [pageSize, setPageSize] = useState(5);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [summary, setSummary] = useState(null);
    const [items, setItems] = useState([]);

    async function logout() {
        try { await apiLogout(); } catch { }
        setUser(null);
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
        } catch { }
        navigate("/", { replace: true });
    }

    useEffect(() => {
        let cancelled = false;

        async function loadData() {
            setLoading(true);
            setError("");
            try {
                const [year, month] = monthValue.split("-");
                const response = await apiFetch(`/admin/analytics/sales-top?year=${year}&month=${month}&currency=${currency}`, { method: "GET" });
                if (!response.ok) throw new Error(response.data?.error || response.data?.message || "No se pudo cargar el top de ventas.");
                if (cancelled) return;
                setSummary(response.data?.summary || null);
                setItems(Array.isArray(response.data?.items) ? response.data.items : []);
                setPage(1);
            } catch (err) {
                if (cancelled) return;
                setError(err?.message || "No se pudo cargar el top de ventas.");
                setSummary(null);
                setItems([]);
                setPage(1);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadData();
        return () => { cancelled = true; };
    }, [monthValue, currency]);

    const activeCurrency = displayCurrency(summary?.currency || currency);
    const totalPages = Math.max(Math.ceil(items.length / pageSize), 1);
    const currentPage = Math.min(page, totalPages);
    const visibleItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const cards = useMemo(() => ([
        {
            label: "Ventas del mes",
            value: `$${formatMoney(summary?.monthRevenue)} ${activeCurrency}`,
            hint: `Facturación total del mes seleccionado en ${activeCurrency}`,
            tone: "#0ea5e9",
        },
        {
            label: "Cantidad de ventas",
            value: formatMoney(summary?.ordersCount),
            hint: `Órdenes cerradas en ${activeCurrency}`,
            tone: "#10b981",
        },
        {
            label: "Plataforma más vendida",
            value: summary?.topPlatform?.name || "—",
            hint: summary?.topPlatform?.salesCount ? `${formatMoney(summary.topPlatform.salesCount)} ventas` : "Sin ventas registradas",
            tone: "#8b5cf6",
        },
    ]), [summary, activeCurrency]);

    return (
        <div className="page-shell">
            <style>{`
                .admin-sales-top-head {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(320px, 540px);
                    gap: 14px 18px;
                    align-items: start;
                }
                .admin-sales-top-grid {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 14px;
                }
                .admin-sales-top-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .admin-sales-top-mobileList {
                    display: none;
                }
                .admin-sales-top-sectionControls {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                }
                .admin-sales-top-toolbar {
                    display: grid;
                    grid-template-columns: minmax(180px, 220px) minmax(140px, 160px);
                    gap: 10px;
                    align-items: end;
                }
                .admin-sales-top-orderHint {
                    min-height: 44px;
                    padding: 0 14px;
                    border-radius: 12px;
                    border: 1px solid rgba(14,165,233,0.18);
                    background: linear-gradient(180deg, rgba(14,165,233,0.08), rgba(139,92,246,0.06));
                    color: var(--text);
                    display: flex;
                    align-items: center;
                    font-size: 12px;
                    font-weight: 700;
                    grid-column: 1 / -1;
                }
                @media (max-width: 1120px) {
                    .admin-sales-top-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (max-width: 1040px) {
                    .admin-sales-top-head {
                        grid-template-columns: 1fr;
                    }
                }
                @media (max-width: 920px) {
                    .admin-sales-top-tableWrap {
                        display: none;
                    }
                    .admin-sales-top-mobileList {
                        display: grid;
                        gap: 12px;
                    }
                    .admin-sales-top-sectionControls {
                        width: 100%;
                        justify-content: flex-start;
                    }
                }
                @media (max-width: 640px) {
                    .admin-sales-top-main {
                        padding: 16px 14px 28px !important;
                    }
                    .admin-sales-top-grid {
                        grid-template-columns: 1fr;
                    }
                    .admin-sales-top-toolbar {
                        grid-template-columns: 1fr !important;
                    }
                    .admin-sales-top-orderHint {
                        min-height: unset;
                        padding: 12px 14px;
                    }
                }
            `}</style>

            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => { }}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main admin-sales-top-main" style={{ padding: "16px 20px 28px" }}>
                    <button
                        className="btn-ghost"
                        onClick={() => navigate("/admin")}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 14px", marginBottom: 12, borderRadius: 10 }}
                    >
                        <span>←</span>
                        <span>Volver al panel</span>
                    </button>

                    <div style={{
                        background: "var(--card)",
                        border: "1px solid var(--stroke)",
                        borderRadius: 18,
                        padding: 22,
                        boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
                        display: "grid",
                        gap: 18,
                    }}>
                        <div className="admin-sales-top-head">
                            <div>
                                <h1 className="title" style={{ margin: 0, fontSize: 26 }}>Top de ventas</h1>
                                <p className="subtitle" style={{ marginTop: 6 }}>Resumen mensual por vendedor con ranking, ventas y plataforma líder.</p>
                            </div>

                            <div className="admin-sales-top-toolbar">
                                <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                    Mes
                                    <input
                                        type="month"
                                        value={monthValue}
                                        onChange={(event) => setMonthValue(event.target.value)}
                                        style={{
                                            height: 44,
                                            padding: "0 14px",
                                            background: "var(--input-bg)",
                                            color: "var(--text)",
                                            border: "1px solid var(--stroke)",
                                            borderRadius: 12,
                                            fontSize: 14,
                                            fontWeight: 600,
                                            fontFamily: "var(--font)",
                                        }}
                                    />
                                </label>
                                <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                    Moneda
                                    <select
                                        value={currency}
                                        onChange={(event) => setCurrency(event.target.value)}
                                        style={{
                                            height: 44,
                                            padding: "0 14px",
                                            background: "var(--input-bg)",
                                            color: "var(--text)",
                                            border: "1px solid var(--stroke)",
                                            borderRadius: 12,
                                            fontSize: 14,
                                            fontWeight: 600,
                                            fontFamily: "var(--font)",
                                        }}
                                    >
                                        {CURRENCY_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <div className="admin-sales-top-orderHint">
                                    Ordenado por ventas del mes, de mayor a menor, dentro de {activeCurrency}.
                                </div>
                            </div>
                        </div>

                        <div className="admin-sales-top-grid">
                            {cards.map((card) => (
                                <motion.div
                                    key={card.label}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
                                        border: `1px solid ${card.tone}33`,
                                        borderRadius: 16,
                                        padding: 18,
                                        boxShadow: `0 0 0 1px ${card.tone}10 inset, 0 12px 30px rgba(0,0,0,0.14)`,
                                        display: "grid",
                                        gap: 8,
                                    }}
                                >
                                    <div style={{ color: card.tone, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{card.label}</div>
                                    <div style={{ color: "var(--text)", fontSize: 27, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.05 }}>{card.value}</div>
                                    <div style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>{card.hint}</div>
                                </motion.div>
                            ))}
                        </div>

                        {error ? (
                            <div style={{
                                background: "rgba(239,68,68,0.1)",
                                border: "1px solid rgba(239,68,68,0.28)",
                                borderRadius: 14,
                                padding: "14px 16px",
                                color: "#fca5a5",
                                fontWeight: 700,
                            }}>
                                {error}
                            </div>
                        ) : null}

                        <section style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid var(--stroke)",
                            borderRadius: 18,
                            padding: 18,
                            display: "grid",
                            gap: 16,
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 22, color: "var(--text)" }}>Ranking mensual</h2>
                                    <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>Valor en ventas, cantidad y plataforma más vendida por usuario.</p>
                                </div>
                                <div className="admin-sales-top-sectionControls">
                                    <label style={{ display: "grid", gap: 6, color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                        Mostrar
                                        <select
                                            value={pageSize}
                                            onChange={(event) => {
                                                setPageSize(Number(event.target.value));
                                                setPage(1);
                                            }}
                                            style={{
                                                height: 40,
                                                minWidth: 88,
                                                padding: "0 12px",
                                                background: "var(--input-bg)",
                                                color: "var(--text)",
                                                border: "1px solid var(--stroke)",
                                                borderRadius: 12,
                                                fontSize: 14,
                                                fontWeight: 600,
                                                fontFamily: "var(--font)",
                                            }}
                                        >
                                            {[5, 10, 15, 20].map((size) => (
                                                <option key={size} value={size}>{size}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        className="btn-ghost"
                                        onClick={() => setShowEmails((prev) => !prev)}
                                        style={{ minHeight: 40, padding: "0 14px", borderRadius: 12, fontSize: 13, fontWeight: 700 }}
                                    >
                                        {showEmails ? "Omitir correos" : "Mostrar correos"}
                                    </button>
                                    <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                        {loading ? "Cargando..." : `${items.length} vendedores con ventas en ${activeCurrency}`}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-sales-top-tableWrap" style={{ overflowX: "auto" }}>
                                <table className="admin-sales-top-table">
                                    <thead>
                                        <tr style={{ borderBottom: "1px solid var(--stroke)" }}>
                                            {["Top", "Usuario", `Ventas del mes (${activeCurrency})`, "Cantidad ventas", "Plataforma más vendida"].map((label) => (
                                                <th key={label} style={{ textAlign: "left", padding: "0 14px 14px 0", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                                                    {label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleItems.map((item) => (
                                            <tr key={item.userId} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                                <td style={{ padding: "14px 14px 14px 0", verticalAlign: "top" }}>
                                                    <div style={{
                                                        width: 36,
                                                        height: 36,
                                                        borderRadius: 12,
                                                        display: "grid",
                                                        placeItems: "center",
                                                        fontWeight: 900,
                                                        color: item.rank === 1 ? "#f59e0b" : "var(--text)",
                                                        background: item.rank === 1 ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
                                                        border: `1px solid ${item.rank === 1 ? "rgba(245,158,11,0.28)" : "rgba(255,255,255,0.08)"}`,
                                                    }}>
                                                        #{item.rank}
                                                    </div>
                                                </td>
                                                <td style={{ padding: "14px 14px 14px 0", verticalAlign: "top" }}>
                                                    <div style={{ color: "var(--text)", fontWeight: 800, fontSize: 15 }}>{item.userName}</div>
                                                    {showEmails ? <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{item.email}</div> : null}
                                                </td>
                                                <td style={{ padding: "14px 14px 14px 0", verticalAlign: "top", color: "#0ea5e9", fontWeight: 900, fontSize: 18 }}>
                                                    ${formatMoney(item.monthRevenue)} {activeCurrency}
                                                </td>
                                                <td style={{ padding: "14px 14px 14px 0", verticalAlign: "top" }}>
                                                    <div style={{ color: "var(--text)", fontWeight: 800 }}>{formatMoney(item.ordersCount)}</div>
                                                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{formatMoney(item.itemsCount)} items</div>
                                                </td>
                                                <td style={{ padding: "14px 0 14px 0", verticalAlign: "top" }}>
                                                    <div style={{ color: "var(--text)", fontWeight: 800 }}>{item.topPlatform?.name || "—"}</div>
                                                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                                                        {item.topPlatform?.salesCount ? `${formatMoney(item.topPlatform.salesCount)} ventas` : "Sin datos"}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="admin-sales-top-mobileList">
                                {visibleItems.map((item) => (
                                    <div key={item.userId} style={{
                                        border: "1px solid var(--stroke)",
                                        borderRadius: 16,
                                        padding: 16,
                                        background: "rgba(255,255,255,0.02)",
                                        display: "grid",
                                        gap: 12,
                                    }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                            <div>
                                                <div style={{ color: "var(--text)", fontWeight: 900 }}>{item.userName}</div>
                                                {showEmails ? <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{item.email}</div> : null}
                                            </div>
                                            <div style={{ color: item.rank === 1 ? "#f59e0b" : "var(--text)", fontWeight: 900 }}>#{item.rank}</div>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                            <div>
                                                <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>Ventas del mes</div>
                                                <div style={{ color: "#0ea5e9", fontWeight: 900, marginTop: 4 }}>${formatMoney(item.monthRevenue)} {activeCurrency}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>Cantidad ventas</div>
                                                <div style={{ color: "var(--text)", fontWeight: 900, marginTop: 4 }}>{formatMoney(item.ordersCount)}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>Plataforma top</div>
                                                <div style={{ color: "var(--text)", fontWeight: 900, marginTop: 4 }}>{item.topPlatform?.name || "—"}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {!loading && items.length === 0 ? (
                                <div style={{
                                    border: "1px dashed rgba(255,255,255,0.14)",
                                    borderRadius: 16,
                                    padding: "24px 18px",
                                    color: "var(--muted)",
                                    textAlign: "center",
                                    fontWeight: 700,
                                }}>
                                    No hay ventas registradas para {activeCurrency} en el mes seleccionado.
                                </div>
                            ) : null}

                            {!loading && items.length > 0 ? (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                    <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                        Página {currentPage} de {totalPages} · Mostrando {visibleItems.length} de {items.length}
                                    </div>
                                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <button
                                            className="btn-ghost"
                                            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                                            disabled={currentPage <= 1}
                                            style={{ minHeight: 40, padding: "0 14px", borderRadius: 12, opacity: currentPage <= 1 ? 0.55 : 1 }}
                                        >
                                            Anterior
                                        </button>
                                        <button
                                            className="btn-ghost"
                                            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                                            disabled={currentPage >= totalPages}
                                            style={{ minHeight: 40, padding: "0 14px", borderRadius: 12, opacity: currentPage >= totalPages ? 0.55 : 1 }}
                                        >
                                            Siguiente
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}
