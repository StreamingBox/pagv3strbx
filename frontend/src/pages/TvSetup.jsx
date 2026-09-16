import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    ArrowRight,
    Check,
    CheckCircle2,
    Copy,
    KeyRound,
    Mail,
    RefreshCw,
    ShieldCheck,
    Tv,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import { formatTvCode, onlyDigits } from "../utils/tvSetup.js";
import "../styles/tv-setup.css";

function formatExpiry(value) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [year, month, day] = raw.split("-");
        return `${day}/${month}/${year}`;
    }
    return raw;
}

async function copyText(value) {
    try {
        await navigator.clipboard.writeText(String(value || ""));
        return true;
    } catch {
        return false;
    }
}

function StepIndicator({ step }) {
    const steps = [
        { number: 1, label: "Validar pedido" },
        { number: 2, label: "Automatizar Netflix" },
        { number: 3, label: "TV conectado" },
    ];

    return (
        <div className="tv-setup-steps" aria-label="Progreso del registro del TV">
            {steps.map((item, index) => (
                <div className="tv-setup-step-wrap" key={item.number}>
                    <div className={`tv-setup-step${step >= item.number ? " is-active" : ""}${step > item.number ? " is-complete" : ""}`}>
                        <span>{step > item.number ? <Check size={15} strokeWidth={3} /> : item.number}</span>
                        <strong>{item.label}</strong>
                    </div>
                    {index < steps.length - 1 ? <div className={`tv-setup-step-line${step > item.number ? " is-complete" : ""}`} /> : null}
                </div>
            ))}
        </div>
    );
}

function ErrorNotice({ message }) {
    if (!message) return null;
    return (
        <motion.div
            className="tv-setup-notice tv-setup-notice--error"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
        >
            <span aria-hidden="true">!</span>
            <p>{message}</p>
        </motion.div>
    );
}

function buildTvSetupErrorMessage(data, fallback) {
    const status = String(data?.status || "").trim().toLowerCase();
    const messages = {
        invalid_tv_code: "Netflix rechazó el código del TV. Revisa los 8 dígitos que aparecen en pantalla.",
        subscription_missing: "El pedido indicado no existe o ya no está disponible.",
        unauthorized: "El pedido no pertenece al usuario que inició esta sesión.",
        platform_mismatch: "El pedido no corresponde a una cuenta de Netflix.",
        no_account: "El pedido es válido, pero todavía no tiene una cuenta asignada.",
        subscription_inactive: "El pedido de Netflix no está activo o ya venció.",
        tv_code_input_missing: "Netflix no mostró los 8 campos para ingresar el código del TV.",
        tv_code_submit_missing: "Netflix no mostró el botón para continuar con el código del TV.",
        tv_code_submit_disabled: "Netflix no habilitó el código del TV. Revisa los 8 dígitos que aparecen en pantalla.",
        email_input_missing: "Netflix no mostró el campo del correo. El correo no alcanzó a escribirse.",
        continue_button_missing: "El correo se cargó, pero Netflix no mostró el botón para continuar.",
        email_flow_not_advanced: "Netflix recibió el correo, pero no avanzó a la pantalla del código de Inicio. Verifica que el correo de la cuenta sea el correcto e inténtalo nuevamente.",
        password_required: "Netflix pidió la contraseña y no ofreció el código de Inicio para esta cuenta. Verifica que el correo sea el principal o usa una cuenta con código de Inicio.",
        password_input_missing: "Netflix pidió la contraseña, pero no mostró el campo para ingresarla.",
        password_submit_missing: "Netflix pidió la contraseña, pero no mostró el botón para continuar.",
        password_flow_not_advanced: "Netflix no confirmó la conexión después de ingresar la contraseña.",
        login_code_input_missing: "Netflix no mostró la pantalla para ingresar el código de Inicio.",
        login_code_screen_missing: "Netflix no confirmó la pantalla para ingresar el código de Inicio.",
        resend_unavailable: "Netflix no ofreció la opción para reenviar el código de Inicio.",
        expired: "Netflix sí recibió el correo y abrió la pantalla de código, pero no llegó un correo de Inicio reciente al buzón configurado.",
        netflix_flow_miss: "Netflix sí avanzó, pero no se encontró un correo de Inicio válido para este pedido.",
        mailbox_empty: "El buzón del proveedor no tiene un correo de Inicio reciente.",
        sender_mismatch: "Llegó un correo, pero no proviene del remitente esperado de Netflix.",
        regex_mismatch: "Llegó un correo de Netflix, pero no contiene un código de Inicio de 4 dígitos.",
        imap_auth_error: "El buzón de códigos no pudo autenticarse. Revisa la configuración del proveedor.",
        imap_error: "No fue posible consultar el buzón de códigos del proveedor.",
        automation_timeout: "Netflix tardó demasiado en responder. La pantalla del navegador no se pudo confirmar.",
    };
    return messages[status] || data?.message || fallback;
}

function CopyField({ label, value, icon: Icon, helper }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        const didCopy = await copyText(value);
        if (!didCopy) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }

    return (
        <div className="tv-setup-copy-field">
            <div className="tv-setup-copy-field__icon"><Icon size={17} aria-hidden="true" /></div>
            <div className="tv-setup-copy-field__body">
                <span>{label}</span>
                <strong>{value || "-"}</strong>
                {helper ? <small>{helper}</small> : null}
            </div>
            <button type="button" className="tv-setup-icon-button" onClick={handleCopy} aria-label={`Copiar ${label}`} title={`Copiar ${label}`}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            </button>
        </div>
    );
}

export default function TvSetup() {
    const navigate = useNavigate();
const { user } = useAuth();
    const logout = useAppLogout();

    const TV_SETUP_REQUEST_TIMEOUT_MS = 90000;

    const [tvCode, setTvCode] = useState("");
    const [orderNumber, setOrderNumber] = useState("");
    const [step, setStep] = useState(1);
    const [validated, setValidated] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [automationAttempted, setAutomationAttempted] = useState(false);
    const [completed, setCompleted] = useState(false);

    const normalizedTvCode = useMemo(() => formatTvCode(tvCode), [tvCode]);
    const canValidate = /^\d{4}-\d{4}$/.test(normalizedTvCode) && onlyDigits(orderNumber, 20).length > 0 && !loading;

    async function runAutomation(payload, force = false) {
        if (!payload?.orderNumber || (loading && !force)) return;
        setLoading(true);
        setError("");
        setAutomationAttempted(true);
        setStep(2);

        try {
            const response = await apiPost("/tv-setup/run", {
                tvCode: payload.tvCode,
                orderNumber: payload.orderNumber,
            }, { timeoutMs: TV_SETUP_REQUEST_TIMEOUT_MS });
            if (!response.ok) {
                throw new Error(buildTvSetupErrorMessage(response.data, "No fue posible completar la conexión automática."));
            }
            setValidated((current) => ({ ...current, ...response.data }));
            setCompleted(true);
            setStep(3);
        } catch (requestError) {
            setError(requestError?.message || "No fue posible completar la conexión automática.");
        } finally {
            setLoading(false);
        }
    }

    async function validateOrder(event) {
        event?.preventDefault();
        if (!canValidate) return;
        setLoading(true);
        setError("");
        setValidated(null);
        setCompleted(false);
        setAutomationAttempted(false);

        try {
            const response = await apiPost("/tv-setup/validate", {
                tvCode: normalizedTvCode,
                orderNumber: orderNumber.trim(),
            });
            if (!response.ok) {
                throw new Error(buildTvSetupErrorMessage(response.data, "No fue posible validar el pedido."));
            }
            setValidated(response.data);
            await runAutomation(response.data, true);
        } catch (requestError) {
            setError(requestError?.message || "No fue posible validar el pedido.");
        } finally {
            setLoading(false);
        }
    }

    function resetFlow() {
        setTvCode("");
        setOrderNumber("");
        setStep(1);
        setValidated(null);
        setAutomationAttempted(false);
        setCompleted(false);
        setError("");
    }

    return (
        <div className="page-shell tv-setup-page">
            <div className="page-shell-bg" aria-hidden="true">
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={null}
                    cartCount={0}
                    onOpenCart={() => {}}
                    onGoOrders={() => navigate("/orders")}
                    onGoRenewals={() => navigate("/renewals")}
                    onGoWallet={() => navigate("/topups")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoCodes={() => navigate("/codes")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoAdvertising={() => navigate("/advertising")}
                    onGoSupport={() => navigate("/support")}
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                <main className="main tv-setup-main">
                    <section className="tv-setup-hero">
                        <div className="tv-setup-hero__icon"><Tv size={28} strokeWidth={2.2} aria-hidden="true" /></div>
                        <div>
                            <span className="tv-setup-eyebrow">Nuevo acceso</span>
                            <h1>Inicia sesión en tu TV</h1>
                            <p>Conecta tu televisor a Netflix con el código que aparece en pantalla.</p>
                        </div>
                    </section>

                    <StepIndicator step={completed ? 4 : step} />
                    <ErrorNotice message={error} />

                    {completed ? (
                        <motion.section className="tv-setup-success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                            <div className="tv-setup-success__icon"><CheckCircle2 size={34} strokeWidth={2.2} aria-hidden="true" /></div>
                            <span className="tv-setup-eyebrow">Proceso completado</span>
                            <h2>¡Tu TV está lista para ver Netflix!</h2>
                            <p>Netflix confirmó la conexión automáticamente. Ya puedes volver a la aplicación en tu televisor.</p>
                            <div className="tv-setup-success__meta">
                                <span>Pedido #{validated?.orderNumber}</span>
                                <span>{validated?.accountEmail}</span>
                            </div>
                            <button type="button" className="tv-setup-secondary-button" onClick={resetFlow}>
                                <RefreshCw size={17} aria-hidden="true" />
                                Registrar otro TV
                            </button>
                        </motion.section>
                    ) : (
                        <motion.section className="tv-setup-card" layout>
                            {step === 1 ? (
                                <form onSubmit={validateOrder} className="tv-setup-panel">
                                    <div className="tv-setup-panel__heading">
                                        <div className="tv-setup-panel__number">1</div>
                                        <div>
                                            <h2>Ingresa los datos del TV</h2>
                                            <p>Escribe el código de 8 dígitos que aparece en la pantalla de Netflix.</p>
                                        </div>
                                    </div>

                                    <label className="tv-setup-field">
                                        <span>Código del TV</span>
                                        <input
                                            value={normalizedTvCode}
                                            onChange={(event) => setTvCode(event.target.value)}
                                            placeholder="9875-3269"
                                            inputMode="numeric"
                                            autoComplete="off"
                                            maxLength={9}
                                            aria-describedby="tv-code-help"
                                        />
                                        <small id="tv-code-help">Usa el formato 0000-0000.</small>
                                    </label>

                                    <label className="tv-setup-field">
                                        <span>Número del pedido</span>
                                        <input
                                            value={orderNumber}
                                            onChange={(event) => setOrderNumber(onlyDigits(event.target.value, 20))}
                                            placeholder="#12345"
                                            inputMode="numeric"
                                            autoComplete="off"
                                        />
                                        <small>Debe ser un pedido de Netflix activo y con cuenta asignada.</small>
                                    </label>

                                    <div className="tv-setup-security-note">
                                        <ShieldCheck size={18} aria-hidden="true" />
                                        <span>Validamos que el pedido pertenezca a tu cuenta y que siga vigente.</span>
                                    </div>

                                    <button type="submit" className="tv-setup-primary-button" disabled={!canValidate}>
                                        {loading ? "Validando..." : "Validar y conectar TV"}
                                        {!loading ? <ArrowRight size={18} aria-hidden="true" /> : null}
                                    </button>
                                </form>
                            ) : null}

                            {step === 2 && validated ? (
                                <motion.div className="tv-setup-panel" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}>
                                    <div className="tv-setup-panel__heading">
                                        <div className="tv-setup-panel__number">2</div>
                                        <div>
                                            <h2>Conectando tu TV</h2>
                                            <p>El sistema está ejecutando el proceso completo en Netflix.</p>
                                        </div>
                                    </div>

                                    <div className="tv-setup-tv-code">
                                        <span>Código del TV</span>
                                        <strong>{validated.tvCode}</strong>
                                        <button type="button" className="tv-setup-icon-button" onClick={() => void copyText(validated.tvCode)} aria-label="Copiar código del TV" title="Copiar código del TV">
                                            <Copy size={17} aria-hidden="true" />
                                        </button>
                                    </div>

                                    <div className="tv-setup-automation-state" aria-live="polite">
                                        <div className={`tv-setup-automation-state__icon${loading ? " is-loading" : ""}`}>
                                            {loading ? <RefreshCw size={20} aria-hidden="true" /> : <ShieldCheck size={20} aria-hidden="true" />}
                                        </div>
                                        <div>
                                            <strong>{loading ? "Conectando automáticamente..." : "No se completó la conexión"}</strong>
                                            <p>{loading ? "TV2, correo, código de Inicio y confirmación se ejecutan en el servidor." : "Puedes reintentar el proceso sin volver a digitar los datos."}</p>
                                        </div>
                                    </div>

                                    <div className="tv-setup-summary">
                                        <CopyField label="Correo de la cuenta" value={validated.accountEmail} icon={Mail} helper={`Perfil ${validated.profile ?? "-"} · Vence ${formatExpiry(validated.expiresAt)}`} />
                                        <div className="tv-setup-counter-note">
                                            <KeyRound size={18} aria-hidden="true" />
                                            <p>El código de Inicio usa el mismo contador y proveedor configurado en Códigos.</p>
                                        </div>
                                    </div>

                                    {!loading && automationAttempted ? (
                                        <button type="button" className="tv-setup-primary-button" onClick={() => void runAutomation(validated)}>
                                            <RefreshCw size={18} aria-hidden="true" />
                                            Reintentar conexión automática
                                        </button>
                                    ) : null}
                                </motion.div>
                            ) : null}
                        </motion.section>
                    )}

                    <p className="tv-setup-footnote">El acceso de Inicio usa el proveedor configurado para tu cuenta y respeta el límite del pedido.</p>
                </main>
            </div>
        </div>
    );
}
