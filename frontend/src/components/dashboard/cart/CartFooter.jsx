import ProfitBox from "./ProfitBox.jsx";
import { displayCurrency } from "../../../utils/currency.js";
import { isLiteSite } from "../../../config/siteVariant.js";

export default function CartFooter({
    cartTotal,
    cartCurrency,
    buyLoading,
    onClear,
    onCheckout,
    checkoutDisabled,
    wallet,
    profitOpen,
    setProfitOpen,
    recordProfit,
    setRecordProfit,
    profitAmount,
    setProfitAmount,
}) {
    const liteSite = isLiteSite();

    return (
        <section className="cart-footer">
            <div className="cart-totalBlock">
                <div className="cart-totalLabel">Total</div>
                <div className="cart-totalValue">
                    {Number(cartTotal).toLocaleString("es-CO")} {displayCurrency(cartCurrency)}
                </div>
            </div>

            <div className="cart-actions">
                <button className="btn-ghost" onClick={onClear} disabled={buyLoading}>
                    Vaciar
                </button>

                {!liteSite ? (
                    <ProfitBox
                        wallet={wallet}
                        profitOpen={profitOpen}
                        setProfitOpen={setProfitOpen}
                        recordProfit={recordProfit}
                        setRecordProfit={setRecordProfit}
                        profitAmount={profitAmount}
                        setProfitAmount={setProfitAmount}
                    />
                ) : null}

                <button
                    className="btn"
                    onClick={onCheckout}
                    disabled={buyLoading || checkoutDisabled}
                    title={checkoutDisabled ? "Confirma que leíste las características del producto" : "Finalizar compra"}
                >
                    {buyLoading ? "Procesando..." : "Finalizar compra"}
                </button>
            </div>
        </section>
    );
}
