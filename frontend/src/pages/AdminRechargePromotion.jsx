import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, CalendarDays, Gift, Mail, Power, RefreshCw } from "lucide-react";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { apiFetch } from "../api/api";
import "../styles/admin-recharge-promotion.css";

const LOGO_URL = "/app-icon.svg";

function formatTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
    });
}

function RechargeBonusEmailPreview() {
    return (
        <section className="recharge-promo__email-section">
            <div className="recharge-promo__section-heading">
                <div>
                    <div className="recharge-promo__eyebrow"><Mail size={15} aria-hidden /> VISTA PREVIA</div>
                    <h2>Correo de la promoción</h2>
                </div>
                <span className="recharge-promo__preview-label">Maqueta · no enviado</span>
            </div>
            <div className="recharge-promo__email-frame">
                <div className="recharge-promo__email-meta">
                    <strong>Asunto:</strong> Más saldo para ti: recibe 10% extra al recargar
                </div>
                <article className="recharge-promo__email" aria-label="Vista previa del correo para clientes">
                    <header className="recharge-promo__email-header">
                        <div className="recharge-promo__email-brand">
                            <img src={LOGO_URL} alt="" aria-hidden="true" />
                            <strong>Streaming Box</strong>
                        </div>
                        <span>Beneficio para clientes</span>
                    </header>
                    <div className="recharge-promo__email-body">
                        <span className="recharge-promo__email-kicker">BONO DE RECARGA</span>
                        <h3>Más saldo para disfrutar.</h3>
                        <p>Hola, <strong>[Nombre del cliente]</strong>.</p>
                        <p>Cuando la promoción esté activa, recarga <strong>$50.000 COP o más</strong> en una sola operación y recibe un <strong>10% adicional</strong> en tu saldo.</p>
                        <div className="recharge-promo__email-example">
                            <div><span>Recargas</span><strong>$50.000</strong><small>+$5.000 de bono</small></div>
                            <div><span>Recargas</span><strong>$100.000</strong><small>+$10.000 de bono</small></div>
                            <div><span>Recargas</span><strong>$200.000</strong><small>+$20.000 de bono</small></div>
                            <div><span>Recargas</span><strong>$500.000</strong><small>+$50.000 de bono</small></div>
                        </div>
                        <div className="recharge-promo__email-note">
                            La promoción funciona automáticamente los sábados y también puede habilitarse en jornadas especiales. El bono se acredita cuando la recarga es aprobada. Aplica a recargas en COP de $50.000 o más por operación.
                        </div>
                        <a className="recharge-promo__email-cta" href="https://strbx.com.co/topups">Recargar saldo</a>
                        <p className="recharge-promo__email-footer">Gracias por elegir Streaming Box.</p>
                    </div>
                </article>
            </div>
        </section>
    );
}

export default function AdminRechargePromotion() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();
    const [promo, setPromo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const loadPromo = useCallback(async () => {
        const response = await apiFetch("/admin/recharge-promotion", { method: "GET" });
        if (response.ok) {
            setPromo({ settings: response.data?.settings, status: response.data?.status });
        } else {
            setError(response.data?.message || "No se pudo cargar la configuración.");
        }
        setLoading(false);
    }, []);

    // La actualización de estado ocurre tras la respuesta asíncrona del servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void loadPromo(); }, [loadPromo]);

    async function updatePromo(payload, successMessage) {
        setSaving(true);
        setMessage("");
        setError("");
        try {
            const response = await apiFetch("/admin/recharge-promotion", {
                method: "PUT",
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo guardar el cambio.");
            setPromo({ settings: response.data?.settings, status: response.data?.status });
            setMessage(successMessage);
        } catch (requestError) {
            setError(requestError?.message || "No se pudo guardar el cambio.");
        } finally {
            setSaving(false);
        }
    }

    const status = promo?.status;
    const manualActive = Boolean(status?.manuallyActive);

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden><div className="bg-grid" /><div className="bg-orb orb-1" /><div className="bg-orb orb-2" /></div>
            <div className="page-inner">
                <AdminSidebar user={user} logoSrc={LOGO_URL} logoOk onOpenLogoPicker={() => navigate("/admin")} onLogout={logout} />
                <main className="main recharge-promo">
                    <div className="recharge-promo__header">
                        <button className="btn-ghost" onClick={() => navigate("/admin/topups")}>← Recargas</button>
                        <div className="recharge-promo__title-row">
                            <span className="recharge-promo__icon"><Gift size={22} aria-hidden /></span>
                            <div>
                                <h1>Bono por recargas</h1>
                                <p>Configura el 10% adicional y revisa el correo que recibirían los clientes.</p>
                            </div>
                        </div>
                    </div>

                    {loading ? <div className="recharge-promo__loading"><RefreshCw size={17} /> Cargando promoción…</div> : (
                        <div className="recharge-promo__layout">
                            <div className="recharge-promo__controls">
                                <section className="recharge-promo__status" aria-live="polite">
                                    <span className={`recharge-promo__status-dot ${status?.active ? "is-active" : ""}`} />
                                    <div>
                                        <strong>{status?.active ? "Promoción activa" : "Promoción inactiva ahora"}</strong>
                                        <span>{status?.active
                                            ? `Vigente hasta ${formatTime(status.activeUntil)} · ${status.activeBy === "saturday" ? "programación de sábado" : "activación manual"}`
                                            : "Se activará automáticamente el sábado o cuando la actives manualmente."}</span>
                                    </div>
                                </section>

                                <section className="recharge-promo__settings">
                                    <div className="recharge-promo__eyebrow"><CalendarDays size={15} aria-hidden /> REGLAS DE LA PROMOCIÓN</div>
                                    <div className="recharge-promo__rule-grid">
                                        <div><span>Porcentaje extra</span><strong>10%</strong></div>
                                        <div><span>Mínimo por recarga</span><strong>$50.000 COP</strong></div>
                                        <div><span>Moneda elegible</span><strong>COP</strong></div>
                                    </div>
                                    <label className="recharge-promo__switch-row">
                                        <span><strong>Activar automáticamente cada sábado</strong><small>Todo el día, hora de Colombia. Se calcula al enviar la solicitud.</small></span>
                                        <input
                                            type="checkbox"
                                            role="switch"
                                            checked={Boolean(promo?.settings?.saturdayEnabled)}
                                            disabled={saving}
                                            onChange={(event) => updatePromo({ saturdayEnabled: event.target.checked }, event.target.checked ? "La promoción de sábados quedó activada." : "La promoción automática de sábados quedó desactivada.")}
                                        />
                                    </label>
                                    <div className="recharge-promo__manual">
                                        <div>
                                            <strong>Activación manual para hoy</strong>
                                            <small>Úsala en cualquier día. Termina automáticamente a medianoche, hora de Colombia. En sábado, seguirá activa si la programación automática está encendida.</small>
                                        </div>
                                        <button
                                            type="button"
                                            className={manualActive ? "recharge-promo__button recharge-promo__button--stop" : "recharge-promo__button"}
                                            disabled={saving}
                                            onClick={() => updatePromo({ manualAction: manualActive ? "deactivate" : "activate_today" }, manualActive ? "La activación manual se canceló." : "Promoción activada hasta el final de hoy.")}
                                        >
                                            <Power size={16} aria-hidden /> {manualActive ? "Cancelar activación manual" : "Activar hoy"}
                                        </button>
                                    </div>
                                    <div className="recharge-promo__examples" aria-label="Ejemplos de bonos">
                                        <div><span>Recarga</span><strong>$50.000</strong><b>+$5.000</b></div>
                                        <div><span>Recarga</span><strong>$100.000</strong><b>+$10.000</b></div>
                                        <div><span>Recarga</span><strong>$200.000</strong><b>+$20.000</b></div>
                                        <div><span>Recarga</span><strong>$500.000</strong><b>+$50.000</b></div>
                                    </div>
                                    <p className="recharge-promo__fine-print">El bono queda asociado a la solicitud creada mientras la promoción está vigente y se acredita una sola vez al aprobarla. Las recargas menores a $50.000 y las monedas distintas de COP no participan.</p>
                                </section>
                                {message ? <div className="recharge-promo__notice" role="status"><BadgeCheck size={17} /> {message}</div> : null}
                                {error ? <div className="recharge-promo__error" role="alert">{error}</div> : null}
                            </div>
                            <RechargeBonusEmailPreview />
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
