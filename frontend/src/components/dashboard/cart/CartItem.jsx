import { useState } from "react";
import { getPlatformLogo, getInitials } from "../../../utils/platform.js";
import { displayCurrency } from "../../../utils/currency.js";

export default function CartItem({ item, index, onRemove }) {
    const c = item;
    const isCombo = c.type === "combo";
    const logoSrc = isCombo ? null : getPlatformLogo(c.platformSlug, c.platformName);
    const [logoFailed, setLogoFailed] = useState(!logoSrc);

    return (
        <article key={`${c.platformPriceId || c.comboId}-${index}`} className="cart-item">
            <div className="cart-logoBox">
                {!isCombo && !logoFailed && logoSrc ? (
                    <img
                        className="cart-logoImg"
                        src={logoSrc}
                        alt={c.platformName}
                        onError={() => setLogoFailed(true)}
                    />
                ) : (
                    <span className="cart-logoFallback" title={isCombo ? c.comboName : c.platformName}>
                        {getInitials(isCombo ? c.comboName : c.platformName)}
                    </span>
                )}
            </div>

            <div className="cart-itemMain">
                <div className="cart-itemName">{isCombo ? c.comboName : c.platformName}</div>
                <div className="cart-itemMeta">
                    {isCombo
                        ? `${c.items?.length || 0} plataformas incluidas`
                        : `${c.durationName} (${c.days} dias)`}
                </div>
            </div>

            <div className="cart-itemRight">
                <div className="cart-itemPrice">
                    {Number(c.price).toLocaleString("es-CO")} {displayCurrency(c.currency, "COP")}
                </div>
                <button className="btn-ghost cart-removeBtn" onClick={() => onRemove(index)}>
                    Quitar
                </button>
            </div>
        </article>
    );
}
