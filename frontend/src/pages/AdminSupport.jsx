import { useCallback, useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    ExternalLink,
    Headphones,
    RefreshCcw,
    Repeat2,
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

function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
    }).format(new Date(value));
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
    const [resolutionMessage, setResolutionMessage] = useState("");
    const [supportInfo, setSupportInfo] = useState(null);
    const [replacementAccountId, setReplacementAccountId] = useState("");

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

    useEffect(() => {
        setResolutionMessage("");
        setResolutionType("repaired");
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
        const mailSent = response.data?.mail?.delivery === "email";
        setSuccess(
            mailSent
                ? "Caso resuelto y correo enviado al usuario."
                : "Caso resuelto. Revisa la configuración del correo de soporte."
        );
        await loadTickets();
    }

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
                                                    onClick={() => setResolutionType("repaired")}
                                                >
                                                    <CheckCircle2 size={17} aria-hidden />
                                                    Cuenta reparada
                                                </button>
                                                <button
                                                    type="button"
                                                    className={resolutionType === "replaced" ? "is-active" : ""}
                                                    onClick={() => setResolutionType("replaced")}
                                                >
                                                    <Repeat2 size={17} aria-hidden />
                                                    Reemplazar cuenta
                                                </button>
                                                <button
                                                    type="button"
                                                    className={resolutionType === "other" ? "is-active" : ""}
                                                    onClick={() => setResolutionType("other")}
                                                >
                                                    Otro cierre
                                                </button>
                                            </div>

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
                                </>
                            )}
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}
