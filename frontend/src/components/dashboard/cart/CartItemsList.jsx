import CartItem from "./CartItem.jsx";

export default function CartItemsList({ cart, onRemove }) {
    return (
        <section className="cart-items">
            {cart.map((c, idx) => (
                <CartItem key={`${c.platformPriceId}-${idx}`} item={c} index={idx} onRemove={onRemove} />
            ))}
        </section>
    );
}
