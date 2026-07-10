import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiPost } from "../api/api";
import { useCartCheckout } from "./useCartCheckout";

vi.mock("../api/api", () => ({
    apiPost: vi.fn(),
}));

function setupHook(overrides = {}) {
    const clearCart = vi.fn();
    const setWallet = vi.fn();
    const onPurchaseSuccess = vi.fn();
    const cart = overrides.cart ?? [
        { platformPriceId: 10 },
        { type: "combo", comboId: 7 },
    ];

    const result = renderHook(() => useCartCheckout({
        cart,
        clearCart,
        setWallet,
        onPurchaseSuccess,
    }));

    return { ...result, cart, clearCart, setWallet, onPurchaseSuccess };
}

describe("useCartCheckout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("envia items y combos, actualiza wallet y limpia carrito cuando la compra es exitosa", async () => {
        apiPost.mockResolvedValue({
            ok: true,
            data: {
                orderCode: "ORD-TEST",
                wallet: { balance: 12000, profit_total: 3500, currency: "COP" },
            },
        });
        const { result, clearCart, setWallet, onPurchaseSuccess } = setupHook();

        await act(async () => {
            await result.current.checkout({ recordProfit: true, profitAmount: "3500" });
        });

        expect(apiPost).toHaveBeenCalledWith("/checkout", {
            items: [{ platformPriceId: 10 }],
            combos: [{ comboId: 7, quantity: 1 }],
            recordProfit: true,
            profitAmount: 3500,
        }, expect.objectContaining({
            headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
        }));
        expect(result.current.buyResult).toEqual({
            orderCode: "ORD-TEST",
            wallet: { balance: 12000, profit_total: 3500, currency: "COP" },
        });
        expect(clearCart).toHaveBeenCalledTimes(1);
        expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);

        const walletUpdater = setWallet.mock.calls[0][0];
        expect(walletUpdater({ balance: 0, profit_total: 0, currency: "COP" })).toEqual({
            balance: 12000,
            profit_total: 3500,
            currency: "COP",
        });
    });

    it("no llama el backend cuando el carrito esta vacio", async () => {
        const { result, clearCart } = setupHook({ cart: [] });

        await act(async () => {
            await result.current.checkout({ recordProfit: false, profitAmount: 0 });
        });

        expect(apiPost).not.toHaveBeenCalled();
        expect(clearCart).not.toHaveBeenCalled();
    });

    it("muestra error y no limpia el carrito si checkout falla", async () => {
        apiPost.mockResolvedValue({
            ok: false,
            data: { message: "Saldo insuficiente." },
        });
        const { result, clearCart, onPurchaseSuccess } = setupHook();

        await act(async () => {
            await result.current.checkout({ recordProfit: false, profitAmount: 0 });
        });

        await waitFor(() => {
            expect(result.current.error).toBe("Saldo insuficiente.");
        });
        expect(clearCart).not.toHaveBeenCalled();
        expect(onPurchaseSuccess).not.toHaveBeenCalled();
    });
});
