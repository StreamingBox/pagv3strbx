import { useState } from "react";
import { apiPost } from "../api/api";

export function useCartCheckout({ cart, clearCart, setWallet, onPurchaseSuccess }) {
    const [buyLoading, setBuyLoading] = useState(false);
    const [buyResult, setBuyResult] = useState(null);
    const [error, setError] = useState("");

    async function checkout({ recordProfit, profitAmount }) {
        if (!cart?.length) return;

        setBuyLoading(true);
        setError("");
        setBuyResult(null);

        try {
            // ✅ cookies HttpOnly (apiPost -> apiFetch -> credentials: "include")
            const res = await apiPost("/checkout", {
                items: cart
                    .filter((c) => c.type !== "combo")
                    .map((c) => ({ platformPriceId: c.platformPriceId })),
                combos: cart
                    .filter((c) => c.type === "combo")
                    .map((c) => ({ comboId: c.comboId, quantity: 1 })),
                recordProfit,
                profitAmount: recordProfit ? Number(profitAmount || 0) : 0,
            });

            if (!res.ok) {
                throw new Error(res.data?.message || "No se pudo completar el checkout.");
            }

            const data = res.data;

            setBuyResult(data);

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
        setError("");
    }

    return {
        buyLoading,
        buyResult,
        error,
        checkout,
        resetResult,
        setError,
    };
}
