import { useEffect, useMemo, useState } from "react";
import { useCartCheckout } from "../../hooks/useCartCheckout.js";

import CartItemsList from "./cart/CartItemsList.jsx";
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
    const [profitOpen, setProfitOpen] = useState(false);
    const [recordProfit, setRecordProfit] = useState(false);
    const [profitAmount, setProfitAmount] = useState("");
    const [detailsAccepted, setDetailsAccepted] = useState(false);

    const cartTotal = useMemo(
        () => cart.reduce((sum, it) => sum + Number(it.price || 0), 0),
        [cart]
    );

    const cartCurrency = cart[0]?.currency || wallet.currency || "COP";
    const itemsWithDetails = useMemo(() => {
        const seen = new Set();
        return cart.filter(item => {
            const details = String(item.productDetails || "").trim();
            const key = item.platformPriceId || `${item.platformName}:${item.durationName}`;
            if (!details || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [cart]);
    const detailsSignature = itemsWithDetails
        .map(item => `${item.platformPriceId}:${item.productDetails}`)
        .join("|");

    useEffect(() => {
        setDetailsAccepted(false);
    }, [detailsSignature, open]);

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
        checkout,
    } = useCartCheckout({
        cart,
        clearCart,
        setWallet,
        onPurchaseSuccess,
    });

    async function onCheckout() {
        if (itemsWithDetails.length && !detailsAccepted) return;
        await checkout({
            recordProfit,
            profitAmount,
        });
    }

    if (!open) return null;

    return (
        <div className="cart-overlay" onClick={onClose}>
            <aside className="cart-drawer kpi" onClick={(e) => e.stopPropagation()}>
                <header className="cart-header">
                    <h3 className="cart-title">Carrito</h3>
                    <button
                        className="btn-ghost"
                        onClick={onClose}
                        style={{ padding: "0 10px", fontSize: 18, minWidth: 36, height: 36 }}
                        title="Cerrar carrito"
                    >
                        x
                    </button>
                </header>

                {error ? <div className="error cart-error">{error}</div> : null}

                {buyResult ? (
                    <CartResult result={buyResult} onClose={onClose} />
                ) : !cart.length ? (
                    <p className="cart-empty">Tu carrito esta vacio.</p>
                ) : (
                    <>
                        <CartItemsList cart={cart} onRemove={removeFromCart} />

                        {itemsWithDetails.length ? (
                            <section className="cart-product-terms">
                                <div className="cart-product-terms__heading">Características importantes de tu compra</div>
                                <div className="cart-product-terms__hint">Estas condiciones forman parte del producto seleccionado.</div>
                                <div className="cart-product-terms__items">
                                    {itemsWithDetails.map(item => (
                                        <div className="cart-product-terms__item" key={item.platformPriceId || item.platformName}>
                                            <strong>{item.platformName} - {item.durationName}</strong>
                                            <ul>
                                                {String(item.productDetails).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => (
                                                    <li key={`${line}-${index}`}>{line}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                                <label className="cart-product-terms__confirm">
                                    <input
                                        type="checkbox"
                                        checked={detailsAccepted}
                                        onChange={event => setDetailsAccepted(event.target.checked)}
                                    />
                                    <span>Confirmo que leí y acepto las características y condiciones de los productos.</span>
                                </label>
                            </section>
                        ) : null}

                        <CartFooter
                            cartTotal={cartTotal}
                            cartCurrency={cartCurrency}
                            buyLoading={buyLoading}
                            onClear={clearCart}
                            onCheckout={onCheckout}
                            checkoutDisabled={itemsWithDetails.length > 0 && !detailsAccepted}
                            wallet={wallet}
                            profitOpen={profitOpen}
                            setProfitOpen={setProfitOpen}
                            recordProfit={recordProfit}
                            setRecordProfit={setRecordProfit}
                            profitAmount={profitAmount}
                            setProfitAmount={setProfitAmount}
                        />

                    </>
                )}
            </aside>
        </div>
    );
}
