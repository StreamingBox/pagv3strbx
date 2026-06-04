import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { apiDelete, apiGet, apiPatch } from "../api/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import "../styles/special-effects.css";

const LOGO_URL = "/api/branding/logo";

const STATUS_OPTIONS = [
    { value: "active", label: "Activos" },
    { value: "revoked", label: "Desactivados" },
    { value: "expired", label: "Expirados" },
    { value: "all", label: "Todos" },
];

const STATUS_META = {
    active: { label: "Activo", color: "#10b981", bg: "rgba(16,185,129,0.14)", border: "rgba(16,185,129,0.32)" },
    revoked: { label: "Desactivado", color: "#f59e0b", bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.32)" },
    expired: { label: "Expirado", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.28)" },
};

const S = {
    main: { flex: 1, padding: "32px 40px 44px", position: "relative", zIndex: 1, overflowY: "auto" },
    header: {
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 24,
        borderBottom: "1px solid var(--stroke)",
        paddingBottom: 24,
    },
    headerLeft: { display: "flex", alignItems: "center", gap: 14 },
    icon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        background: "rgba(13,166,242,0.12)",
        border: "1px solid rgba(13,166,242,0.32)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
        boxShadow: "0 8px 24px rgba(13,166,242,0.16)",
        flexShrink: 0,
    },
    title: { margin: 0, fontSize: 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" },
    subtitle: { margin: "4px 0 0", color: "var(--muted)", fontSize: 13, fontWeight: 500 },
    card: {
        background: "var(--card)",
        border: "1px solid var(--stroke)",
        borderRadius: 14,
        boxShadow: "0 14px 36px rgba(0,0,0,0.18)",
    },
    filters: {
        padding: 16,
        marginBottom: 18,
        display: "grid",
        gridTemplateColumns: "minmax(260px, 1fr) 180px 120px auto",
        gap: 12,
        alignItems: "end",
    },
    label: { display: "flex", flexDirection: "column", gap: 7, minWidth: 0 },
    labelText: { color: "var(--muted)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7 },
    input: {
        height: 42,
        borderRadius: 10,
        border: "1px solid var(--stroke)",
        background: "var(--input-bg)",
        color: "var(--text)",
        padding: "0 12px",
        outline: "none",
        fontSize: 13,
        fontWeight: 650,
        fontFamily: "var(--font)",
        width: "100%",
        boxSizing: "border-box",
    },
    primaryBtn: {
        height: 42,
        borderRadius: 10,
        border: "none",
        background: "linear-gradient(135deg,#0da6f2,#8b5cf6)",
        color: "#fff",
        fontWeight: 850,
        fontSize: 13,
        cursor: "pointer",
        padding: "0 16px",
        fontFamily: "var(--font)",
        boxShadow: "0 8px 20px rgba(13,166,242,0.26)",
        whiteSpace: "nowrap",
    },
    ghostBtn: {
        height: 34,
        borderRadius: 9,
        border: "1px solid var(--stroke)",
        background: "rgba(255,255,255,0.04)",
        color: "var(--text)",
        fontWeight: 750,
        fontSize: 12,
        cursor: "pointer",
        padding: "0 11px",
        fontFamily: "var(--font)",
        whiteSpace: "nowrap",
    },
    dangerBtn: {
        height: 34,
        borderRadius: 9,
        border: "1px solid rgba(239,68,68,0.28)",
        background: "rgba(239,68,68,0.1)",
        color: "#ef4444",
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
        padding: "0 11px",
        fontFamily: "var(--font)",
        whiteSpace: "nowrap",
    },
    successBtn: {
        height: 34,
        borderRadius: 9,
        border: "1px solid rgba(16,185,129,0.3)",
        background: "rgba(16,185,129,0.12)",
        color: "#10b981",
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
        padding: "0 11px",
        fontFamily: "var(--font)",
        whiteSpace: "nowrap",
    },
    tableWrap: { overflowX: "auto", borderTop: "1px solid var(--stroke)" },
    table: { width: "100%", borderCollapse: "collapse", minWidth: 1040 },
    th: {
        padding: "12px 14px",
        textAlign: "left",
        color: "var(--muted)",
        fontSize: 10,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        background: "rgba(0,0,0,0.14)",
    },
    td: { padding: "14px", borderTop: "1px solid var(--stroke2)", color: "var(--text)", fontSize: 13, verticalAlign: "top" },
    muted: { color: "var(--muted)", fontSize: 12, lineHeight: 1.4 },
    strong: { color: "var(--text)", fontWeight: 850, lineHeight: 1.3 },
    footer: {
        padding: 14,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        borderTop: "1px solid var(--stroke)",
    },
};

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("es-CO", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function shortToken(token) {
    const value = String(token || "");
    if (value.length <= 16) return value || "-";
    return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function StatusBadge({ status }) {
    const meta = STATUS_META[status] || STATUS_META.expired;
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 850,
                color: meta.color,
                background: meta.bg,
                border: `1px solid ${meta.border}`,
            }}
        >
            {meta.label}
        </span>
    );
}

export default function AdminLinks() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();

    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [status, setStatus] = useState("active");
    const [q, setQ] = useState("");
    const [appliedQ, setAppliedQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState("");
    const [error, setError] = useState("");
    const [copiedId, setCopiedId] = useState("");
    const [totalPages, setTotalPages] = useState(1);

    const rangeLabel = useMemo(() => {
        if (!total) return "0 de 0";
        const start = (page - 1) * limit + 1;
        const end = Math.min(page * limit, total);
        return `${start}-${end} de ${total}`;
    }, [limit, page, total]);

    const load = useCallback(async (nextPage = 1, queryOverride = appliedQ) => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({
                page: String(nextPage),
                limit: String(limit),
                status,
            });
            if (queryOverride) params.set("q", queryOverride);
            const response = await apiGet(`/admin/links?${params.toString()}`);
            if (!response.ok) throw new Error(response.data?.message || "No se pudieron cargar los links.");
            setItems(Array.isArray(response.data?.items) ? response.data.items : []);
            setTotal(Number(response.data?.total || 0));
            setTotalPages(Number(response.data?.totalPages || 1));
            setPage(Number(response.data?.page || nextPage));
        } catch (err) {
            setError(err?.message || "Error cargando links.");
        } finally {
            setLoading(false);
        }
    }, [appliedQ, limit, status]);

    useEffect(() => {
        load(1);
    }, [load]);

    function applyFilters() {
        const query = q.trim();
        setAppliedQ(query);
        if (query === appliedQ) {
            load(1, query);
        }
    }

    async function copyLink(item) {
        try {
            await navigator.clipboard.writeText(item.url);
            setCopiedId(String(item.id));
            window.setTimeout(() => setCopiedId(""), 1600);
        } catch {
            window.prompt("Copia el link:", item.url);
        }
    }

    async function mutateLink(item, action) {
        const id = item.id;
        if (action === "revoke" && !window.confirm("¿Desactivar este link? El cliente ya no podrá abrirlo.")) return;
        if (action === "reactivate" && !window.confirm("¿Reactivar este link? Solo funcionará si la cuenta aún está vigente.")) return;
        if (action === "delete" && !window.confirm("¿Borrar este link? Solo se elimina el enlace, no la cuenta ni la suscripción.")) return;

        setSavingId(`${action}:${id}`);
        setError("");
        try {
            const response = action === "delete"
                ? await apiDelete(`/admin/links/${id}`)
                : await apiPatch(`/admin/links/${id}/${action}`, {});
            if (!response.ok) {
                const fallback = action === "delete" ? "No se pudo borrar el link." : "No se pudo actualizar el link.";
                throw new Error(response.data?.message || fallback);
            }
            await load(page);
        } catch (err) {
            setError(err?.message || "Error actualizando link.");
        } finally {
            setSavingId("");
        }
    }

    const renderActions = (item) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={S.ghostBtn} onClick={() => copyLink(item)}>
                {copiedId === String(item.id) ? "Copiado" : "Copiar"}
            </button>
            <a href={item.url} target="_blank" rel="noreferrer" style={{ ...S.ghostBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                Abrir
            </a>
            {item.status === "revoked" ? (
                <button
                    type="button"
                    style={{ ...S.successBtn, opacity: savingId ? 0.65 : 1 }}
                    onClick={() => mutateLink(item, "reactivate")}
                    disabled={Boolean(savingId)}
                >
                    Reactivar
                </button>
            ) : (
                <button
                    type="button"
                    style={{ ...S.dangerBtn, opacity: savingId ? 0.65 : 1 }}
                    onClick={() => mutateLink(item, "revoke")}
                    disabled={Boolean(savingId)}
                >
                    Desactivar
                </button>
            )}
            <button
                type="button"
                style={{ ...S.dangerBtn, opacity: savingId ? 0.65 : 1 }}
                onClick={() => mutateLink(item, "delete")}
                disabled={Boolean(savingId)}
            >
                Borrar
            </button>
        </div>
    );

    return (
        <div className="page-shell">
            <style>{`
                @media (max-width: 900px) {
                    .admin-links-main { padding: 24px 16px 36px !important; }
                    .admin-links-filters { grid-template-columns: 1fr !important; }
                    .admin-links-table { display: none; }
                    .admin-links-cards { display: grid !important; }
                }
                @media (min-width: 901px) {
                    .admin-links-cards { display: none !important; }
                }
            `}</style>
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-grid" />
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
            </div>

            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    logoSrc={LOGO_URL}
                    logoOk={true}
                    setLogoOk={() => {}}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main admin-links-main" style={S.main}>
                    <div style={S.header}>
                        <div style={S.headerLeft}>
                            <div style={S.icon}>🔗</div>
                            <div>
                                <h1 style={S.title}>Links</h1>
                                <p style={S.subtitle}>Gestiona los enlaces de credenciales activos, desactivados y vencidos.</p>
                            </div>
                        </div>
                        <button type="button" style={S.ghostBtn} onClick={() => load(page)} disabled={loading}>
                            {loading ? "Cargando..." : "Refrescar"}
                        </button>
                    </div>

                    {error ? (
                        <div style={{ ...S.card, padding: 14, marginBottom: 16, color: "#ef4444", borderColor: "rgba(239,68,68,0.32)", background: "rgba(239,68,68,0.1)" }}>
                            {error}
                        </div>
                    ) : null}

                    <div style={{ ...S.card, ...S.filters }} className="admin-links-filters">
                        <label style={S.label}>
                            <span style={S.labelText}>Buscar</span>
                            <input
                                style={S.input}
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                                onKeyDown={(event) => event.key === "Enter" && applyFilters()}
                                placeholder="Usuario, plataforma, orden, token..."
                            />
                        </label>
                        <label style={S.label}>
                            <span style={S.labelText}>Estado</span>
                            <select style={S.input} value={status} onChange={(event) => setStatus(event.target.value)}>
                                {STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                        <label style={S.label}>
                            <span style={S.labelText}>Mostrar</span>
                            <select style={S.input} value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </label>
                        <button type="button" style={S.primaryBtn} onClick={applyFilters} disabled={loading}>
                            Filtrar
                        </button>
                    </div>

                    <section style={S.card}>
                        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div style={S.strong}>Links encontrados <span style={{ color: "#8b5cf6" }}>{total}</span></div>
                            <div style={S.muted}>{loading ? "Cargando..." : `Mostrando ${rangeLabel}`}</div>
                        </div>

                        <div style={S.tableWrap} className="admin-links-table">
                            <table style={S.table}>
                                <thead>
                                    <tr>
                                        <th style={S.th}>Link</th>
                                        <th style={S.th}>Usuario</th>
                                        <th style={S.th}>Cuenta</th>
                                        <th style={S.th}>Orden / Suscripción</th>
                                        <th style={S.th}>Estado</th>
                                        <th style={S.th}>Fechas</th>
                                        <th style={S.th}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td style={S.td}>
                                                <div style={S.strong}>#{item.id}</div>
                                                <div style={S.muted}>{shortToken(item.token)}</div>
                                            </td>
                                            <td style={S.td}>
                                                <div style={S.strong}>{item.user_name || "-"}</div>
                                                <div style={S.muted}>{item.user_email || "-"}</div>
                                            </td>
                                            <td style={S.td}>
                                                <div style={S.strong}>{item.platform_name || "-"}</div>
                                                <div style={S.muted}>{item.account_email || "Sin correo"}</div>
                                                <div style={S.muted}>Perfil: {item.profile_number || "-"}</div>
                                            </td>
                                            <td style={S.td}>
                                                <div style={S.strong}>{item.order_code || "-"}</div>
                                                <div style={S.muted}>Suscripción #{item.subscription_id || "-"}</div>
                                            </td>
                                            <td style={S.td}>
                                                <StatusBadge status={item.status} />
                                                {item.revoked_by_email ? <div style={{ ...S.muted, marginTop: 6 }}>Por: {item.revoked_by_email}</div> : null}
                                            </td>
                                            <td style={S.td}>
                                                <div style={S.muted}>Creado: {formatDate(item.created_at)}</div>
                                                <div style={S.muted}>Expira: {formatDate(item.account_expires_at || item.subscription_expires_at)}</div>
                                                {item.revoked_at ? <div style={S.muted}>Desactivado: {formatDate(item.revoked_at)}</div> : null}
                                            </td>
                                            <td style={S.td}>{renderActions(item)}</td>
                                        </tr>
                                    ))}
                                    {!items.length ? (
                                        <tr>
                                            <td colSpan={7} style={{ ...S.td, textAlign: "center", padding: "42px 16px", color: "var(--muted)" }}>
                                                {loading ? "Cargando links..." : "No hay links para esos filtros."}
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>

                        <div className="admin-links-cards" style={{ display: "none", gap: 12, padding: "0 14px 14px" }}>
                            {items.map((item) => (
                                <article key={item.id} style={{ border: "1px solid var(--stroke2)", borderRadius: 12, padding: 14, background: "rgba(255,255,255,0.03)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                                        <div>
                                            <div style={S.strong}>#{item.id} · {item.platform_name || "-"}</div>
                                            <div style={S.muted}>{item.user_email || "-"}</div>
                                        </div>
                                        <StatusBadge status={item.status} />
                                    </div>
                                    <div style={{ ...S.muted, marginTop: 10 }}>
                                        Token: {shortToken(item.token)}<br />
                                        Cuenta: {item.account_email || "Sin correo"} · Perfil {item.profile_number || "-"}<br />
                                        Orden: {item.order_code || "-"} · Suscripción #{item.subscription_id || "-"}<br />
                                        Expira: {formatDate(item.account_expires_at || item.subscription_expires_at)}
                                    </div>
                                    <div style={{ marginTop: 12 }}>{renderActions(item)}</div>
                                </article>
                            ))}
                        </div>

                        <div style={S.footer}>
                            <div style={S.muted}>Página {page} / {totalPages}</div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button type="button" style={S.ghostBtn} onClick={() => load(Math.max(1, page - 1))} disabled={loading || page <= 1}>
                                    Anterior
                                </button>
                                <button type="button" style={S.ghostBtn} onClick={() => load(Math.min(totalPages, page + 1))} disabled={loading || page >= totalPages}>
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
