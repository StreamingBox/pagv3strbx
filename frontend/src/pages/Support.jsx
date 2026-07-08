import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Clock3, Headphones, ImagePlus, Send, Wrench } from "lucide-react";
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

function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
    }).format(new Date(value));
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
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadTickets = useCallback(async () => {
        setLoading(true);
        const response = await apiFetch("/support/tickets");
        if (response.ok) {
            setTickets(response.data?.tickets || []);
        } else {
            setError(response.data?.message || "No pudimos cargar tus solicitudes.");
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void loadTickets();
    }, [loadTickets]);

    useEffect(() => {
        if (!evidence) {
            setPreview("");
            return undefined;
        }
        const url = URL.createObjectURL(evidence);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [evidence]);

    const openCount = useMemo(
        () => tickets.filter((ticket) => ticket.status !== "resolved").length,
        [tickets]
    );

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
            setError("Adjunta una foto donde se vea el error.");
            return;
        }

        const form = new FormData();
        form.append("subscriptionId", String(id));
        form.append("observation", observation.trim());
        form.append("evidence", evidence);

        setSending(true);
        const response = await apiFetch("/support/tickets", {
            method: "POST",
            body: form,
            timeoutMs: 60000,
        });
        setSending(false);

        if (!response.ok) {
            setError(response.data?.message || "No pudimos enviar la solicitud.");
            return;
        }

        setSuccess(`Solicitud ${response.data.ticket.ticketCode} creada correctamente.`);
        setSubscriptionId("");
        setObservation("");
        setEvidence(null);
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

                            <label className="support-upload support-field--evidence">
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={(event) => setEvidence(event.target.files?.[0] || null)}
                                    disabled={sending}
                                />
                                {preview ? (
                                    <img src={preview} alt="Vista previa de la evidencia" />
                                ) : (
                                    <span className="support-upload__empty">
                                        <ImagePlus aria-hidden />
                                        <strong>Adjuntar foto del error</strong>
                                        <small>JPG, PNG o WEBP. Máximo 6 MB.</small>
                                    </span>
                                )}
                                {preview ? <span className="support-upload__change">Cambiar imagen</span> : null}
                            </label>

                            {error ? <div className="support-message support-message--error">{error}</div> : null}
                            {success ? <div className="support-message support-message--success">{success}</div> : null}

                            <div className="support-form__actions">
                                <button type="submit" className="support-primary-button" disabled={sending}>
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
                                                <p>{ticket.resolutionMessage}</p>
                                                <span>{formatDate(ticket.resolvedAt)}</span>
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
