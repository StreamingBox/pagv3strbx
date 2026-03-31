import { useMemo, useState, useEffect } from "react";
import { useCartCheckout } from "../../hooks/useCartCheckout.js";

import CartItemsList from "./cart/CartItemsList.jsx";
import WhatsappToggle from "./cart/WhatsappToggle.jsx";
import CartFooter from "./cart/CartFooter.jsx";
import CartResult from "./cart/CartResult.jsx";

import "./cartDrawer.css";

export default function CartDrawer({
    open,
    onClose,
    cart,
    setCart,
    wallet,
    setWallet,
    onPurchaseSuccess
}) {
    const [includeWhatsapp, setIncludeWhatsapp] = useState(true);

    const [profitOpen, setProfitOpen] = useState(false);
    const [recordProfit, setRecordProfit] = useState(false);
    const [profitAmount, setProfitAmount] = useState("");

    // ── Estado WhatsApp envío directo ──
    const [waPhone, setWaPhone] = useState("");
    const [waEnabled, setWaEnabled] = useState(false);
    const [waSending, setWaSending] = useState(false);
    const [waResult, setWaResult] = useState(null); // { ok, text }

    const cartTotal = useMemo(
        () => cart.reduce((sum, it) => sum + Number(it.price || 0), 0),
        [cart]
    );

    const cartCurrency = cart[0]?.currency || wallet.currency || "COP";

    function removeFromCart(index) {
        setCart((prev) => prev.filter((_, i) => i !== index));
    }

    function clearCart() {
        setCart([]);
    }

    const {
        buyLoading,
        buyResult,
        error,
        whatsappMessage,
        checkout,
    } = useCartCheckout({
        cart,
        cartTotal,
        cartCurrency,
        clearCart,
        setWallet,
        onPurchaseSuccess,
    });

    // Cuando termina la compra y hay número ingresado, enviar automáticamente
    useEffect(() => {
        if (buyResult && whatsappMessage && waEnabled && waPhone.trim()) {
            sendToWhatsApp(waPhone.trim(), whatsappMessage);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buyResult, whatsappMessage]);

    async function sendToWhatsApp(phone, text) {
        let to = phone.replace(/\s|-/g, "");
        if (!to.startsWith("+")) to = "+" + to;

        const fullText = `${text}\n\n---\n⚠️ Este es un mensaje automático enviado por un bot. Por favor NO respondas a este mensaje.`;

        setWaSending(true);
        setWaResult(null);
        try {
            const r = await fetch("/api/whatsapp/send", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to, text: fullText }),
            });
            const d = await r.json();
            setWaResult({ ok: d.ok, text: d.ok ? `✅ Enviado al ${to}` : (d.message || "Error al enviar") });
        } catch {
            setWaResult({ ok: false, text: "Error de red al enviar." });
        } finally {
            setWaSending(false);
        }
    }

    async function onCheckout() {
        await checkout({
            includeWhatsapp,
            whatsappPhone: waEnabled ? waPhone : null,
            recordProfit,
            profitAmount,
        });
    }

    if (!open) return null;

    return (
        <div className="cart-overlay" onClick={onClose}>
            <aside className="cart-drawer kpi" onClick={(e) => e.stopPropagation()}>
                <header className="cart-header">
                    <h3 className="cart-title">🛒 Carrito</h3>
                    <button
                        className="btn-ghost"
                        onClick={onClose}
                        style={{ padding: "0 10px", fontSize: 18, minWidth: 36, height: 36 }}
                        title="Cerrar carrito"
                    >
                        ✕
                    </button>
                </header>

                {error ? <div className="error cart-error">{error}</div> : null}

                {!cart.length ? (
                    <p className="cart-empty">Tu carrito está vacío.</p>
                ) : (
                    <>
                        <CartItemsList cart={cart} onRemove={removeFromCart} />

                        <WhatsappToggle
                            includeWhatsapp={includeWhatsapp}
                            setIncludeWhatsapp={setIncludeWhatsapp}
                        />

                        {/* ── Bloque de envío a WhatsApp ── */}
                        <div style={{
                            margin: "0 0 10px",
                            borderRadius: 14,
                            border: waEnabled
                                ? "1.5px solid rgba(37,211,102,0.4)"
                                : "1px solid var(--stroke)",
                            background: waEnabled
                                ? "rgba(37,211,102,0.06)"
                                : "var(--card2, var(--card))",
                            overflow: "hidden",
                            transition: "border-color 0.2s, background 0.2s",
                        }}>
                            {/* Toggle header */}
                            <button
                                onClick={() => { setWaEnabled(v => !v); setWaResult(null); }}
                                style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "12px 14px",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontFamily: "var(--font)",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 20 }}>📲</span>
                                    <div style={{ textAlign: "left" }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                                            Enviar al WhatsApp
                                        </div>
                                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                            {waEnabled ? "Ingresa el número para recibir las credenciales" : "Recibe las credenciales automáticamente"}
                                        </div>
                                    </div>
                                </div>
                                <div style={{
                                    width: 40, height: 22, borderRadius: 11,
                                    background: waEnabled ? "#25d366" : "var(--stroke)",
                                    position: "relative", flexShrink: 0,
                                    transition: "background 0.2s",
                                }}>
                                    <div style={{
                                        width: 16, height: 16, borderRadius: "50%",
                                        background: "#fff",
                                        position: "absolute",
                                        top: 3,
                                        left: waEnabled ? 21 : 3,
                                        transition: "left 0.2s",
                                        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                                    }} />
                                </div>
                            </button>

                            {/* Input de número (cuando está activado) */}
                            {waEnabled && (
                                <div style={{ padding: "0 14px 14px" }}>
                                    <input
                                        type="tel"
                                        placeholder="573001234567 (con código de país)"
                                        value={waPhone}
                                        onChange={e => setWaPhone(e.target.value)}
                                        style={{
                                            width: "100%",
                                            padding: "10px 12px",
                                            borderRadius: 10,
                                            border: "1px solid rgba(37,211,102,0.35)",
                                            background: "var(--input-bg)",
                                            color: "var(--text)",
                                            fontSize: 14,
                                            boxSizing: "border-box",
                                            outline: "none",
                                            fontFamily: "var(--font)",
                                        }}
                                        required
                                    />
                                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
                                        💡 Se enviará automáticamente al finalizar la compra.
                                    </div>
                                </div>
                            )}
                        </div>

                        <CartFooter
                            cartTotal={cartTotal}
                            cartCurrency={cartCurrency}
                            buyLoading={buyLoading}
                            onClear={clearCart}
                            onCheckout={onCheckout}
                            wallet={wallet}
                            profitOpen={profitOpen}
                            setProfitOpen={setProfitOpen}
                            recordProfit={recordProfit}
                            setRecordProfit={setRecordProfit}
                            profitAmount={profitAmount}
                            setProfitAmount={setProfitAmount}
                        />

                        {/* Estado del envío de WhatsApp */}
                        {(waSending || waResult) && (
                            <div style={{
                                padding: "10px 14px",
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: 600,
                                marginTop: 6,
                                background: waSending
                                    ? "rgba(37,211,102,0.08)"
                                    : waResult?.ok
                                        ? "rgba(34,197,94,0.12)"
                                        : "rgba(239,68,68,0.10)",
                                color: waSending
                                    ? "#25d366"
                                    : waResult?.ok ? "#22c55e" : "#ef4444",
                                border: `1px solid ${waSending
                                    ? "rgba(37,211,102,0.2)"
                                    : waResult?.ok
                                        ? "rgba(34,197,94,0.3)"
                                        : "rgba(239,68,68,0.3)"}`,
                            }}>
                                {waSending ? "📲 Enviando al WhatsApp..." : waResult?.text}
                            </div>
                        )}

                        {buyResult ? (
                            <CartResult whatsappMessage={whatsappMessage} onClose={onClose} />
                        ) : null}
                    </>
                )}
            </aside>
        </div>
    );
}
