import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Info, ShoppingCart, Sparkles, X } from "lucide-react";
import { getPlatformLogoCandidates } from "../../utils/platform.js";
import { displayCurrency } from "../../utils/currency.js";
import BalancedText from "../text/BalancedText.jsx";
import { isLiteSite } from "../../config/siteVariant.js";

const MotionDiv = motion.div;
const MotionButton = motion.button;

// Colores de fondo para mezclar con el fondo sólido de las imágenes PNG
const PLATFORM_COLORS = {
    netflix: { bg: "#000000", accent: "#E50914" },
    disney: { bg: "#000000", accent: "#fff" },
    max: { bg: "#000000", accent: "#fff" },
    hbo: { bg: "#000000", accent: "#fff" },
    prime: { bg: "#000000", accent: "#fff" },
    amazon: { bg: "#000000", accent: "#fff" },
    spotify: { bg: "#000000", accent: "#1DB954" },
    youtube: { bg: "#000000", accent: "#FF0000" },
    crunchyroll: { bg: "#000000", accent: "#fff" },
    vix: { bg: "#000000", accent: "#8B5CF6" },
    gpt: { bg: "#000000", accent: "#fff" },
    chatgpt: { bg: "#000000", accent: "#fff" },
    gemini: { bg: "#000000", accent: "#4285F4" },
    adobe: { bg: "#000000", accent: "#FF0000" },
    microsoft: { bg: "#000000", accent: "#fff" },
    office: { bg: "#000000", accent: "#D83B01" },
    paramount: { bg: "#000000", accent: "#fff" },
    apple: { bg: "#000000", accent: "#fff" },
    sportv: { bg: "#000000", accent: "#0da6f2" },
    default: { bg: "#000000", accent: "#0da6f2" },
};

function getPlatformColor(slug, name) {
    const key = String(slug || name || "").toLowerCase().replace(/[^a-z]/g, "");
    for (const [k, v] of Object.entries(PLATFORM_COLORS)) {
        if (key.includes(k)) return v;
    }
    return PLATFORM_COLORS.default;
}

function normalizePromoColor(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return "#22D3EE";
    const hex = match[1];
    return `#${hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex}`.toUpperCase();
}

function hexToRgba(hex, alpha) {
    const clean = normalizePromoColor(hex).replace("#", "");
    const value = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function detailLines(value) {
    return String(value || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
}

function CatalogLogo({ item, className, fallbackClassName, fallbackStyle }) {
    const candidates = useMemo(
        () => getPlatformLogoCandidates(item?.platformSlug, item?.platformName),
        [item?.platformSlug, item?.platformName]
    );
    const candidatesKey = candidates.join("|");

    return (
        <CatalogLogoImage
            key={candidatesKey}
            candidates={candidates}
            platformName={item?.platformName}
            className={className}
            fallbackClassName={fallbackClassName}
            fallbackStyle={fallbackStyle}
        />
    );
}

function CatalogLogoImage({ candidates, platformName, className, fallbackClassName, fallbackStyle }) {
    const [index, setIndex] = useState(0);
    const logoSrc = candidates[index] || null;

    return (
        <>
            {logoSrc ? (
                <img
                    src={logoSrc}
                    alt={platformName || ""}
                    className={className}
                    onError={() => setIndex(current => current + 1)}
                />
            ) : null}
            <div
                className={fallbackClassName}
                style={{ ...fallbackStyle, display: logoSrc ? "none" : "flex" }}
            >
                {platformName}
            </div>
        </>
    );
}

export default function CatalogGrid({ catalog, buyLoading, onAddToCart, onNotifyMe, cartCountByPlatformPriceId }) {
    const liteSite = isLiteSite();
    const [selectedItem, setSelectedItem] = useState(null);
    const selectedDetails = useMemo(() => detailLines(selectedItem?.productDetails), [selectedItem]);
    const selectedIsUnlimited = selectedItem?.platformType === "correo";
    const selectedStock = Number(selectedItem?.stock || 0);
    const selectedInCart = selectedItem
        ? (cartCountByPlatformPriceId?.get(selectedItem.platformPriceId) || 0)
        : 0;
    const selectedUnavailable = Boolean(selectedItem) && !selectedIsUnlimited && selectedInCart >= selectedStock;
    const sorted = [...catalog].sort((a, b) => {
        const sa = Number(a.stock || 0), sb = Number(b.stock || 0);
        const aUnlim = a.platformType === 'correo';
        const bUnlim = b.platformType === 'correo';
        const aHasStock = aUnlim || sa > 0;
        const bHasStock = bUnlim || sb > 0;

        if (aHasStock && !bHasStock) return -1;
        if (!aHasStock && bHasStock) return 1;
        const getPriority = (item) => {
            const cat = String(item.categoryName || "").toLowerCase();
            if (cat.includes("video")) return 1;
            if (cat.includes("ia") || cat.includes("inteligencia")) return 2;
            if (cat.includes("productividad")) return 3;
            return 4;
        };
        const pA = getPriority(a), pB = getPriority(b);
        if (pA !== pB) return pA - pB;
        return String(a.platformName || "").localeCompare(String(b.platformName || ""));
    });

    function handleAdd(item) {
        const details = detailLines(item.productDetails);
        if (details.length) {
            setSelectedItem(item);
            return;
        }
        onAddToCart(item);
    }

    function confirmAdd() {
        if (!selectedItem || selectedUnavailable) return;
        onAddToCart(selectedItem);
        setSelectedItem(null);
    }

    return (
        <>
        <div className="catalog-grid">
            {sorted.map((item, index) => {
                const isUnlimited = item.platformType === 'correo';
                const stock = Number(item.stock || 0);
                const outOfStock = !isUnlimited && stock <= 0;
                const inCartCount = cartCountByPlatformPriceId?.get(item.platformPriceId) || 0;
                const stockReached = !isUnlimited && inCartCount >= stock;
                const color = getPlatformColor(item.platformSlug, item.platformName);
                const isPromo = item.platformPromo === 1 || item.platformPromo === true;
                const isNewProduct = item.platformNewProduct === 1 || item.platformNewProduct === true;
                const promoColor = normalizePromoColor(item.platformPromoColor);
                const promoRing = hexToRgba(promoColor, 0.62);
                const promoGlow = hexToRgba(promoColor, 0.28);
                const promoGlowStrong = hexToRgba(promoColor, 0.44);
                const showPromoLastUnits = isPromo
                    && !outOfStock
                    && (item.platformPromoLastUnits === 1 || item.platformPromoLastUnits === true);
                const promoBadgeText = item.is_renewable === 1 ? "Promoción" : "Promo";

                return (
                    <MotionDiv
                        key={item.platformPriceId}
                        className={`catalog-card${outOfStock ? " catalog-card--out" : ""}${isPromo ? " catalog-card--promo" : ""}${isNewProduct ? " catalog-card--new" : ""}`}
                        style={isPromo ? {
                            "--promo-color": promoColor,
                            "--promo-ring": promoRing,
                            "--promo-glow": promoGlow,
                        } : undefined}
                        initial={{ opacity: 0, y: 16, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                            type: "spring",
                            stiffness: 280,
                            damping: 22,
                            delay: Math.min(index * 0.04, 0.6),
                        }}
                        whileHover={!outOfStock ? {
                            y: -5,
                            boxShadow: isPromo
                                ? `0 18px 48px ${promoGlowStrong}, 0 0 0 1px ${promoRing}, 0 0 26px ${promoGlowStrong}`
                                : isNewProduct
                                    ? "0 18px 48px rgba(163,230,53,.18), 0 0 0 1px rgba(190,242,100,.82), 0 0 26px rgba(163,230,53,.24)"
                                    : "0 18px 48px rgba(13,166,242,.22), 0 0 0 1px rgba(13,166,242,.28)"
                        } : {}}
                    >
                        {/* Solo SIN STOCK va arriba a la derecha. */}
                        {outOfStock && (
                            <div className="catalog-card__badges">
                                <span className="badge badge--out">SIN STOCK</span>
                            </div>
                        )}

                        {/* Banner de logo — rectangular, fondo de la plataforma */}
                        <div
                            className="catalog-card__banner"
                            style={{ background: color.bg }}
                        >
                            <CatalogLogo
                                item={item}
                                className="catalog-card__banner-img"
                                fallbackClassName="catalog-card__banner-fallback"
                                fallbackStyle={{ color: color.accent }}
                            />
                        </div>

                        {/* Nombre, badge RENOVABLE y duración */}
                        <div className="catalog-card__body">
                            <div className="catalog-card__name-row">
                                <BalancedText
                                    as="div"
                                    className="catalog-card__name"
                                    text={item.platformName}
                                    maxLines={4}
                                    minWidthRatio={0.76}
                                />
                                {item.is_renewable === 1 && !outOfStock && (
                                    <span className="badge badge--renovable">Renovable</span>
                                )}
                                {isPromo && (
                                    <span
                                        className="badge badge--promo"
                                        style={{
                                            color: promoColor,
                                            background: hexToRgba(promoColor, 0.14),
                                            border: `1px solid ${promoRing}`,
                                            boxShadow: `0 0 14px ${promoGlow}`,
                                        }}
                                    >
                                        {promoBadgeText}
                                    </span>
                                )}
                            </div>
                            <div className="catalog-card__duration">{item.durationName || "Por defecto"}</div>
                            {isNewProduct ? (
                                <span className="badge badge--new catalog-card__new-product">
                                    <Sparkles size={11} aria-hidden="true" />
                                    Producto nuevo
                                </span>
                            ) : null}
                            {showPromoLastUnits ? (
                                <span className="catalog-card__promo-urgency">
                                    <Flame size={12} aria-hidden="true" />
                                    Últimas unidades de la promo
                                </span>
                            ) : null}

                            {detailLines(item.productDetails).length ? (
                                <button
                                    type="button"
                                    className="catalog-card__details-btn"
                                    onClick={() => setSelectedItem(item)}
                                >
                                    <Info size={14} />
                                    Ver características
                                </button>
                            ) : null}

                            {/* Stock: punto + cantidad numérica */}
                            <div className="catalog-card__stock">
                                <span className={`stock-dot${outOfStock ? " stock-dot--out" : ""}`} />
                                <span className="catalog-card__stock-text">
                                    {isUnlimited
                                        ? (liteSite ? "Disponible" : "Stock: ∞")
                                        : outOfStock
                                            ? "Sin Stock"
                                            : (liteSite ? "Disponible" : `Stock: ${Math.max(stock - inCartCount, 0)}`)
                                    }
                                </span>
                            </div>
                        </div>

                        {/* Footer: precio + botón */}
                        <div className="catalog-card__footer">
                            <div className="catalog-card__price">
                                <span className="catalog-card__price-symbol">$</span>
                                <span className="catalog-card__price-amount">
                                    {Number(item.price || 0).toLocaleString("es-CO")}
                                </span>
                                <span className="catalog-card__price-currency">
                                    {displayCurrency(item.currency, "COP")}
                                </span>
                            </div>

                            {outOfStock ? (
                                <MotionButton
                                    onClick={() => onNotifyMe && onNotifyMe(item)}
                                    className="catalog-card__btn catalog-card__btn--notify"
                                    style={{
                                        background: "linear-gradient(135deg, #f59e0b, #d97706)",
                                        color: "#fff",
                                        fontWeight: "800",
                                        textShadow: "0 1px 2px rgba(0,0,0,0.25)",
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        justifyContent: "center",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px"
                                    }}
                                    whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(245, 158, 11, 0.4)" }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    🔔 Avísame
                                </MotionButton>
                            ) : (
                                <MotionButton
                                    className="catalog-card__btn"
                                    disabled={buyLoading || stockReached}
                                    onClick={() => handleAdd(item)}
                                    whileHover={stockReached ? {} : { scale: 1.08 }}
                                    whileTap={stockReached ? {} : { scale: 0.92 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                    title={stockReached ? "Ya agregaste todo el stock disponible" : "Agregar al carrito"}
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                    </svg>
                                    {stockReached ? "Límite" : "Agregar"}
                                </MotionButton>
                            )}
                        </div>
                    </MotionDiv>
                );
            })}
        </div>
        <AnimatePresence>
            {selectedItem ? (
                <motion.div
                    className="product-detail-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSelectedItem(null)}
                >
                    <motion.section
                        className="product-detail-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="product-detail-title"
                        initial={{ opacity: 0, scale: 0.96, y: 18 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 10 }}
                        onClick={event => event.stopPropagation()}
                    >
                        <header className="product-detail-header">
                            <div>
                                <div className="product-detail-eyebrow">Información antes de comprar</div>
                                <h2 id="product-detail-title">{selectedItem.platformName}</h2>
                                <div className="product-detail-plan">{selectedItem.durationName || "Por defecto"}</div>
                            </div>
                            <button
                                type="button"
                                className="product-detail-close"
                                onClick={() => setSelectedItem(null)}
                                aria-label="Cerrar detalles"
                                title="Cerrar"
                            >
                                <X size={20} />
                            </button>
                        </header>

                        <div className="product-detail-summary">
                            <div className="product-detail-logo">
                                <CatalogLogo item={selectedItem} />
                            </div>
                            <div>
                                <div className="product-detail-price">
                                    ${Number(selectedItem.price || 0).toLocaleString("es-CO")}
                                    <span>{displayCurrency(selectedItem.currency, "COP")}</span>
                                </div>
                                <div className="product-detail-stock-label">
                                    {selectedUnavailable ? "No hay más unidades disponibles" : "Disponible para compra"}
                                </div>
                            </div>
                        </div>

                        <div className="product-detail-content">
                            <h3>Características y condiciones</h3>
                            <ul>
                                {selectedDetails.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
                            </ul>
                        </div>

                        <div className="product-detail-notice">
                            Revisa esta información cuidadosamente. También aparecerá en el carrito antes de finalizar la compra.
                        </div>

                        <div className="product-detail-actions">
                            <button type="button" className="btn-ghost" onClick={() => setSelectedItem(null)}>Volver</button>
                            <button type="button" className="btn" onClick={confirmAdd} disabled={buyLoading || selectedUnavailable}>
                                <ShoppingCart size={17} />
                                {selectedUnavailable ? "Sin disponibilidad" : "Agregar al carrito"}
                            </button>
                        </div>
                    </motion.section>
                </motion.div>
            ) : null}
        </AnimatePresence>
        </>
    );
}
