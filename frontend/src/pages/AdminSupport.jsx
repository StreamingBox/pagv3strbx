import { useCallback, useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    Clock3,
    ExternalLink,
    FileText,
    Headphones,
    History,
    RefreshCcw,
    Repeat2,
    Save,
    Search,
    Wrench,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiFetch, apiLogout, buildApiUrl } from "../api/api.js";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/dashboard.css";
import "../styles/support.css";

const FILTERS = [
    { value: "pending", label: "Pendientes" },
    { value: "open", label: "Nuevos" },
    { value: "in_progress", label: "En revision" },
    { value: "resolved", label: "Resueltos" },
    { value: "all", label: "Todos" },
];

const STATUS = {
    open: "Pendiente",
    in_progress: "En revision",
    resolved: "Resuelto",
};

const RESOLUTION_SUBTYPES = {
    repaired: [
        { value: "password_updated", label: "Clave actualizada" },
        { value: "login_approved", label: "Inicio aprobado" },
        { value: "payment_issue_fixed", label: "Pago o bloqueo corregido" },
        { value: "usage_guidance_sent", label: "Instrucciones enviadas" },
        { value: "account_unlocked", label: "Cuenta desbloqueada" },
    ],
    replaced: [
        { value: "account_replaced", label: "Cuenta reemplazada" },
        { value: "profile_reassigned", label: "Perfil reasignado" },
        { value: "stock_replacement", label: "Reemplazo con stock" },
    ],
    other: [
        { value: "user_error", label: "Error de uso del cliente" },
        { value: "warranty_denied", label: "Garantia no aplica" },
        { value: "duplicate_request", label: "Solicitud duplicada" },
        { value: "no_response_needed", label: "Sin accion adicional" },
        { value: "other_solution", label: "Otro cierre" },
    ],
};

function getSubtypeLabel(value) {
    const all = Object.values(RESOLUTION_SUBTYPES).flat();
    return all.find((item) => item.value === value)?.label || value || "";
}

function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
    }).format(new Date(value));
}

function formatDuration(minutes) {
    if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return "-";
    const total = Math.max(0, Number(minutes));
    if (total < 1) return "Menos de 1 min";
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const mins = Math.round(total % 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function shortText(value, fallback = "-") {
    const text = String(value || "").trim();
    return text || fallback;
}

function TraceBlock({ title, items, empty, render }) {
    const list = Array.isArray(items) ? items : [];
    return (
        <section className="admin-support-trace-block">
            <h3>{title}</h3>
            {list.length ? (
                <div className="admin-support-trace-list">
                    {list.map((item, index) => render(item, index))}
                </div>
            ) : (
                <p className="admin-support-trace-empty">{empty}</p>
            )}
        </section>
    );
}

export default function AdminSupport() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    const [tickets, setTickets] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [filter, setFilter] = useState("pending");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [resolutionType, setResolutionType] = useState("repaired");
    const [resolutionSubtype, setResolutionSubtype] = useState(RESOLUTION_SUBTYPES.repaired[0].value);
    const [resolutionMessage, setResolutionMessage] = useState("");
    const [supportInfo, setSupportInfo] = useState(null);
    const [replacementAccountId, setReplacementAccountId] = useState("");
    const [ticketDetail, setTicketDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [templateTitle, setTemplateTitle] = useState("");
    const [templateSaving, setTemplateSaving] = useState(false);

    const selected = useMemo(
        () => tickets.find((ticket) => ticket.id === selectedId) || tickets[0] || null,
        [selectedId, tickets]
    );

    const loadTickets = useCallback(async () => {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({ status: filter });
        if (search.trim()) params.set("q", search.trim());
        const response = await apiFetch(`/admin/support-tickets?${params.toString()}`);
        if (response.ok) {
            const list = response.data?.tickets || [];
            setTickets(list);
            setSelectedId((current) => (
                list.some((ticket) => ticket.id === current) ? current : list[0]?.id || null
            ));
        } else {
            setError(response.data?.message || "No se pudieron cargar las solicitudes.");
        }
        setLoading(false);
    }, [filter, search]);

    useEffect(() => {
        void loadTickets();
    }, [loadTickets]);

    const loadTemplates = useCallback(async () => {
        const response = await apiFetch("/admin/support-templates");
        if (response.ok) {
            setTemplates(response.data?.templates || []);
        }
    }, []);

    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);

    useEffect(() => {
        setTicketDetail(null);
        if (!selected?.id) return;
        let cancelled = false;
        setDetailLoading(true);
        void apiFetch(`/admin/support-tickets/${selected.id}/detail`).then((response) => {
            if (cancelled) return;
            if (response.ok) {
                setTicketDetail(response.data || null);
            }
            setDetailLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [selected?.id, selected?.updatedAt, selected?.status]);

    useEffect(() => {
        setResolutionMessage("");
        setResolutionType("repaired");
        setResolutionSubtype(RESOLUTION_SUBTYPES.repaired[0].value);
        setReplacementAccountId("");
        setSupportInfo(null);
        if (!selected?.subscriptionId || selected.status === "resolved") return;

        let cancelled = false;
        void apiFetch(`/admin/support/subscription/${selected.subscriptionId}`).then((response) => {
            if (cancelled || !response.ok) return;
            setSupportInfo(response.data);
            setReplacementAccountId(
                response.data?.suggestedReplacementId
                    ? String(response.data.suggestedReplacementId)
                    : ""
            );
        });
        return () => {
            cancelled = true;
        };
    }, [selected?.id, selected?.status, selected?.subscriptionId]);

    async function logout() {
        await apiLogout().catch(() => {});
        setUser(null);
        navigate("/", { replace: true });
    }

    async function startTicket() {
        if (!selected) return;
        setActionLoading(true);
        setError("");
        const response = await apiFetch(`/admin/support-tickets/${selected.id}/start`, {
            method: "PATCH",
        });
        setActionLoading(false);
        if (!response.ok) {
            setError(response.data?.message || "No se pudo tomar el caso.");
            return;
        }
        setSuccess("Caso marcado en revisión.");
        await loadTickets();
    }

    async function resolveTicket() {
        if (!selected) return;
        if (resolutionMessage.trim().length < 10) {
            setError("Escribe una respuesta clara para el usuario antes de cerrar el caso.");
            return;
        }
        if (resolutionType === "replaced" && !supportInfo?.replacementCandidates?.length) {
            setError("No hay stock disponible para reemplazar esta cuenta.");
            return;
        }

        setActionLoading(true);
        setError("");
        setSuccess("");
        const response = await apiFetch(`/admin/support-tickets/${selected.id}/resolve`, {
            method: "POST",
            body: JSON.stringify({
                resolutionType,
                resolutionSubtype,
                resolutionMessage: resolutionMessage.trim(),
                replacementAccountId: resolutionType === "replaced"
                    ? (replacementAccountId || null)
                    : null,
            }),
            timeoutMs: 60000,
        });
        setActionLoading(false);

        if (!response.ok) {
            setError(response.data?.message || "No se pudo cerrar el caso.");
            return;
        }
        const mailDelivery = response.data?.mail?.delivery;
        setSuccess(
            mailDelivery === "email"
                ? "Caso resuelto y correo enviado al usuario."
                : "Caso resuelto. El correo al usuario se enviara en segundo plano."
        );
        await loadTickets();
    }

    async function saveTemplate() {
        const title = templateTitle.trim();
        const body = resolutionMessage.trim();
        if (title.length < 3) {
            setError("Escribe un nombre corto para guardar la plantilla.");
            return;
        }
        if (body.length < 10) {
            setError("La plantilla necesita una respuesta clara antes de guardarse.");
            return;
        }
        setTemplateSaving(true);
        setError("");
        const response = await apiFetch("/admin/support-templates", {
            method: "POST",
            body: JSON.stringify({
                title,
                resolutionType,
                resolutionSubtype,
                body,
            }),
        });
        setTemplateSaving(false);
        if (!response.ok) {
            setError(response.data?.message || "No se pudo guardar la plantilla.");
            return;
        }
        setTemplateTitle("");
        setSuccess("Plantilla guardada para proximos soportes.");
        await loadTemplates();
    }

    function applyTemplate(templateId) {
        const template = templates.find((item) => item.id === Number(templateId));
        if (!template) return;
        setResolutionType(template.resolutionType);
        setResolutionSubtype(template.resolutionSubtype || RESOLUTION_SUBTYPES[template.resolutionType]?.[0]?.value || "");
        setResolutionMessage(template.body || "");
    }

    function selectResolutionType(type) {
        setResolutionType(type);
        setResolutionSubtype(RESOLUTION_SUBTYPES[type]?.[0]?.value || "");
    }

    const selectedDetail = ticketDetail?.ticket?.id === selected?.id ? ticketDetail : null;
    const matchingTemplates = templates.filter((item) => item.resolutionType === resolutionType);

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden><div className="bg-grid" /></div>
            <div className="page-inner">
                <AdminSidebar
                    user={user}
                    uploadingLogo={false}
                    onOpenLogoPicker={() => navigate("/admin")}
                    onLogout={logout}
                />

                <main className="main support-page admin-support-page">
                    <header className="support-page__header">
                        <span className="support-page__icon"><Headphones aria-hidden /></span>
                        <div>
                            <h1>Solicitudes de soporte</h1>
                            <p>Revisa la evidencia, atiende la cuenta y comunica el resultado.</p>
                        </div>
                        <button
                            type="button"
                            className="support-secondary-button"
                            onClick={() => navigate("/admin/account-support")}
                        >
                            <Wrench size={17} aria-hidden />
                            Herramienta directa
                        </button>
                    </header>

                    <section className="admin-support-toolbar">
                        <div className="admin-support-filters" role="tablist" aria-label="Estado de solicitudes">
                            {FILTERS.map((item) => (
                                <button
                                    type="button"
                                    key={item.value}
                                    className={filter === item.value ? "is-active" : ""}
                                    onClick={() => setFilter(item.value)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <form
                            className="admin-support-search"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void loadTickets();
                            }}
                        >
                            <Search size={17} aria-hidden />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Caso, ID, correo o plataforma"
                            />
                            <button type="submit" aria-label="Buscar">Buscar</button>
                        </form>
                        <button
                            type="button"
                            className="support-icon-button"
                            onClick={() => void loadTickets()}
                            aria-label="Actualizar solicitudes"
                            title="Actualizar"
                        >
                            <RefreshCcw size={18} aria-hidden />
                        </button>
                    </section>

                    {error ? <div className="support-message support-message--error">{error}</div> : null}
                    {success ? <div className="support-message support-message--success">{success}</div> : null}

                    <div className="admin-support-layout">
                        <section className="admin-support-list" aria-label="Lista de solicitudes">
                            {loading ? <div className="support-empty">Cargando...</div> : null}
                            {!loading && !tickets.length ? (
                                <div className="support-empty">No hay solicitudes para este filtro.</div>
                            ) : null}
                            {tickets.map((ticket) => (
                                <button
                                    type="button"
                                    key={ticket.id}
                                    className={`admin-support-list-item${selected?.id === ticket.id ? " is-selected" : ""}`}
                                    onClick={() => {
                                        setSelectedId(ticket.id);
                                        setError("");
                                        setSuccess("");
                                    }}
                                >
                                    <span className={`admin-support-dot admin-support-dot--${ticket.status}`} />
                                    <span className="admin-support-list-item__body">
                                        <strong>{ticket.platformName} · #{ticket.subscriptionId}</strong>
                                        <span>{ticket.ticketCode} · {ticket.userEmail}</span>
                                        <small>{formatDate(ticket.createdAt)}</small>
                                    </span>
                                    <span className="admin-support-list-item__status">{STATUS[ticket.status]}</span>
                                </button>
                            ))}
                        </section>

                        <section className="admin-support-detail" aria-label="Detalle de la solicitud">
                            {!selected ? (
                                <div className="support-empty">Selecciona una solicitud para revisarla.</div>
                            ) : (
                                <>
                                    <div className="admin-support-detail__heading">
                                        <div>
                                            <span>{selected.ticketCode}</span>
                                            <h2>{selected.platformName} · ID #{selected.subscriptionId}</h2>
                                            <p>{selected.userName || "Cliente"} · {selected.userEmail}</p>
                                        </div>
                                        <span className={`support-status support-status--${selected.status}`}>
                                            {STATUS[selected.status]}
                                        </span>
                                    </div>

                                     <div className="admin-support-facts">
                                         <div><span>Orden</span><strong>{selected.orderCode || "-"}</strong></div>
                                         <div><span>Cuenta actual</span><strong>{selected.accountEmail || "-"}</strong></div>
                                         <div><span>Perfil</span><strong>{selected.profileNumber ?? "-"}</strong></div>
                                         <div><span>Fecha</span><strong>{formatDate(selected.createdAt)}</strong></div>
                                     </div>

                                     <div className="admin-support-metrics">
                                         <div>
                                             <Clock3 size={17} aria-hidden />
                                             <span>Espera para tomar</span>
                                             <strong>{formatDuration(selectedDetail?.metrics?.waitMinutes)}</strong>
                                         </div>
                                         <div>
                                             <Wrench size={17} aria-hidden />
                                             <span>Tiempo de gestion</span>
                                             <strong>{formatDuration(selectedDetail?.metrics?.managementMinutes)}</strong>
                                         </div>
                                         <div>
                                             <History size={17} aria-hidden />
                                             <span>Tiempo total</span>
                                             <strong>{formatDuration(selectedDetail?.metrics?.totalMinutes)}</strong>
                                         </div>
                                     </div>

                                     <div className="admin-support-observation">
                                        <span>Observación del usuario</span>
                                        <p>{selected.observation}</p>
                                    </div>

                                    <a
                                        className="admin-support-evidence"
                                        href={buildApiUrl(selected.attachmentUrl)}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <img src={buildApiUrl(selected.attachmentUrl)} alt={`Evidencia ${selected.ticketCode}`} />
                                        <span><ExternalLink size={16} aria-hidden /> Abrir imagen completa</span>
                                    </a>

                                    {selected.status === "resolved" ? (
                                        <div className="support-resolution admin-support-resolution">
                                            <strong>
                                                {selected.resolutionType === "replaced"
                                                    ? "Cuenta reemplazada"
                                                    : selected.resolutionType === "repaired"
                                                        ? "Cuenta reparada"
                                                        : "Caso resuelto"}
                                            </strong>
                                            {selected.resolutionSubtype ? (
                                                <span className="support-resolution__subtype">
                                                    {selected.resolutionSubtypeLabel || getSubtypeLabel(selected.resolutionSubtype)}
                                                </span>
                                            ) : null}
                                            <p>{selected.resolutionMessage}</p>
                                            <span>Resuelto {formatDate(selected.resolvedAt)}</span>
                                        </div>
                                    ) : (
                                        <div className="admin-support-actions">
                                            {selected.status === "open" ? (
                                                <button
                                                    type="button"
                                                    className="support-secondary-button"
                                                    onClick={startTicket}
                                                    disabled={actionLoading}
                                                >
                                                    <Wrench size={17} aria-hidden />
                                                    Marcar en revisión
                                                </button>
                                            ) : null}

                                            <div className="admin-support-action-options">
                                                <button
                                                    type="button"
                                                    className={resolutionType === "repaired" ? "is-active" : ""}
                                                    onClick={() => selectResolutionType("repaired")}
                                                >
                                                    <CheckCircle2 size={17} aria-hidden />
                                                    Cuenta reparada
                                                </button>
                                                <button
                                                    type="button"
                                                    className={resolutionType === "replaced" ? "is-active" : ""}
                                                    onClick={() => selectResolutionType("replaced")}
                                                >
                                                    <Repeat2 size={17} aria-hidden />
                                                    Reemplazar cuenta
                                                </button>
                                                <button
                                                    type="button"
                                                    className={resolutionType === "other" ? "is-active" : ""}
                                                    onClick={() => selectResolutionType("other")}
                                                >
                                                    Otro cierre
                                                </button>
                                            </div>

                                            <div className="admin-support-template-box">
                                                <label className="support-field">
                                                    <span>Plantilla de respuesta</span>
                                                    <select
                                                        value=""
                                                        onChange={(event) => applyTemplate(event.target.value)}
                                                    >
                                                        <option value="">Seleccionar plantilla...</option>
                                                        {matchingTemplates.map((template) => (
                                                            <option value={template.id} key={template.id}>
                                                                {template.title}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <small>
                                                        {matchingTemplates.length
                                                            ? `${matchingTemplates.length} plantilla(s) para este cierre.`
                                                            : "Aun no hay plantillas para este tipo de cierre."}
                                                    </small>
                                                </label>
                                                <div className="admin-support-template-save">
                                                    <input
                                                        value={templateTitle}
                                                        onChange={(event) => setTemplateTitle(event.target.value)}
                                                        placeholder="Nombre para guardar plantilla"
                                                        maxLength={120}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="support-secondary-button"
                                                        onClick={saveTemplate}
                                                        disabled={templateSaving}
                                                    >
                                                        <Save size={16} aria-hidden />
                                                        {templateSaving ? "Guardando..." : "Guardar plantilla"}
                                                    </button>
                                                </div>
                                            </div>

                                            <label className="support-field">
                                                <span>Subtipificacion del cierre</span>
                                                <select
                                                    value={resolutionSubtype}
                                                    onChange={(event) => setResolutionSubtype(event.target.value)}
                                                >
                                                    {(RESOLUTION_SUBTYPES[resolutionType] || []).map((item) => (
                                                        <option key={item.value} value={item.value}>{item.label}</option>
                                                    ))}
                                                </select>
                                                <small>Esto queda guardado para medir que tipo de soporte se repite.</small>
                                            </label>

                                            {resolutionType === "replaced" ? (
                                                <label className="support-field">
                                                    <span>Cuenta que se entregará</span>
                                                    <select
                                                        value={replacementAccountId}
                                                        onChange={(event) => setReplacementAccountId(event.target.value)}
                                                    >
                                                        <option value="">Siguiente disponible</option>
                                                        {(supportInfo?.replacementCandidates || []).map((candidate) => (
                                                            <option value={candidate.id} key={candidate.id}>
                                                                #{candidate.id} · {candidate.platformName} · {candidate.email} · Perfil {candidate.profile_number ?? "-"}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <small>
                                                        {(supportInfo?.replacementCandidates || []).length
                                                            ? `${supportInfo.replacementCandidates.length} cuenta(s) disponible(s).`
                                                            : "No hay stock disponible para reemplazo."}
                                                    </small>
                                                </label>
                                            ) : null}

                                            <label className="support-field">
                                                <span>Respuesta que recibirá el usuario</span>
                                                <textarea
                                                    value={resolutionMessage}
                                                    onChange={(event) => setResolutionMessage(event.target.value)}
                                                    maxLength={3000}
                                                    placeholder={
                                                        resolutionType === "replaced"
                                                            ? "Reemplazamos la cuenta y ya puedes consultar las nuevas credenciales..."
                                                            : "Revisamos la cuenta y corregimos..."
                                                    }
                                                />
                                                <small>{resolutionMessage.length}/3000</small>
                                            </label>

                                            <button
                                                type="button"
                                                className="support-primary-button"
                                                onClick={resolveTicket}
                                                disabled={actionLoading}
                                            >
                                                {actionLoading ? "Procesando..." : "Guardar resultado y enviar correo"}
                                            </button>
                                        </div>
                                    )}

                                    <section className="admin-support-trace">
                                        <div className="admin-support-trace__heading">
                                            <span><FileText size={17} aria-hidden /> Trazabilidad completa</span>
                                            {detailLoading ? <small>Cargando...</small> : null}
                                        </div>
                                        {!detailLoading && selectedDetail ? (
                                            <div className="admin-support-trace-grid">
                                                <TraceBlock
                                                    title="Actividad del caso"
                                                    items={selectedDetail.events}
                                                    empty="Sin eventos registrados."
                                                    render={(event) => (
                                                        <article className="admin-support-trace-item" key={event.id}>
                                                            <strong>{event.label}</strong>
                                                            <span>{formatDate(event.createdAt)} · {shortText(event.actorEmail || event.actorName, "Sistema")}</span>
                                                            {event.message ? <p>{event.message}</p> : null}
                                                        </article>
                                                    )}
                                                />
                                                <TraceBlock
                                                    title="Ventas y cuenta"
                                                    items={selectedDetail.accountTrace?.sales}
                                                    empty="Sin ventas asociadas para esta cuenta."
                                                    render={(item, index) => (
                                                        <article className="admin-support-trace-item" key={`${item.subscriptionId}-${index}`}>
                                                            <strong>#{item.subscriptionId} · {shortText(item.platformName)}</strong>
                                                            <span>{shortText(item.orderCode)} · {shortText(item.buyerEmail)}</span>
                                                            <p>{shortText(item.accountEmail)} · Perfil {item.profileNumber ?? "-"} · Expira {item.expiresAt || "-"}</p>
                                                        </article>
                                                    )}
                                                />
                                                <TraceBlock
                                                    title="Reemplazos"
                                                    items={selectedDetail.accountTrace?.replacements}
                                                    empty="Sin reemplazos asociados."
                                                    render={(item) => (
                                                        <article className="admin-support-trace-item" key={item.id}>
                                                            <strong>{shortText(item.oldAccountEmail)} → {shortText(item.newAccountEmail)}</strong>
                                                            <span>{formatDate(item.createdAt)} · {shortText(item.adminEmail, "Sistema")}</span>
                                                            <p>{shortText(item.orderCode)} · antes vencia {item.previousExpiresAt || "-"}</p>
                                                        </article>
                                                    )}
                                                />
                                                <TraceBlock
                                                    title="Renovaciones"
                                                    items={selectedDetail.accountTrace?.renewals}
                                                    empty="Sin renovaciones asociadas."
                                                    render={(item) => (
                                                        <article className="admin-support-trace-item" key={item.id}>
                                                            <strong>{shortText(item.renewalOrderCode)} · {item.currency} {item.amountCharged}</strong>
                                                            <span>{formatDate(item.createdAt)} · {shortText(item.actorEmail || item.actorRole)}</span>
                                                            <p>Vigencia: {item.previousExpiresAt || "-"} → {item.newExpiresAt || "-"}</p>
                                                        </article>
                                                    )}
                                                />
                                                <TraceBlock
                                                    title="Codigos y accesos"
                                                    items={selectedDetail.accountTrace?.codeDeliveries}
                                                    empty="Sin solicitudes de codigo asociadas."
                                                    render={(item) => (
                                                        <article className="admin-support-trace-item" key={item.id}>
                                                            <strong>{shortText(item.status)} · {shortText(item.platformSlug)}</strong>
                                                            <span>{formatDate(item.createdAt)} · {shortText(item.requesterEmail, "Usuario")}</span>
                                                            {item.message ? <p>{item.message}</p> : null}
                                                        </article>
                                                    )}
                                                />
                                                <TraceBlock
                                                    title="Otros soportes relacionados"
                                                    items={selectedDetail.accountTrace?.relatedTickets}
                                                    empty="No hay otros soportes relacionados."
                                                    render={(item) => (
                                                        <article className="admin-support-trace-item" key={item.id}>
                                                            <strong>{item.ticketCode} · {STATUS[item.status] || item.status}</strong>
                                                            <span>{formatDate(item.createdAt)} · ID #{item.subscriptionId}</span>
                                                            <p>{item.observation}</p>
                                                        </article>
                                                    )}
                                                />
                                            </div>
                                        ) : null}
                                    </section>
                                </>
                            )}
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}
