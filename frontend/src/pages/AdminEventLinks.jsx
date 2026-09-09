import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, Link2, PauseCircle, Radio, RefreshCw, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiGet, apiPatch, apiPost } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import "../styles/admin-event-links.css";

function formatMoney(value) {
    return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function formatBogota(value) {
    if (!value) return "-";
    const raw = String(value);
    const date = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function secondsRemaining(value, now) {
    if (!value) return 0;
    const raw = String(value);
    const end = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`).getTime();
    return Number.isFinite(end) ? Math.max(0, Math.floor((end - now) / 1000)) : 0;
}

function countdownLabel(value, now) {
    const total = secondsRemaining(value, now);
    if (!total) return "Finalizado";
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${hours ? `${hours} h ` : ""}${minutes} min ${seconds.toString().padStart(2, "0")} s`;
}

export default function AdminEventLinks() {
    const navigate = useNavigate();
    const logout = useAppLogout();
    const { user } = useAuth();
    const [platforms, setPlatforms] = useState([]);
    const [events, setEvents] = useState([]);
    const [platformId, setPlatformId] = useState("");
    const [title, setTitle] = useState("");
    const [url, setUrl] = useState("");
    const [endsAt, setEndsAt] = useState("");
    const [unitCost, setUnitCost] = useState(3000);
    const [monthlyCost, setMonthlyCost] = useState(20000);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [closingId, setClosingId] = useState(null);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [now, setNow] = useState(Date.now());

    const selectedPlatform = useMemo(
        () => platforms.find((platform) => Number(platform.id) === Number(platformId)) || null,
        [platforms, platformId]
    );
    const liveEvent = useMemo(
        () => events.find((event) => event.isActive && secondsRemaining(event.endsAt, now) > 0) || null,
        [events, now]
    );

    const loadPlatforms = useCallback(async () => {
        const response = await apiGet("/admin/event-links/platforms");
        if (!response.ok) throw new Error(response.data?.message || "No se pudieron cargar los productos por evento.");
        const list = Array.isArray(response.data) ? response.data : [];
        setPlatforms(list);
        setPlatformId((current) => {
            const currentId = String(current || "");
            return list.some((platform) => String(platform.id) === currentId)
                ? currentId
                : (list[0] ? String(list[0].id) : "");
        });
        return list;
    }, []);

    const loadEvents = useCallback(async (currentPlatformId) => {
        if (!currentPlatformId) {
            setEvents([]);
            return;
        }
        const response = await apiGet(`/admin/event-links?platformId=${encodeURIComponent(currentPlatformId)}`);
        if (!response.ok) throw new Error(response.data?.message || "No se pudo cargar el historial de enlaces.");
        setEvents(Array.isArray(response.data) ? response.data : []);
    }, []);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const list = await loadPlatforms();
            const targetId = list.some((platform) => String(platform.id) === String(platformId))
                ? String(platformId)
                : (list[0] ? String(list[0].id) : "");
            await loadEvents(targetId);
        } catch (loadError) {
            setError(loadError?.message || "No se pudieron cargar los enlaces.");
        } finally {
            setLoading(false);
        }
    }, [loadEvents, loadPlatforms, platformId]);

    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        if (!platformId) return;
        void loadEvents(platformId).catch((loadError) => setError(loadError?.message || "No se pudo cargar el historial."));
    }, [platformId, loadEvents]);
    useEffect(() => {
        if (!selectedPlatform) return;
        setUnitCost(Number(selectedPlatform.unitCost || 3000));
        setMonthlyCost(Number(selectedPlatform.monthlyCost || 20000));
    }, [selectedPlatform]);

    async function saveCosts() {
        if (!selectedPlatform) return;
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const response = await apiPatch(`/admin/event-links/platforms/${selectedPlatform.id}/costs`, {
                unitCost: Number(unitCost),
                monthlyCost: Number(monthlyCost),
            });
            if (!response.ok) throw new Error(response.data?.message || "No se pudieron guardar los costos.");
            setNotice("Costos de rentabilidad actualizados.");
            await loadPlatforms();
        } catch (saveError) {
            setError(saveError?.message || "No se pudieron guardar los costos.");
        } finally {
            setSaving(false);
        }
    }

    async function publishEvent(event) {
        event.preventDefault();
        if (!selectedPlatform) return;
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const response = await apiPost("/admin/event-links", {
                platformId: selectedPlatform.id,
                title,
                url,
                endsAt,
                unitCost: Number(unitCost),
            });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo publicar el enlace.");
            setTitle("");
            setUrl("");
            setEndsAt("");
            setNotice("Enlace publicado. El catálogo lo mostrará hasta la hora de cierre en Colombia.");
            await Promise.all([loadPlatforms(), loadEvents(selectedPlatform.id)]);
        } catch (publishError) {
            setError(publishError?.message || "No se pudo publicar el enlace.");
        } finally {
            setSaving(false);
        }
    }

    async function closeEvent(eventId) {
        setClosingId(eventId);
        setError("");
        setNotice("");
        try {
            const response = await apiPatch(`/admin/event-links/${eventId}/close`, {});
            if (!response.ok) throw new Error(response.data?.message || "No se pudo cerrar el enlace.");
            setNotice("Enlace cerrado. El producto ya no tendrá stock en el catálogo.");
            await Promise.all([loadPlatforms(), loadEvents(platformId)]);
        } catch (closeError) {
            setError(closeError?.message || "No se pudo cerrar el enlace.");
        } finally {
            setClosingId(null);
        }
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden><div className="bg-grid" /></div>
            <div className="page-inner">
                <AdminSidebar user={user} uploadingLogo={false} onOpenLogoPicker={() => navigate("/admin")} onLogout={logout} />
                <main className="main event-links-main">
                    <header className="event-links-header">
                        <div className="event-links-heading">
                            <span className="event-links-icon"><Radio size={25} /></span>
                            <div className="event-links-heading-copy"><p className="event-links-kicker">Partidos en vivo</p><h1 className="event-links-title">Enlaces de YouTube por evento</h1><p className="event-links-subtitle">Publica un enlace temporal. Se entrega a cada compra hasta la hora final de Colombia.</p></div>
                        </div>
                        <button type="button" className="btn-ghost" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> Actualizar</button>
                    </header>

                    {error ? <div className="alert alert-error event-links-alert">{error}</div> : null}
                    {notice ? <div className="alert alert-success event-links-alert">{notice}</div> : null}
                    {!loading && !platforms.length ? <div className="alert alert-warning">No hay productos configurados para entrega por partido. Activa “Entrega por partido” en una plataforma para habilitarla aquí.</div> : null}

                    <section style={{ padding: 22, border: "1px solid var(--stroke)", background: "var(--card)", borderRadius: 12, marginBottom: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                            <div><h2 style={{ fontSize: 18, margin: 0 }}>Publicar transmisión</h2><p style={{ color: "var(--muted)", margin: "5px 0 0", fontSize: 13 }}>Un enlace activo equivale a disponibilidad. Al publicar otro, el anterior se cierra.</p></div>
                            <select className="event-links-select" value={platformId} onChange={(event) => setPlatformId(event.target.value)}>
                                {platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}{platform.liveCount ? " · en vivo" : ""}</option>)}
                            </select>
                        </div>

                        {liveEvent ? (
                            <div style={{ padding: 18, background: "rgba(16,185,129,.09)", border: "1px solid rgba(16,185,129,.32)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
                                <div><div style={{ color: "#34d399", fontSize: 12, fontWeight: 800, letterSpacing: ".05em" }}>ENLACE ACTIVO</div><strong style={{ display: "block", marginTop: 4 }}>{liveEvent.title}</strong><span style={{ color: "var(--muted)", fontSize: 13 }}>Cierra {formatBogota(liveEvent.endsAt)} · {liveEvent.deliveredCount} entregas registradas</span></div>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}><strong style={{ color: "#67e8f9", fontVariantNumeric: "tabular-nums" }}>{countdownLabel(liveEvent.endsAt, now)}</strong><button type="button" className="btn-ghost" onClick={() => void closeEvent(liveEvent.id)} disabled={closingId === liveEvent.id}>{closingId === liveEvent.id ? "Cerrando..." : <><PauseCircle size={16} /> Cerrar ahora</>}</button></div>
                            </div>
                        ) : <div style={{ padding: 14, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.26)", borderRadius: 10, color: "#fbbf24", fontSize: 14, marginBottom: 18 }}>No hay un enlace vigente: el catálogo muestra este producto sin stock hasta que publiques el próximo partido.</div>}

                        <form onSubmit={publishEvent} className="event-links-form">
                            <label className="event-links-field">Nombre del partido<input className="event-links-control" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: Nacional vs Medellín" maxLength={180} /></label>
                            <label className="event-links-field">Enlace de YouTube<input className="event-links-control" required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://youtube.com/..." /></label>
                            <label className="event-links-field">Finaliza (hora Colombia)<input className="event-links-control" required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
                            <button type="submit" className="btn event-links-submit" disabled={saving || !selectedPlatform}>{saving ? "Publicando..." : <><Link2 size={16} /> Publicar enlace</>}</button>
                        </form>
                    </section>

                    <section style={{ padding: 22, border: "1px solid var(--stroke)", background: "var(--card)", borderRadius: 12, marginBottom: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}><div><h2 style={{ fontSize: 18, margin: 0 }}>Costo para ganancias netas</h2><p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--muted)" }}>El mensual es referencia operativa. Cada entrega usa el costo por enlace al momento de la venta.</p></div><button type="button" className="btn-ghost" onClick={() => void saveCosts()} disabled={saving || !selectedPlatform}><Save size={16} /> Guardar costos</button></div>
                        <div className="event-links-cost-grid">
                            <label className="event-links-field">Costo mensual de enlaces (COP)<input className="event-links-control" type="number" min="0" step="1" value={monthlyCost} onChange={(event) => setMonthlyCost(event.target.value)} /></label>
                            <label className="event-links-field">Costo por enlace entregado (COP)<input className="event-links-control" type="number" min="0" step="1" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>
                            <div className="event-links-cost-note">Cada venta nueva descontará ${formatMoney(unitCost)} COP como costo.</div>
                        </div>
                    </section>

                    <section style={{ border: "1px solid var(--stroke)", background: "var(--card)", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "18px 22px", borderBottom: "1px solid var(--stroke)", alignItems: "center" }}><div><h2 style={{ fontSize: 18, margin: 0 }}>Historial y trazabilidad</h2><p style={{ margin: "5px 0 0", color: "var(--muted)", fontSize: 13 }}>Cada fila conserva el enlace que recibieron los compradores.</p></div><CalendarClock size={20} color="#67e8f9" /></div>
                        <div style={{ overflowX: "auto" }}><table className="data-table" style={{ minWidth: 860 }}><thead><tr><th>Estado</th><th>Partido</th><th>Finaliza Colombia</th><th>Entregas</th><th>Costo</th><th>Enlace</th><th /></tr></thead><tbody>{events.length ? events.map((event) => { const live = event.isActive && secondsRemaining(event.endsAt, now) > 0; return <tr key={event.id}><td><span className={`badge ${live ? "badge--renovable" : "badge--out"}`}>{live ? "En vivo" : "Cerrado"}</span></td><td><strong>{event.title}</strong></td><td>{formatBogota(event.endsAt)}</td><td>{event.deliveredCount}</td><td>${formatMoney(event.unitCost)} COP</td><td><a href={event.url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ display: "inline-flex", padding: "7px 10px" }}><ExternalLink size={14} /> Abrir</a></td><td>{live ? <button type="button" className="btn-ghost" onClick={() => void closeEvent(event.id)} disabled={closingId === event.id}>{closingId === event.id ? "..." : "Cerrar"}</button> : null}</td></tr>; }) : <tr><td colSpan="7" style={{ textAlign: "center", color: "var(--muted)", padding: 34 }}>Todavía no hay enlaces publicados para este producto.</td></tr>}</tbody></table></div>
                    </section>
                </main>
            </div>
        </div>
    );
}
