import { useState } from "react";
import { getPlatformLogo, getInitials } from "../../../utils/platform.js";

export default function CartItem({ item, index, onRemove }) {
    const c = item;
    const logoSrc = getPlatformLogo(c.platformSlug, c.platformName);
    const [logoFailed, setLogoFailed] = useState(!logoSrc);

    return (
        <article key={`${c.platformPriceId}-${index}`} className="cart-item">
            <div className="cart-logoBox">
                {!logoFailed && logoSrc ? (
                    <img
                        className="cart-logoImg"
                        src={logoSrc}
                        alt={c.platformName}
                        onError={() => setLogoFailed(true)}
                    />
                ) : (
                    <span className="cart-logoFallback" title={c.platformName}>
                        {getInitials(c.platformName)}
                    </span>
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
                    {Number(c.price).toLocaleString("es-CO")} {c.currency}
                </div>
                <button className="btn-ghost cart-removeBtn" onClick={() => onRemove(index)}>
                    Quitar
                </button>
            </div>
        </article>
    );
}
