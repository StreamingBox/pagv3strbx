import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { apiFetch, apiLogout } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

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

export default function AdminSalesTop() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [monthValue, setMonthValue] = useState(currentMonthValue);
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
                const response = await apiFetch(`/admin/analytics/sales-top?year=${year}&month=${month}`, { method: "GET" });
                if (!response.ok) throw new Error(response.data?.error || response.data?.message || "No se pudo cargar el top de ventas.");
                if (cancelled) return;
                setSummary(response.data?.summary || null);
                setItems(Array.isArray(response.data?.items) ? response.data.items : []);
            } catch (err) {
                if (cancelled) return;
                setError(err?.message || "No se pudo cargar el top de ventas.");
                setSummary(null);
                setItems([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadData();
        return () => { cancelled = true; };
    }, [monthValue]);

    const cards = useMemo(() => ([
        {
            label: "Ventas del mes",
            value: `$${formatMoney(summary?.monthRevenue)} COP`,
            hint: "Facturación total del mes seleccionado",
            tone: "#0ea5e9",
        },
        {
            label: "Cantidad de ventas",
            value: formatMoney(summary?.ordersCount),
            hint: "Órdenes cerradas en el mes",
            tone: "#10b981",
        },
        {
            label: "Dinero comprado",
            value: `$${formatMoney(summary?.costTotal)} COP`,
            hint: "Costo invertido en las ventas del mes",
            tone: "#f59e0b",
        },
        {
            label: "Plataforma más vendida",
            value: summary?.topPlatform?.name || "—",
            hint: summary?.topPlatform?.salesCount ? `${formatMoney(summary.topPlatform.salesCount)} ventas` : "Sin ventas registradas",
            tone: "#8b5cf6",
        },
    ]), [summary]);

    return (
        <div className="page-shell">
            <style>{`
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
                @media (max-width: 1120px) {
                    .admin-sales-top-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                            <div>
                                <h1 className="title" style={{ margin: 0, fontSize: 26 }}>Top de ventas</h1>
                                <p className="subtitle" style={{ marginTop: 6 }}>Resumen mensual por vendedor con ranking, costo y plataforma líder.</p>
                            </div>

                            <div className="admin-sales-top-toolbar" style={{ display: "grid", gridTemplateColumns: "180px auto", gap: 10, alignItems: "end" }}>
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
                                <div style={{
                                    minHeight: 44,
                                    padding: "0 14px",
                                    borderRadius: 12,
                                    border: "1px solid rgba(14,165,233,0.18)",
                                    background: "linear-gradient(180deg, rgba(14,165,233,0.08), rgba(139,92,246,0.06))",
                                    color: "var(--text)",
                                    display: "flex",
                                    alignItems: "center",
                                    fontSize: 12,
                                    fontWeight: 700,
                                }}>
                                    Ordenado por ventas del mes, de mayor a menor.
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
                                    <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>Valor en ventas, cantidad, dinero comprado y plataforma más vendida por usuario.</p>
                                </div>
                                <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>
                                    {loading ? "Cargando..." : `${items.length} vendedores con ventas en el mes`}
                                </div>
                            </div>

                            <div className="admin-sales-top-tableWrap" style={{ overflowX: "auto" }}>
                                <table className="admin-sales-top-table">
                                    <thead>
                                        <tr style={{ borderBottom: "1px solid var(--stroke)" }}>
                                            {["Top", "Usuario", "Ventas del mes", "Cantidad ventas", "Dinero comprado", "Plataforma más vendida"].map((label) => (
                                                <th key={label} style={{ textAlign: "left", padding: "0 14px 14px 0", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                                                    {label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item) => (
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
                                                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{item.email}</div>
                                                </td>
                                                <td style={{ padding: "14px 14px 14px 0", verticalAlign: "top", color: "#0ea5e9", fontWeight: 900, fontSize: 18 }}>
                                                    ${formatMoney(item.monthRevenue)} COP
                                                </td>
                                                <td style={{ padding: "14px 14px 14px 0", verticalAlign: "top" }}>
                                                    <div style={{ color: "var(--text)", fontWeight: 800 }}>{formatMoney(item.ordersCount)}</div>
                                                    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{formatMoney(item.itemsCount)} items</div>
                                                </td>
                                                <td style={{ padding: "14px 14px 14px 0", verticalAlign: "top", color: "#f59e0b", fontWeight: 800 }}>
                                                    ${formatMoney(item.costTotal)} COP
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
                                {items.map((item) => (
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
                                                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{item.email}</div>
                                            </div>
                                            <div style={{ color: item.rank === 1 ? "#f59e0b" : "var(--text)", fontWeight: 900 }}>#{item.rank}</div>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                            <div>
                                                <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>Ventas del mes</div>
                                                <div style={{ color: "#0ea5e9", fontWeight: 900, marginTop: 4 }}>${formatMoney(item.monthRevenue)} COP</div>
                                            </div>
                                            <div>
                                                <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>Cantidad ventas</div>
                                                <div style={{ color: "var(--text)", fontWeight: 900, marginTop: 4 }}>{formatMoney(item.ordersCount)}</div>
                                            </div>
                                            <div>
                                                <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", fontWeight: 800 }}>Dinero comprado</div>
                                                <div style={{ color: "#f59e0b", fontWeight: 900, marginTop: 4 }}>${formatMoney(item.costTotal)} COP</div>
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
                                    No hay ventas registradas para el mes seleccionado.
                                </div>
                            ) : null}
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}
