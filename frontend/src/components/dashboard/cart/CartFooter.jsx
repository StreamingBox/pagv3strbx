import ProfitBox from "./ProfitBox.jsx";
import { displayCurrency } from "../../../utils/currency.js";

export default function CartFooter({
    cartTotal,
    cartCurrency,
    buyLoading,
    onClear,
    onCheckout,
    wallet,
    profitOpen,
    setProfitOpen,
    recordProfit,
    setRecordProfit,
    profitAmount,
    setProfitAmount,
}) {
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

                <ProfitBox
                    wallet={wallet}
                    profitOpen={profitOpen}
                    setProfitOpen={setProfitOpen}
                    recordProfit={recordProfit}
                    setRecordProfit={setRecordProfit}
                    profitAmount={profitAmount}
                    setProfitAmount={setProfitAmount}
                />

                <button className="btn" onClick={onCheckout} disabled={buyLoading}>
                    {buyLoading ? "Procesando..." : "Finalizar compra"}
                </button>
            </div>
        </section>
    );
}
