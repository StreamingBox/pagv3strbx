import { getPlatformLogo, getInitials } from "../../../utils/platform.js";

export default function CartItem({ item, index, onRemove }) {
    const c = item;

    return (
        <article key={`${c.platformPriceId}-${index}`} className="cart-item">
            <div className="cart-logoBox">
                {c.platformSlug ? (
                    <img
                        className="cart-logoImg"
                        src={getPlatformLogo(c.platformSlug)}
                        alt={c.platformName}
                        onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                ) : (
                    <span className="cart-logoFallback">{getInitials(c.platformName)}</span>
                )}
            </div>

            <div className="cart-itemMain">
                <div className="cart-itemName">{c.platformName}</div>
                <div className="cart-itemMeta">
                    {c.durationName} ({c.days} días)
                </div>
            </div>

            <div className="cart-itemRight">
                <div className="cart-itemPrice">
                    {Number(c.price).toLocaleString()} {c.currency}
                </div>
                <button className="btn-ghost cart-removeBtn" onClick={() => onRemove(index)}>
                    Quitar
                </button>
            </div>
        </article>
    );
}
