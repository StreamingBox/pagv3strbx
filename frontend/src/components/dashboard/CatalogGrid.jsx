import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Flame, Info, ShoppingCart, Sparkles, TrendingDown, X } from "lucide-react";
import { animate } from "animejs";
import { getPlatformLogoCandidates } from "../../utils/platform.js";
import { displayCurrency } from "../../utils/currency.js";
import BalancedText from "../text/BalancedText.jsx";
import { isLiteSite } from "../../config/siteVariant.js";
import { getGeminiPromoDaysRemaining, isGemini5Tb, sortCatalogItems } from "../../utils/catalogPromotion.js";

const MotionDiv = motion.div;
const MotionButton = motion.button;

const SPOTIFY_PLAN_ARTWORK = Object.freeze({
    30: {
        src: "/platform-logos/spotify-plan-1m.webp",
        label: "1 MES",
        accent: "#A3E635",
        variant: "one-month",
    },
    60: {
        src: "/platform-logos/spotify-plan-2m.webp",
        label: "2 MESES",
        accent: "#22D3EE",
        variant: "two-months",
    },
    90: {
        src: "/platform-logos/spotify-plan-3m.webp",
        label: "3 MESES",
        accent: "#34D399",
        variant: "three-months",
    },
});

function getSpotifyPlanArtwork(item) {
    const platform = `${item?.platformSlug || ""} ${item?.platformName || ""}`.toLowerCase();
    if (!platform.includes("spotify")) return null;
    return SPOTIFY_PLAN_ARTWORK[Number(item?.days)] || null;
}

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

function isEventLink(item) {
    const value = item?.platformEventLink ?? item?.platform_event_link ?? item?.is_event_link;
    return value === true || value === 1 || String(value || "").trim() === "1";
}

function eventEndLabel(value) {
    if (!value) return "";
    const raw = String(value);
    const date = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function PriceDropBadge({ previousPrice, currency, percent }) {
    const badgeRef = useRef(null);

    useEffect(() => {
        const node = badgeRef.current;
        if (!node || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

        node.style.opacity = "0";
        const entrance = animate(node, {
            opacity: [0, 1],
            scale: [0.92, 1],
            translateY: [-8, 0],
            duration: 650,
            ease: "out(4)",
        });
        const pulse = animate(node, {
            scale: [1, 1.025],
            translateY: [0, -2],
            duration: 1400,
            ease: "inOut(2)",
            delay: 900,
            loop: true,
            alternate: true,
            loopDelay: 500,
        });

        return () => {
            entrance.revert();
            pulse.revert();
        };
    }, []);

    return (
        <div ref={badgeRef} className="catalog-card__price-drop" aria-label={`Precio rebajado ${percent} por ciento`}>
            <div className="catalog-card__price-drop-title">
                <TrendingDown size={13} aria-hidden="true" />
                <span>¡BAJAMOS EL PRECIO!</span>
                <strong>-{percent}%</strong>
            </div>
            <div className="catalog-card__price-drop-before">
                Antes: <s>${previousPrice.toLocaleString("es-CO")} {displayCurrency(currency, "COP")}</s>
            </div>
        </div>
    );
}

function CatalogLogo({ item, className, fallbackClassName, fallbackStyle }) {
    const candidates = useMemo(
        () => getPlatformLogoCandidates(item?.platformSlug, item?.platformName),
        [item?.platformSlug, item?.platformName]
    );
    const candidatesKey = candidates.join("|");
    const spotifyArtwork = getSpotifyPlanArtwork(item);

    return (
        <CatalogLogoImage
            key={candidatesKey}
            candidates={candidates}
            spotifyArtwork={spotifyArtwork}
            platformName={item?.platformName}
            className={className}
            fallbackClassName={fallbackClassName}
            fallbackStyle={fallbackStyle}
        />
    );
}

function CatalogLogoImage({ candidates, spotifyArtwork, platformName, className, fallbackClassName, fallbackStyle }) {
    const [index, setIndex] = useState(0);
    const logoSrc = candidates[index] || null;

    if (spotifyArtwork) {
        return (
            <div
                className={`catalog-card__spotify-art catalog-card__spotify-art--${spotifyArtwork.variant}`}
                style={{ "--spotify-art-accent": spotifyArtwork.accent }}
                aria-hidden="true"
            >
                <img
                    src={spotifyArtwork.src}
                    alt=""
                    className="catalog-card__spotify-art-bg"
                    loading="lazy"
                    decoding="async"
                />
                <span className="catalog-card__spotify-mark">
                    <img src="/platform-logos/spotify-3-meses.png" alt="" decoding="async" />
                </span>
                <span className="catalog-card__spotify-duration">{spotifyArtwork.label}</span>
            </div>
        );
    }

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
    const [promoClock, setPromoClock] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setPromoClock(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const selectedDetails = useMemo(() => detailLines(selectedItem?.productDetails), [selectedItem]);
    const selectedIsUnlimited = selectedItem?.platformType === "correo";
    const selectedStock = Number(selectedItem?.stock || 0);
    const selectedInCart = selectedItem
        ? (cartCountByPlatformPriceId?.get(selectedItem.platformPriceId) || 0)
        : 0;
    const selectedUnavailable = Boolean(selectedItem) && !selectedIsUnlimited && selectedInCart >= selectedStock;
    const sorted = useMemo(() => sortCatalogItems(catalog), [catalog]);

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
                const currentPrice = Number(item.price || 0);
                const previousPrice = Number(item.previousPrice ?? item.previous_price ?? 0);
                const priceWasReduced = previousPrice > currentPrice && currentPrice >= 0;
                const priceDropPercent = priceWasReduced
                    ? Math.max(1, Math.round(((previousPrice - currentPrice) / previousPrice) * 100))
                    : 0;
                const isGeminiPromo = isPromo && isGemini5Tb(item);
                const promoDaysRemaining = isGeminiPromo && !outOfStock
                    ? getGeminiPromoDaysRemaining(promoClock)
                    : null;
                const showPromoLastUnits = isPromo
                    && !outOfStock
                    && !isGemini5Tb(item)
                    && (item.platformPromoLastUnits === 1 || item.platformPromoLastUnits === true);
                const promoBadgeText = item.is_renewable === 1 ? "Promoción" : "Promo";
                const eventProduct = isEventLink(item);
                const eventEndsAt = eventEndLabel(item.eventEndsAt);

                return (
                    <MotionDiv
                        key={item.platformPriceId}
                        className={`catalog-card${outOfStock ? " catalog-card--out" : ""}${isPromo ? " catalog-card--promo" : ""}${isNewProduct ? " catalog-card--new" : ""}${priceWasReduced ? " catalog-card--price-drop" : ""}`}
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
                            {priceWasReduced ? (
                                <PriceDropBadge
                                    previousPrice={previousPrice}
                                    currency={item.currency}
                                    percent={priceDropPercent}
                                />
                            ) : null}
                            {eventProduct && !outOfStock ? (
                                <span className="badge badge--promo" style={{ color: "#e5e7eb", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.28)" }}>
                                    Partido en vivo{eventEndsAt ? ` hasta ${eventEndsAt}` : ""}
                                </span>
                            ) : null}
                            {isNewProduct ? (
                                <span className="badge badge--new catalog-card__new-product">
                                    <Sparkles size={11} aria-hidden="true" />
                                    Producto nuevo
                                </span>
                            ) : null}
                            {promoDaysRemaining !== null ? (
                                <span className="catalog-card__promo-urgency">
                                    <Clock3 size={12} aria-hidden="true" />
                                    {promoDaysRemaining === 0
                                        ? "La promo finaliza hoy"
                                        : `Quedan ${promoDaysRemaining} ${promoDaysRemaining === 1 ? "día" : "días"} de promo`}
                                </span>
                            ) : showPromoLastUnits ? (
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
                                            : eventProduct
                                                ? "Enlace disponible"
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
                                    {currentPrice.toLocaleString("es-CO")}
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
