import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock3, Headphones, ImagePlus, LoaderCircle, RefreshCw, Send, Trash2, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiFetch, buildApiUrl } from "../api/api.js";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import "../styles/dashboard.css";
import "../styles/support.css";

const STATUS = {
    open: { label: "Pendiente", icon: Clock3 },
    in_progress: { label: "En revision", icon: Wrench },
    resolved: { label: "Resuelto", icon: CheckCircle2 },
};

const RESULT = {
    repaired: "Cuenta reparada",
    replaced: "Cuenta reemplazada",
    other: "Caso resuelto",
};

const PAGE_SIZE = 5;
const MAX_EVIDENCE_BYTES = 6 * 1024 * 1024;
const ALLOWED_EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
    }).format(new Date(value));
}

function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Support() {
    const navigate = useNavigate();
    const logout = useAppLogout();
    const { user } = useAuth();
    const [subscriptionId, setSubscriptionId] = useState("");
    const [observation, setObservation] = useState("");
    const [evidence, setEvidence] = useState(null);
    const [preview, setPreview] = useState("");
    const [tickets, setTickets] = useState([]);
    const [ticketsTotal, setTicketsTotal] = useState(0);
    const [openTicketsCount, setOpenTicketsCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [sending, setSending] = useState(false);
    const [reopeningId, setReopeningId] = useState(null);
    const [evidenceError, setEvidenceError] = useState("");
    const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
    const [isDraggingEvidence, setIsDraggingEvidence] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const evidenceInputRef = useRef(null);

    const loadTickets = useCallback(async ({ offset = 0, append = false } = {}) => {
        if (append) setLoadingMore(true);
        else setLoading(true);
        if (!append) setError("");
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(offset),
            });
            const response = await apiFetch(`/support/tickets?${params.toString()}`);
            if (response.ok) {
                const list = response.data?.tickets || [];
                setTickets((current) => append ? [...current, ...list] : list);
                setTicketsTotal(Number(response.data?.total || list.length));
                setOpenTicketsCount(Number(response.data?.openCount || 0));
            } else {
                setError(response.data?.message || "No pudimos cargar tus solicitudes.");
            }
        } finally {
            setLoadingMore(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadTickets();
    }, [loadTickets]);

    useEffect(() => {
        if (!evidence) {
            setPreview("");
            setIsEvidenceLoading(false);
            return undefined;
        }
        const reader = new FileReader();
        let active = true;
        reader.onload = () => {
            if (active) setPreview(String(reader.result || ""));
        };
        reader.onerror = () => {
            if (!active) return;
            setPreview("");
            setIsEvidenceLoading(false);
            setEvidenceError("No se pudo preparar la imagen para la vista previa.");
            setEvidence(null);
            if (evidenceInputRef.current) evidenceInputRef.current.value = "";
        };
        reader.readAsDataURL(evidence);
        return () => {
            active = false;
            reader.abort();
        };
    }, [evidence]);

    const openCount = useMemo(() => openTicketsCount, [openTicketsCount]);

    function selectEvidence(file) {
        if (!file) return;
        const type = String(file.type || "").toLowerCase();
        if (!ALLOWED_EVIDENCE_TYPES.has(type)) {
            setEvidence(null);
            setIsEvidenceLoading(false);
            setEvidenceError("La evidencia debe ser una imagen JPG, PNG o WEBP.");
            if (evidenceInputRef.current) evidenceInputRef.current.value = "";
            return;
        }
        if (file.size > MAX_EVIDENCE_BYTES) {
            setEvidence(null);
            setIsEvidenceLoading(false);
            setEvidenceError("La imagen supera el límite de 6 MB.");
            if (evidenceInputRef.current) evidenceInputRef.current.value = "";
            return;
        }
        setEvidenceError("");
        setError("");
        setIsEvidenceLoading(true);
        setEvidence(file);
    }

    function removeEvidence(event) {
        event.stopPropagation();
        setEvidence(null);
        setIsEvidenceLoading(false);
        setEvidenceError("");
        if (evidenceInputRef.current) evidenceInputRef.current.value = "";
    }

    function openEvidencePicker(event) {
        event.stopPropagation();
        evidenceInputRef.current?.click();
    }

    function handleEvidenceKeyDown(event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            evidenceInputRef.current?.click();
        }
    }

    function handleEvidenceDrop(event) {
        event.preventDefault();
        setIsDraggingEvidence(false);
        if (!sending) selectEvidence(event.dataTransfer.files?.[0]);
    }

    async function submitTicket(event) {
        event.preventDefault();
        setError("");
        setSuccess("");
        const id = Number(subscriptionId);
        if (!Number.isFinite(id) || id <= 0) {
            setError("Ingresa el ID que aparece en el detalle de la cuenta.");
            return;
        }
        if (observation.trim().length < 10) {
            setError("Cuéntanos con un poco mas de detalle que sucede con la cuenta.");
            return;
        }
        if (!evidence) {
            setError(evidenceError || "Adjunta una foto donde se vea el error.");
            return;
        }
        if (isEvidenceLoading) {
            setError("Espera a que la imagen termine de cargar antes de enviarla.");
            return;
        }

        const form = new FormData();
        form.append("subscriptionId", String(id));
        form.append("observation", observation.trim());
        form.append("evidence", evidence);

        setSending(true);
        let response;
        try {
            response = await apiFetch("/support/tickets", {
                method: "POST",
                body: form,
                timeoutMs: 60000,
            });
        } finally {
            setSending(false);
        }

        if (!response.ok) {
            setError(response.data?.message || "No pudimos enviar la solicitud.");
            return;
        }

        setSuccess(`Solicitud ${response.data.ticket.ticketCode} creada correctamente.`);
        setSubscriptionId("");
        setObservation("");
        setEvidence(null);
        setIsEvidenceLoading(false);
        setEvidenceError("");
        if (evidenceInputRef.current) evidenceInputRef.current.value = "";
        await loadTickets();
    }

    async function loadMoreTickets() {
        await loadTickets({ offset: tickets.length, append: true });
    }

    async function reopenTicket(ticket) {
        setError("");
        setSuccess("");
        setReopeningId(ticket.id);
        let response;
        try {
            response = await apiFetch(`/support/tickets/${ticket.id}/reopen`, {
                method: "PATCH",
                body: JSON.stringify({
                    message: "El cliente reporta que la novedad continua despues de la respuesta.",
                }),
            });
        } finally {
            setReopeningId(null);
        }
        if (!response.ok) {
            setError(response.data?.message || "No pudimos reabrir el caso.");
            return;
        }
        setSuccess(`Caso ${ticket.ticketCode} reabierto correctamente.`);
        await loadTickets();
    }

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-grid" />
            </div>
            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={null}
                    cartCount={0}
                    onOpenCart={() => navigate("/dashboard")}
                    onGoOrders={() => navigate("/orders")}
                    onGoRenewals={() => navigate("/renewals")}
                    onGoWallet={() => navigate("/topups")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoCodes={() => navigate("/codes")}
                    onGoAdmin={() => navigate("/admin")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoAdvertising={() => navigate("/advertising")}
                    onGoSupport={() => navigate("/support")}
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                <main className="main support-page">
                    <header className="support-page__header">
                        <span className="support-page__icon"><Headphones aria-hidden /></span>
                        <div>
                            <h1>Soporte de cuentas</h1>
                            <p>Reporta una novedad y consulta aquí el resultado de la gestión.</p>
                        </div>
                        <span className="support-page__counter">{openCount} pendiente{openCount === 1 ? "" : "s"}</span>
                    </header>

                    <section className="support-form-section" aria-labelledby="support-form-title">
                        <div className="support-section-heading">
                            <div>
                                <span>Nueva solicitud</span>
                                <h2 id="support-form-title">Cuéntanos qué sucede</h2>
                            </div>
                            <Camera aria-hidden />
                        </div>

                        <form className="support-form" onSubmit={submitTicket}>
                            <label className="support-field support-field--id">
                                <span>ID de la cuenta</span>
                                <input
                                    value={subscriptionId}
                                    onChange={(event) => setSubscriptionId(event.target.value)}
                                    inputMode="numeric"
                                    placeholder="Ej: 4722"
                                    disabled={sending}
                                />
                                <small>Es el ID que aparece en el enlace o detalle de credenciales.</small>
                            </label>

                            <label className="support-field support-field--observation">
                                <span>¿Qué problema presenta?</span>
                                <textarea
                                    value={observation}
                                    onChange={(event) => setObservation(event.target.value)}
                                    placeholder="Describe el error, desde cuándo ocurre y qué intentaste hacer."
                                    maxLength={2000}
                                    disabled={sending}
                                />
                                <small>{observation.length}/2000</small>
                            </label>

                            <div
                                className={`support-upload support-field--evidence${isDraggingEvidence ? " support-upload--dragging" : ""}${preview ? " support-upload--has-preview" : ""}${isEvidenceLoading ? " support-upload--loading" : ""}`}
                                role="button"
                                tabIndex={sending ? -1 : 0}
                                aria-label={preview ? "Cambiar foto de evidencia" : "Adjuntar foto del error"}
                                onClick={openEvidencePicker}
                                onKeyDown={handleEvidenceKeyDown}
                                onDragEnter={(event) => {
                                    event.preventDefault();
                                    if (!sending) setIsDraggingEvidence(true);
                                }}
                                onDragOver={(event) => event.preventDefault()}
                                onDragLeave={(event) => {
                                    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) {
                                        setIsDraggingEvidence(false);
                                    }
                                }}
                                onDrop={handleEvidenceDrop}
                            >
                                <input
                                    ref={evidenceInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={(event) => selectEvidence(event.target.files?.[0])}
                                    onClick={(event) => event.stopPropagation()}
                                    disabled={sending}
                                />
                                {preview || isEvidenceLoading ? (
                                    <div className="support-upload__preview">
                                        {preview ? (
                                            <img
                                                src={preview}
                                                alt="Vista previa de la evidencia"
                                                onLoad={() => window.setTimeout(() => setIsEvidenceLoading(false), 520)}
                                                onError={() => {
                                                    setIsEvidenceLoading(false);
                                                    setEvidenceError("No se pudo cargar la vista previa de la imagen.");
                                                    setEvidence(null);
                                                    if (evidenceInputRef.current) evidenceInputRef.current.value = "";
                                                }}
                                            />
                                        ) : null}
                                        {isEvidenceLoading ? (
                                            <div className="support-upload__loading" aria-live="polite">
                                                <LoaderCircle size={28} aria-hidden />
                                                <strong>Cargando imagen...</strong>
                                                <span className="support-upload__loading-track" aria-hidden>
                                                    <span />
                                                </span>
                                                <small>Espera un momento</small>
                                            </div>
                                        ) : null}
                                        {preview ? (
                                            <div className="support-upload__preview-bar">
                                                <span title={evidence?.name || "Imagen seleccionada"}>
                                                    {evidence?.name || "Imagen seleccionada"}{evidence ? ` · ${formatFileSize(evidence.size)}` : ""}
                                                </span>
                                                <div className="support-upload__actions">
                                                    <button type="button" className="support-upload__change" onClick={openEvidencePicker} disabled={sending}>
                                                        <RefreshCw size={15} aria-hidden />
                                                        Cambiar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="support-upload__remove"
                                                        onClick={removeEvidence}
                                                        disabled={sending}
                                                        title="Quitar evidencia"
                                                        aria-label="Quitar evidencia"
                                                    >
                                                        <Trash2 size={16} aria-hidden />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <span className="support-upload__empty">
                                        <ImagePlus aria-hidden />
                                        <strong>Adjuntar foto del error</strong>
                                        <small>JPG, PNG o WEBP. Máximo 6 MB.</small>
                                        <em>Arrastra la imagen aquí o haz clic para buscarla</em>
                                    </span>
                                )}
                                {isDraggingEvidence ? <span className="support-upload__drag-label">Suelta la imagen para adjuntarla</span> : null}
                            </div>

                            {evidenceError ? <div className="support-message support-message--error support-message--evidence">{evidenceError}</div> : null}

                            {error ? <div className="support-message support-message--error">{error}</div> : null}
                            {success ? <div className="support-message support-message--success">{success}</div> : null}

                            <div className="support-form__actions">
                                <button type="submit" className="support-primary-button" disabled={sending || isEvidenceLoading}>
                                    <Send size={18} aria-hidden />
                                    {sending ? "Enviando..." : "Enviar solicitud"}
                                </button>
                            </div>
                        </form>
                    </section>

                    <section className="support-history" aria-labelledby="support-history-title">
                        <div className="support-section-heading">
                            <div>
                                <span>Seguimiento</span>
                                <h2 id="support-history-title">Mis solicitudes</h2>
                                <p className="support-history__hint">Ultimas novedades, de la mas reciente a la mas antigua.</p>
                            </div>
                        </div>

                        {loading ? <div className="support-empty">Cargando solicitudes...</div> : null}
                        {!loading && !tickets.length ? (
                            <div className="support-empty">Todavía no tienes solicitudes de soporte.</div>
                        ) : null}
                        <div className="support-ticket-list">
                            {tickets.map((ticket) => {
                                const state = STATUS[ticket.status] || STATUS.open;
                                const StateIcon = state.icon;
                                return (
                                    <article className={`support-ticket support-ticket--${ticket.status}`} key={ticket.id}>
                                        <div className="support-ticket__top">
                                            <div>
                                                <span className="support-ticket__code">{ticket.ticketCode}</span>
                                                <h3>{ticket.platformName} · ID #{ticket.subscriptionId}</h3>
                                            </div>
                                            <span className="support-status">
                                                <StateIcon size={15} aria-hidden />
                                                {state.label}
                                            </span>
                                        </div>
                                        <p className="support-ticket__observation">{ticket.observation}</p>
                                        <div className="support-ticket__meta">
                                            <span>Creado {formatDate(ticket.createdAt)}</span>
                                            <a href={buildApiUrl(ticket.attachmentUrl)} target="_blank" rel="noreferrer">
                                                Ver evidencia
                                            </a>
                                        </div>
                                        {ticket.status === "resolved" ? (
                                            <div className="support-resolution">
                                                <strong>{RESULT[ticket.resolutionType] || "Caso resuelto"}</strong>
                                                <p style={{ whiteSpace: "pre-line" }}>{ticket.resolutionMessage}</p>
                                                {ticket.managementExtensionDays > 0 ? (
                                                    <span>Se agrego 1 dia por superar 5 horas de gestion.</span>
                                                ) : null}
                                                <span>{formatDate(ticket.resolvedAt)}</span>
                                                {ticket.canReopen ? (
                                                    <button
                                                        type="button"
                                                        className="support-secondary-button support-reopen-button"
                                                        onClick={() => reopenTicket(ticket)}
                                                        disabled={reopeningId === ticket.id}
                                                    >
                                                        {reopeningId === ticket.id ? "Reabriendo..." : "Reabrir caso"}
                                                    </button>
                                                ) : (
                                                    <small className="support-final-note">Cierre definitivo. La ventana de 24 horas ya termino.</small>
                                                )}
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            })}
                        </div>
                        {!loading && tickets.length < ticketsTotal ? (
                            <button
                                type="button"
                                className="support-secondary-button support-load-more"
                                onClick={loadMoreTickets}
                                disabled={loadingMore}
                            >
                                {loadingMore ? "Cargando..." : `Cargar mas (${ticketsTotal - tickets.length})`}
                            </button>
                        ) : null}
                    </section>
                </main>
            </div>
        </div>
    );
}
