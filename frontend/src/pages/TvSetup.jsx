import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    ClipboardCheck,
    Copy,
    ExternalLink,
    KeyRound,
    Mail,
    MonitorPlay,
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

const NETFLIX_TV_URL = "https://www.netflix.com/tv2";

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
        { number: 2, label: "Conectar TV" },
        { number: 3, label: "Confirmar acceso" },
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

    const [tvCode, setTvCode] = useState("");
    const [orderNumber, setOrderNumber] = useState("");
    const [step, setStep] = useState(1);
    const [validated, setValidated] = useState(null);
    const [loginCode, setLoginCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [netflixOpened, setNetflixOpened] = useState(false);
    const [completed, setCompleted] = useState(false);

    const normalizedTvCode = useMemo(() => formatTvCode(tvCode), [tvCode]);
    const canValidate = /^\d{4}-\d{4}$/.test(normalizedTvCode) && onlyDigits(orderNumber, 20).length > 0 && !loading;

    async function validateOrder(event) {
        event?.preventDefault();
        if (!canValidate) return;
        setLoading(true);
        setError("");
        setValidated(null);
        setLoginCode("");
        setCompleted(false);

        try {
            const response = await apiPost("/tv-setup/validate", {
                tvCode: normalizedTvCode,
                orderNumber: orderNumber.trim(),
            });
            if (!response.ok) {
                throw new Error(response.data?.message || "No fue posible validar el pedido.");
            }
            setValidated(response.data);
            setNetflixOpened(false);
            setStep(2);
        } catch (requestError) {
            setError(requestError?.message || "No fue posible validar el pedido.");
        } finally {
            setLoading(false);
        }
    }

    async function openNetflix() {
        await copyText(normalizedTvCode);
        window.open(NETFLIX_TV_URL, "_blank", "noopener,noreferrer");
        setNetflixOpened(true);
    }

    async function requestLoginCode() {
        if (!validated?.orderNumber || loading) return;
        setLoading(true);
        setError("");

        try {
            const response = await apiPost("/codes/netflix/request", {
                orderNumber: validated.orderNumber,
                action: "code",
            });
            if (!response.ok) {
                throw new Error(response.data?.message || "No se pudo consultar el código de inicio.");
            }
            if (!response.data?.code) {
                throw new Error("Netflix no devolvió un código de inicio válido.");
            }
            setLoginCode(String(response.data.code));
        } catch (requestError) {
            setError(requestError?.message || "No se pudo consultar el código de inicio.");
        } finally {
            setLoading(false);
        }
    }

    function confirmSetup() {
        if (!loginCode) return;
        setCompleted(true);
    }

    function resetFlow() {
        setTvCode("");
        setOrderNumber("");
        setStep(1);
        setValidated(null);
        setLoginCode("");
        setNetflixOpened(false);
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
                            <p>El código fue confirmado. Puedes volver a Netflix en tu televisor para comenzar a disfrutar.</p>
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
                                        {loading ? "Validando..." : "Validar pedido"}
                                        {!loading ? <ArrowRight size={18} aria-hidden="true" /> : null}
                                    </button>
                                </form>
                            ) : null}

                            {step === 2 && validated ? (
                                <motion.div className="tv-setup-panel" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}>
                                    <div className="tv-setup-panel__heading">
                                        <div className="tv-setup-panel__number">2</div>
                                        <div>
                                            <h2>Conecta tu televisor</h2>
                                            <p>Abre Netflix TV2 e ingresa el código que tienes en pantalla.</p>
                                        </div>
                                    </div>

                                    <div className="tv-setup-tv-code">
                                        <span>Código del TV</span>
                                        <strong>{validated.tvCode}</strong>
                                        <button type="button" className="tv-setup-icon-button" onClick={() => void copyText(validated.tvCode)} aria-label="Copiar código del TV" title="Copiar código del TV">
                                            <Copy size={17} aria-hidden="true" />
                                        </button>
                                    </div>

                                    <div className="tv-setup-instructions">
                                        <div><span>1</span><p>Abre Netflix TV2 en una pestaña nueva.</p></div>
                                        <div><span>2</span><p>Digita <strong>{validated.tvCode}</strong> y pulsa “Ingresa el código para continuar”.</p></div>
                                        <div><span>3</span><p>Cuando Netflix pida el correo, usa el correo de la cuenta que aparece abajo.</p></div>
                                    </div>

                                    <CopyField label="Correo de la cuenta" value={validated.accountEmail} icon={Mail} helper={`Perfil ${validated.profile ?? "-"} · Vence ${formatExpiry(validated.expiresAt)}`} />

                                    <div className="tv-setup-actions">
                                        <button type="button" className="tv-setup-primary-button" onClick={() => void openNetflix()}>
                                            <ExternalLink size={18} aria-hidden="true" />
                                            {netflixOpened ? "Abrir Netflix TV2 de nuevo" : "Abrir Netflix TV2"}
                                        </button>
                                        <button type="button" className="tv-setup-secondary-button" onClick={() => { setError(""); setStep(3); }}>
                                            Ya ingresé el código
                                            <ArrowRight size={17} aria-hidden="true" />
                                        </button>
                                    </div>
                                </motion.div>
                            ) : null}

                            {step === 3 && validated ? (
                                <motion.div className="tv-setup-panel" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}>
                                    <div className="tv-setup-panel__heading">
                                        <div className="tv-setup-panel__number">3</div>
                                        <div>
                                            <h2>Confirma el acceso</h2>
                                            <p>Consulta el código de Inicio para terminar la conexión del televisor.</p>
                                        </div>
                                    </div>

                                    <div className="tv-setup-summary">
                                        <CopyField label="Pedido validado" value={`#${validated.orderNumber}`} icon={ClipboardCheck} />
                                        <CopyField label="Correo usado en Netflix" value={validated.accountEmail} icon={Mail} />
                                    </div>

                                    <div className="tv-setup-counter-note">
                                        <KeyRound size={18} aria-hidden="true" />
                                        <p>Esta consulta usa el mismo contador del botón <strong>Inicio</strong> en Códigos.</p>
                                    </div>

                                    {!loginCode ? (
                                        <button type="button" className="tv-setup-primary-button" onClick={() => void requestLoginCode()} disabled={loading}>
                                            {loading ? "Consultando código..." : "Consultar código de Inicio"}
                                            {!loading ? <KeyRound size={18} aria-hidden="true" /> : null}
                                        </button>
                                    ) : (
                                        <>
                                            <div className="tv-setup-login-code">
                                                <div>
                                                    <span>Código de Inicio</span>
                                                    <strong>{loginCode}</strong>
                                                </div>
                                                <button type="button" className="tv-setup-icon-button" onClick={() => void copyText(loginCode)} aria-label="Copiar código de Inicio" title="Copiar código de Inicio">
                                                    <Copy size={18} aria-hidden="true" />
                                                </button>
                                            </div>
                                            <div className="tv-setup-final-note">
                                                <MonitorPlay size={18} aria-hidden="true" />
                                                <p>Ingresa este código en Netflix. Confirma solo cuando aparezca “¡Tu TV está lista para ver Netflix!”.</p>
                                            </div>
                                            <div className="tv-setup-actions">
                                                <button type="button" className="tv-setup-secondary-button" onClick={() => setStep(2)}>
                                                    <ArrowLeft size={17} aria-hidden="true" />
                                                    Volver
                                                </button>
                                                <button type="button" className="tv-setup-primary-button" onClick={confirmSetup}>
                                                    <CheckCircle2 size={18} aria-hidden="true" />
                                                    Confirmar TV configurado
                                                </button>
                                            </div>
                                        </>
                                    )}
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
