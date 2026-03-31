import { useState } from "react";
import { apiPost } from "../api/api";

function saveLastWhatsappPayload({ data, cartTotal, cartCurrency, cartCount }) {
    try {
        const payload = {
            message: data?.message || "",
            orderCode: data?.orderCode || data?.order_code || "",
            orderId: data?.orderId || data?.order_id || null,
            createdAt: new Date().toISOString(),
            total: data?.total ?? cartTotal ?? null,
            currency: data?.currency || cartCurrency || "",
            count: cartCount ?? null,
        };
        localStorage.setItem("lastWhatsappPayload", JSON.stringify(payload));
        window.dispatchEvent(new Event("lastWhatsappPayloadUpdated"));
    } catch {
        // ignore
    }
}

export function useCartCheckout({ cart, cartTotal, cartCurrency, clearCart, setWallet, onPurchaseSuccess }) {
    const [buyLoading, setBuyLoading] = useState(false);
    const [buyResult, setBuyResult] = useState(null);
    const [error, setError] = useState("");
    const [whatsappMessage, setWhatsappMessage] = useState("");

    async function checkout({ includeWhatsapp, whatsappPhone, recordProfit, profitAmount }) {
        if (!cart?.length) return;

        setBuyLoading(true);
        setError("");
        setBuyResult(null);
        setWhatsappMessage("");

        try {
            // ✅ cookies HttpOnly (apiPost -> apiFetch -> credentials: "include")
            const res = await apiPost("/checkout", {
                items: cart.map((c) => ({ platformPriceId: c.platformPriceId })),
                includeWhatsapp,
                whatsappPhone,
                recordProfit,
                profitAmount: recordProfit ? Number(profitAmount || 0) : 0,
            });

            if (!res.ok) {
                throw new Error(res.data?.message || "No se pudo completar el checkout.");
            }

            const data = res.data;

            setBuyResult(data);
            setWhatsappMessage(data?.message || "");

            // ✅ Wallet (si backend la devuelve)
            if (data?.wallet) {
                setWallet((prev) => ({
                    ...prev,
                    balance: data?.wallet?.balance ?? prev.balance,
                    profit_total: data?.wallet?.profit_total ?? prev.profit_total,
                    currency: data?.wallet?.currency ?? prev.currency,
                }));
            }

            clearCart();

            saveLastWhatsappPayload({
                data,
                cartTotal,
                cartCurrency,
                cartCount: Array.isArray(cart) ? cart.length : null,
            });

            // ✅ Llama al callback de éxito para cerrar el modal y recargar el catálogo
            if (typeof onPurchaseSuccess === "function") {
                onPurchaseSuccess();
            }
        } catch (e) {
            setError(e?.message || "Error en checkout.");
        } finally {
            setBuyLoading(false);
        }
    }

    function resetResult() {
        setBuyResult(null);
        setWhatsappMessage("");
        setError("");
    }

    return {
        buyLoading,
        buyResult,
        error,
        whatsappMessage,
        checkout,
        resetResult,
        setError,
    };
}
