import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Gift, Mail, RefreshCw, Share2, UsersRound } from "lucide-react";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";
import { apiGet, apiFetch } from "../api/api";
import ReferralHistory, { ReferralMetrics } from "../components/referrals/ReferralHistory.jsx";
import { money, dateTime, STATUS_LABELS } from "../utils/referrals.js";
import "../styles/referrals.css";

export default function Referrals() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const logout = useAppLogout();
    const [data, setData] = useState(null);
    const [wallet, setWallet] = useState(null);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("");
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [savingConsent, setSavingConsent] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [sendingInvite, setSendingInvite] = useState(false);
    const linkRef = useRef(null);
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true); setError("");
            const response = await apiGet("/referrals/me?" + new URLSearchParams({ page, status }), { signal: controller.signal });
            if (controller.signal.aborted) return;
            if (response.ok) setData(response.data);
            else { setData(null); setError(response.data?.message || "No se pudieron cargar los referidos."); }
            setLoading(false);
        }
        void load();
        return () => controller.abort();
    }, [page, status, revision]);
    useEffect(() => { let active = true; apiGet("/wallet").then(r => { if (active && r.ok) setWallet(r.data); }); return () => { active = false; }; }, []);

    async function copyLink() {
        try { await navigator.clipboard.writeText(data.shareUrl); setMessage("Enlace copiado."); }
        catch { linkRef.current?.select(); setMessage("No se pudo copiar automáticamente. El enlace quedó seleccionado."); }
    }

    async function changeConsent(consent) {
        const previous = data.invitation.contactSharing;
        setSavingConsent(true); setError("");
        setData(current => ({ ...current, invitation: { ...current.invitation, contactSharing: consent } }));
        try {
            const response = await apiFetch("/referrals/contact-consent", { method: "PUT", body: JSON.stringify({ consent }) });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo actualizar la autorización.");
            setMessage(consent ? "Autorización de contacto activada." : "Tu contacto y avance ya no se comparten con el referente.");
            setRevision(value => value + 1);
        } catch (failure) {
            setData(current => current?.invitation ? { ...current, invitation: { ...current.invitation, contactSharing: previous } } : current);
            setError(failure.message);
        } finally { setSavingConsent(false); }
    }

    async function sendEmailInvite(event) {
        event.preventDefault();
        setSendingInvite(true); setError(""); setMessage("");
        try {
            const response = await apiFetch("/referrals/invite", { method: "POST", body: JSON.stringify({ email: inviteEmail.trim() }) });
            if (!response.ok) throw new Error(response.data?.message || "No se pudo enviar la invitación.");
            setMessage("Invitación enviada a " + (response.data?.email || inviteEmail.trim()) + ". El enlace es único y vence en 7 días.");
            setInviteEmail("");
        } catch (failure) {
            setError(failure.message || "No se pudo enviar la invitación.");
        } finally { setSendingInvite(false); }
    }

    const campaign = data?.campaign;
    const canInvite = Boolean(data?.eligible && campaign?.active);
    const shareText = canInvite ? "Te invito a Streaming Box: " + data.shareUrl : "";
    return <div className="page-shell"><div className="page-inner">
        <Sidebar user={user} wallet={wallet} cartCount={0} onGoAdmin={() => navigate("/admin")} onLogout={logout} />
        <main className="main referrals-page">
            <header className="referrals-header"><div><UsersRound size={24} aria-hidden /><h1>Referidos</h1></div><button className="referrals-icon-button" type="button" onClick={() => setRevision(v => v + 1)} disabled={loading} title="Actualizar referidos" aria-label="Actualizar referidos"><RefreshCw size={18} /></button></header>
            {error && <p className="referrals-error" role="alert">{error}</p>}
            {data && <>
                <section className="referrals-invitation" aria-label="Tu invitación">
                    <div className="referrals-offer"><Gift size={28} aria-hidden /><div><h2>{canInvite ? money(campaign.rewardAmount) + " por cada referido válido" : !data.eligible ? "Disponible para clientes activos en COP" : "Campaña pausada"}</h2><p>{canInvite ? "Clientes nuevos. Meta acumulada: " + money(campaign.minimumTopup) + " en recargas aprobadas durante los " + campaign.attributionDays + " días posteriores al registro." : "Los premios ya ofrecidos conservan las condiciones registradas."}</p></div></div>
                    {canInvite && <div className="referrals-share"><label htmlFor="referral-link">Tu enlace personal <code>{data.code}</code></label><div><input id="referral-link" ref={linkRef} readOnly value={data.shareUrl} /><button type="button" className="referrals-icon-button" onClick={copyLink} title="Copiar enlace" aria-label="Copiar enlace"><Copy size={18} /></button><a className="referrals-button" href={"https://wa.me/?text=" + encodeURIComponent(shareText)} target="_blank" rel="noopener noreferrer"><Share2 size={17} />Compartir</a></div></div>}
                    {canInvite && <form className="referrals-email-invite" onSubmit={sendEmailInvite}>
                        <label htmlFor="referral-invite-email">Invitar por correo<input id="referral-invite-email" type="email" autoComplete="email" maxLength={254} placeholder="persona@correo.com" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} required /></label>
                        <button type="submit" className="referrals-button is-primary" disabled={sendingInvite || loading}><Mail size={17} />{sendingInvite ? "Enviando…" : "Enviar invitación"}</button>
                        <p>Le enviaremos un enlace individual para ese correo. Al abrirlo, el correo aparecerá precargado; el enlace vence en 7 días y queda inutilizado al registrarse.</p>
                    </form>}
                    {message && <p className="referrals-success" role="status">{message}</p>}
                    <p className="referrals-terms">Premio único para quien invita, acreditado como saldo de compras. Se suman las recargas aprobadas del invitado dentro del plazo; los bonos, recargas rechazadas y ajustes administrativos no cuentan. No aplica a autorreferidos ni a cuentas antiguas. El bono habitual de recargas del invitado no cambia.</p>
                </section>
                {data.invitation && <section className="referrals-invitation" aria-label="Mi invitación"><h2>Mi meta de invitación</h2><p>{money(data.invitation.progressAmount)} de {money(data.invitation.targetAmount)} · Hasta {dateTime(data.invitation.expiresAt)}</p><label className="referrals-switch"><input type="checkbox" role="switch" checked={data.invitation.contactSharing} disabled={savingConsent} onChange={event => changeConsent(event.target.checked)} />Compartir mi nombre, correo y avance con quien me invitó</label></section>}
                <ReferralMetrics summary={data.summary} />
            </>}
            <div className="referrals-toolbar"><h2>Mis referidos</h2><label>Estado<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <ReferralHistory data={data} loading={loading} onPage={setPage} />
        </main>
    </div></div>;
}
