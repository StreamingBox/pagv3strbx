import { useEffect, useRef, useState } from "react";
import { Download, ListFilter, RefreshCw, Save, Search, Settings2, UsersRound, X } from "lucide-react";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { apiGet, apiFetch } from "../api/api";
import { loadXlsx } from "../utils/loadXlsx.js";
import ReferralHistory, { ReferralMetrics } from "../components/referrals/ReferralHistory.jsx";
import { dateTime, money, REASON_LABELS, STATUS_LABELS } from "../utils/referrals.js";
import "../styles/referrals.css";

const EMPTY_FILTERS = { search: "", status: "", from: "", to: "" };
const LOCAL_OFFSET_MS = 5 * 60 * 60 * 1000;
const toLocal = value => value ? new Date(new Date(value).getTime() - LOCAL_OFFSET_MS).toISOString().slice(0, 16) : "";
const toUtc = value => value ? new Date(value + ":00-05:00").toISOString() : null;
const EVENT_LABELS = { registered: "Invitación registrada", progress: "Recarga sumada a la meta", contact_authorized: "Contacto autorizado", contact_revoked: "Autorización de contacto retirada", credited: "Premio acreditado", review: "Enviado a revisión", cancelled: "Cancelado", expired: "Plazo vencido", ineligible: "No elegible", reversed: "Premio revertido", settings_updated: "Configuración actualizada" };

function EventList({ events }) {
    return <ul className="referrals-events">{events?.map((event, index) => {
        let detail;
        try { detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail; } catch { detail = {}; }
        const reason = detail?.reason;
        return <li key={index}><div><strong>{EVENT_LABELS[event.action] || event.action}</strong>{reason && <small>{REASON_LABELS[reason] || reason}</small>}{event.action === "progress" && <small>+{money(detail?.amount)} · Acumulado {money(detail?.progress)}</small>}<small>{event.actorUserId ? "Usuario #" + event.actorUserId : "Automático"}</small></div><time>{dateTime(event.createdAt)}</time></li>;
    })}</ul>;
}

export default function AdminReferrals() {
    const { user } = useAuth();
    const logout = useAppLogout();
    const [tab, setTab] = useState("history");
    const [settingsInfo, setSettingsInfo] = useState(null);
    const [form, setForm] = useState(null);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [data, setData] = useState(null);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [applied, setApplied] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [acting, setActing] = useState(false);
    const detailRequest = useRef(0);
    const settingsDirty = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        async function loadSettings() {
            setSettingsLoading(true);
            const response = await apiGet("/admin/referrals/settings", { signal: controller.signal });
            if (controller.signal.aborted) return;
            if (response.ok) {
                setSettingsInfo(response.data);
                if (!settingsDirty.current) setForm({ ...response.data.settings, startsAt: toLocal(response.data.settings.startsAt), endsAt: toLocal(response.data.settings.endsAt) });
            } else setError(response.data?.message || "No se pudo cargar la configuración.");
            setSettingsLoading(false);
        }
        void loadSettings();
        return () => controller.abort();
    }, [revision]);

    useEffect(() => {
        const controller = new AbortController();
        async function loadHistory() {
            setLoading(true);
            const response = await apiGet("/admin/referrals?" + new URLSearchParams({ ...applied, page }), { signal: controller.signal });
            if (controller.signal.aborted) return;
            if (response.ok) setData(response.data);
            else { setData(null); setError(response.data?.message || "No se pudieron cargar los referidos."); }
            setLoading(false);
        }
        void loadHistory();
        return () => controller.abort();
    }, [applied, page, revision]);

    async function saveSettings(event) {
        event.preventDefault(); setSaving(true); setError(""); setMessage("");
        try {
            const { version, ...values } = form;
            const response = await apiFetch("/admin/referrals/settings", { method: "PUT", body: JSON.stringify({ ...values, startsAt: toUtc(values.startsAt), endsAt: toUtc(values.endsAt), expectedVersion: version }) });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo guardar la campaña.");
            settingsDirty.current = false;
            setMessage(response.data.campaign.active ? "Campaña guardada y activa para nuevos registros." : "Configuración guardada. No se aceptan nuevos premios fuera de la vigencia.");
            setRevision(value => value + 1);
        } catch (failure) { setError(failure.message); }
        finally { setSaving(false); }
    }

    async function loadDetail(id) {
        const request = ++detailRequest.current;
        setDetailLoading(true); setDetail(null); setCancelReason(""); setError("");
        const response = await apiGet("/admin/referrals/" + id);
        if (request !== detailRequest.current) return;
        if (response.ok) setDetail(response.data);
        else setError(response.data?.message || "No se pudo cargar el detalle.");
        setDetailLoading(false);
    }

    async function act(action) {
        setActing(true); setError(""); setMessage("");
        try {
            const id = detail.item.id;
            const response = await apiFetch("/admin/referrals/" + id + "/" + action, { method: "POST", body: JSON.stringify(["cancel", "reverse"].includes(action) ? { reason: cancelReason } : {}) });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo actualizar el referido.");
            setMessage(action === "cancel" ? "Premio cancelado; el historial se conserva." : action === "reverse" ? "Premio revertido con movimiento compensatorio." : response.data.result.status === "credited" ? "Premio acreditado." : "El premio sigue en revisión: " + (REASON_LABELS[response.data.result.reason] || "revisa las condiciones."));
            setRevision(value => value + 1);
            await loadDetail(id);
        } catch (failure) { setError(failure.message); }
        finally { setActing(false); }
    }

    async function exportExcel() {
        setExporting(true); setError("");
        try {
            const response = await apiGet("/admin/referrals/export?" + new URLSearchParams(applied));
            if (!response.ok) throw new Error(response.data?.message || "No se pudo exportar.");
            const rows = response.data.items.map(item => ({
                ID: item.id, Referente: item.referrerName, "Correo referente": item.referrerEmail,
                Invitado: item.referredName, "Correo invitado": item.referredEmail, Estado: STATUS_LABELS[item.status],
                Motivo: REASON_LABELS[item.reason] || "", "Premio COP": item.rewardAmount, "Meta COP": item.minimumTopup,
                "Acumulado COP": item.progressAmount, "Faltan COP": item.remainingAmount, "ID recarga que completó meta": item.qualifyingTopupId,
                "Contacto autorizado": item.contactSharing ? "Sí" : "No",
                "Registro (Bogotá)": dateTime(item.createdAt), "Límite (Bogotá)": dateTime(item.expiresAt),
                "Acreditado (Bogotá)": dateTime(item.creditedAt), "ID transacción": item.transactionId, "ID reversión": item.reversalTransactionId, "Revertido (Bogotá)": dateTime(item.reversedAt),
            }));
            const XLSX = await loadXlsx();
            const sheet = XLSX.utils.json_to_sheet(rows);
            sheet["!cols"] = Object.keys(rows[0] || { ID: "" }).map(() => ({ wch: 26 }));
            const book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, sheet, "Referidos");
            XLSX.writeFile(book, "Referidos_" + new Date().toISOString().slice(0, 10) + ".xlsx");
            setMessage(rows.length + " referidos exportados.");
        } catch (failure) { setError(failure.message); }
        finally { setExporting(false); }
    }

    const editForm = values => { settingsDirty.current = true; setForm(current => ({ ...current, ...values })); };
    const updateNumber = (key, value) => editForm({ [key]: value === "" ? "" : Number(value) });
    return <div className="page-shell"><div className="page-inner">
        <AdminSidebar user={user} onLogout={logout} />
        <main className="main referrals-page">
            <header className="referrals-header"><div><UsersRound size={24} aria-hidden /><h1>Referidos</h1></div><button type="button" className="referrals-icon-button" disabled={loading || settingsLoading || saving} title="Actualizar referidos y configuración" aria-label="Actualizar referidos y configuración" onClick={() => { setError(""); setRevision(value => value + 1); }}><RefreshCw size={18} /></button></header>
            <div className="referrals-status-line"><span className={"referrals-state is-" + (settingsInfo?.campaign.active ? "credited" : "expired")}>{settingsInfo?.campaign.active ? "Campaña activa" : "Campaña pausada o programada"}</span><span>Premios este mes: {money(settingsInfo?.monthlyAwarded)}</span></div>
            {error && <p className="referrals-error" role="alert">{error}</p>}{message && <p className="referrals-success" role="status">{message}</p>}
            <div className="referrals-tabs" role="tablist" aria-label="Gestión de referidos"><button role="tab" aria-selected={tab === "history"} aria-controls="referrals-history-panel" id="referrals-history-tab" onClick={() => setTab("history")}><ListFilter size={17} />Referidos</button><button role="tab" aria-selected={tab === "settings"} aria-controls="referrals-settings-panel" id="referrals-settings-tab" onClick={() => setTab("settings")}><Settings2 size={17} />Configuración</button></div>
            {tab === "settings" ? <section role="tabpanel" id="referrals-settings-panel" aria-labelledby="referrals-settings-tab">
                {settingsLoading ? <p className="referrals-empty" role="status">Cargando configuración...</p> : form && <form className="referrals-settings" onSubmit={saveSettings}>
                    <label className="referrals-switch"><input type="checkbox" role="switch" checked={form.enabled} onChange={event => editForm({ enabled: event.target.checked })} />Aceptar nuevos referidos</label>
                    <div className="referrals-settings-grid">
                        {[["rewardAmount", "Premio para quien invita (COP)", form.enabled ? 1 : 0, 100000000], ["minimumTopup", "Meta acumulada de recargas (COP)", 1, 100000000], ["attributionDays", "Plazo desde el registro (días)", 1, 365], ["monthlyRewardLimit", "Premios por referente / mes", 0, 10000], ["monthlyBudget", "Presupuesto mensual (COP)", 0, 1000000000]].map(([key, label, min, max]) => <label key={key}>{label}<input required type="number" min={min} max={max} step="1" value={form[key]} onChange={event => updateNumber(key, event.target.value)} />{["monthlyRewardLimit", "monthlyBudget"].includes(key) && <small>0 = sin límite. Los excesos quedan en revisión.</small>}</label>)}
                        <label>Inicio (hora de Colombia)<input type="datetime-local" value={form.startsAt} onChange={event => editForm({ startsAt: event.target.value })} /></label>
                        <label>Fin (hora de Colombia)<input type="datetime-local" value={form.endsAt} onChange={event => editForm({ endsAt: event.target.value })} /></label>
                    </div>
                    <p className="referrals-terms">Solo COP y clientes nuevos. Se acumulan las recargas reales aprobadas dentro del plazo desde el registro, sin incluir bonos. Al alcanzar la meta se entrega un único premio al referente. Las condiciones ofrecidas se conservan al pausar o editar la campaña. No cambia el bono de recargas del invitado.</p>
                    <div className="referrals-actions"><button type="submit" className="referrals-button is-primary" disabled={saving}><Save size={17} />{saving ? "Guardando..." : "Guardar campaña"}</button><button type="button" className="referrals-button" disabled={saving} onClick={() => { settingsDirty.current = false; setError(""); setRevision(value => value + 1); }}><RefreshCw size={17} />Descartar cambios</button><small>Versión {form.version}</small></div>
                    <h2>Últimos cambios de configuración</h2><EventList events={settingsInfo?.audit} />
                </form>}
            </section> : <section role="tabpanel" id="referrals-history-panel" aria-labelledby="referrals-history-tab">
                <ReferralMetrics summary={data?.summary} />
                <form className="referrals-filters" onSubmit={event => { event.preventDefault(); setError(""); detailRequest.current += 1; setDetailLoading(false); setApplied({ ...filters }); setPage(1); setDetail(null); }}>
                    <label>Cliente, correo o ID<input type="search" maxLength={120} value={filters.search} onChange={event => setFilters(value => ({ ...value, search: event.target.value }))} /></label>
                    <label>Estado<select value={filters.status} onChange={event => setFilters(value => ({ ...value, status: event.target.value }))}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    <label>Registro desde<input type="date" value={filters.from} onChange={event => setFilters(value => ({ ...value, from: event.target.value }))} /></label><label>Registro hasta<input type="date" value={filters.to} onChange={event => setFilters(value => ({ ...value, to: event.target.value }))} /></label>
                    <div className="referrals-actions"><button type="submit" className="referrals-icon-button" title="Filtrar referidos" aria-label="Filtrar referidos"><Search size={18} /></button><button type="button" className="referrals-icon-button" title="Limpiar filtros" aria-label="Limpiar filtros" onClick={() => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setPage(1); }}><X size={18} /></button></div>
                </form>
                <div className="referrals-toolbar"><h2>Historial de referidos</h2><button type="button" className="referrals-button" onClick={exportExcel} disabled={exporting || loading || !data?.total}><Download size={17} />{exporting ? "Exportando..." : "Exportar Excel"}</button></div>
                <ReferralHistory data={data} loading={loading} admin onPage={setPage} onDetail={loadDetail} />
                {detailLoading && <p role="status">Cargando detalle...</p>}
                {detail && <section className="referrals-detail" aria-label={"Detalle del referido #" + detail.item.id}>
                    <div className="referrals-toolbar"><h2>Referido #{detail.item.id}</h2><button className="referrals-icon-button" title="Cerrar detalle" aria-label="Cerrar detalle" onClick={() => { detailRequest.current += 1; setDetail(null); }}><X size={18} /></button></div>
                    <dl>{[["Referente", detail.item.referrerEmail], ["Invitado", detail.item.referredEmail], ["Condiciones", "Versión " + detail.item.settingsVersion], ["Premio", money(detail.item.rewardAmount)], ["Meta ofrecida", money(detail.item.minimumTopup)], ["Acumulado", money(detail.item.progressAmount)], ["Faltan", money(detail.item.remainingAmount)], ["Recarga que completó la meta", detail.item.qualifyingTopupId ? "#" + detail.item.qualifyingTopupId : "Pendiente"], ["Estado", STATUS_LABELS[detail.item.status]], ["Motivo", REASON_LABELS[detail.item.reason] || "-"], ["Movimiento de billetera", detail.item.transactionId ? "#" + detail.item.transactionId : "-"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                    <details><summary>Recargas computadas ({detail.topupsTotal || 0})</summary><ul className="referrals-events">{detail.topups?.map(topup => <li key={topup.topupId}><strong>Recarga #{topup.topupId} · {money(topup.amount)}</strong><time>{dateTime(topup.approvedAt)}</time></li>)}</ul></details>
                    {detail.item.status === "review" && <div className="referrals-actions"><button type="button" className="referrals-button is-primary" disabled={acting} onClick={() => act("retry")}><RefreshCw size={17} />Reevaluar premio</button></div>}
                    {["pending", "review"].includes(detail.item.status) && <form className="referrals-cancel" onSubmit={event => { event.preventDefault(); void act("cancel"); }}><label>Motivo de cancelación<input required minLength={5} maxLength={500} value={cancelReason} onChange={event => setCancelReason(event.target.value)} /></label><button type="submit" className="referrals-button is-danger" disabled={acting || cancelReason.trim().length < 5}><X size={17} />Cancelar premio</button></form>}
                    {detail.item.status === "credited" && <form className="referrals-cancel" onSubmit={event => { event.preventDefault(); void act("reverse"); }}><label>Motivo de reversión<input required minLength={5} maxLength={500} value={cancelReason} onChange={event => setCancelReason(event.target.value)} /></label><button type="submit" className="referrals-button is-danger" disabled={acting || cancelReason.trim().length < 5}><X size={17} />Revertir premio</button><p className="referrals-terms">Se descontará {money(detail.item.rewardAmount)} de la billetera del referente. El abono original, el consumo de presupuesto y la trazabilidad se conservan.</p></form>}
                    <h2>Trazabilidad</h2><EventList events={detail.events} />
                </section>}
            </section>}
        </main>
    </div></div>;
}
