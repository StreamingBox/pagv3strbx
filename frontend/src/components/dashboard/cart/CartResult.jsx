import { useState } from "react";
import { copyText } from "../../../utils/platform.js";

export default function CartResult({ whatsappMessage, onClose }) {
    const [showWaForm, setShowWaForm] = useState(false);
    const [phone, setPhone] = useState("");
    const [sending, setSending] = useState(false);
    const [waResult, setWaResult] = useState(null); // { ok, text }

    async function handleSendWhatsapp(e) {
        e.preventDefault();
        if (!phone.trim()) return;

        setSending(true);
        setWaResult(null);

        // Armar número E.164 — el user pondrá p.ej. 573001234567 o +573001234567
        let to = phone.trim().replace(/\s|-/g, "");
        if (!to.startsWith("+")) to = "+" + to;

        // Mensaje con nota de bot al final
        const text = `${whatsappMessage}\n\n---\n⚠️ _Este es un mensaje automático enviado por un bot. Por favor NO respondas a este mensaje._`;

        try {
            const r = await fetch(`/api/whatsapp/send`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to, text }),
            });
            const d = await r.json();
            if (d.ok) {
                setWaResult({ ok: true, text: `✅ Mensaje enviado al WhatsApp ${to}` });
                setShowWaForm(false);
                setPhone("");
            } else {
                setWaResult({ ok: false, text: d.message || "Error al enviar el mensaje." });
            }
        } catch {
            setWaResult({ ok: false, text: "Error de red. Intenta de nuevo." });
        } finally {
            setSending(false);
        }
    }

    return (
        <section className="cart-result kpi">
            <div className="cart-resultTitle">✅ Compra realizada</div>

            {/* ── Botón WhatsApp prominente ARRIBA ── */}
            {!showWaForm && !waResult?.ok && (
                <button
                    className="btn"
                    style={{
                        width: "100%",
                        background: "linear-gradient(135deg, #25d366, #128c7e)",
                        boxShadow: "0 4px 18px rgba(37,211,102,0.4)",
                        border: "none",
                        fontSize: 15,
                        padding: "13px 0",
                        marginTop: 4,
                        marginBottom: 4,
                        borderRadius: 12,
                    }}
                    onClick={() => setShowWaForm(true)}
                    title="Enviar las credenciales directamente por WhatsApp"
                >
                    📲 Enviar credenciales al WhatsApp
                </button>
            )}

            <div className="cart-resultHint">O copia y pega esto en WhatsApp:</div>

            <pre className="cart-resultPre">{whatsappMessage}</pre>

            <div className="cart-resultActions">
                <button className="btn" onClick={() => copyText(whatsappMessage)} disabled={!whatsappMessage}>
                    Copiar mensaje
                </button>

                <button className="btn-ghost" onClick={onClose}>
                    Cerrar
                </button>
            </div>

            {/* ── Formulario de número ── */}
            {showWaForm && (
                <form
                    onSubmit={handleSendWhatsapp}
                    style={{
                        marginTop: 14,
                        padding: "16px",
                        borderRadius: 12,
                        background: "rgba(37,211,102,0.07)",
                        border: "1px solid rgba(37,211,102,0.25)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                    }}
                >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        📲 ¿A qué número enviarlo?
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Incluye el código de país (ej: <code>573001234567</code>)
                    </div>
                    <input
                        type="tel"
                        placeholder="573001234567"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        pattern="[+]?[0-9\s\-]{7,20}"
                        required
                        style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--stroke)",
                            background: "var(--input-bg)",
                            color: "var(--text)",
                            fontSize: 14,
                            outline: "none",
                        }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            type="submit"
                            disabled={sending}
                            className="btn"
                            style={{
                                flex: 1,
                                background: "linear-gradient(135deg, #25d366, #128c7e)",
                                border: "none",
                            }}
                        >
                            {sending ? "Enviando..." : "📤 Enviar ahora"}
                        </button>
                        <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => { setShowWaForm(false); setWaResult(null); }}
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {/* ── Resultado del envío ── */}
            {waResult && (
                <div style={{
                    marginTop: 10,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    background: waResult.ok
                        ? "rgba(34,197,94,0.12)"
                        : "rgba(239,68,68,0.10)",
                    color: waResult.ok ? "#22c55e" : "#ef4444",
                    border: `1px solid ${waResult.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                }}>
                    {waResult.text}
                </div>
            )}

            <div className="cart-resultSaved">
                ✅ Guardado como "último mensaje" para copiarlo luego desde el historial.
            </div>
        </section>
    );
}
