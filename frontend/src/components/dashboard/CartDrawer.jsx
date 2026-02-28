import { useMemo, useState } from "react";
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

    async function onCheckout() {
        await checkout({
            includeWhatsapp,
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

                        {buyResult ? (
                            <CartResult whatsappMessage={whatsappMessage} onClose={onClose} />
                        ) : null}
                    </>
                )}
            </aside>
        </div>
    );
}
