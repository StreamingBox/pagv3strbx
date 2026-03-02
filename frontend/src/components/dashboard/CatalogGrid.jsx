import { motion } from "framer-motion";
import { getPlatformLogo, getInitials } from "../../utils/platform.js";

// Colores de fondo para el área de logo por plataforma
const PLATFORM_COLORS = {
    netflix: { bg: "#141414", accent: "#E50914" },
    disney: { bg: "#0C233F", accent: "#fff" },
    max: { bg: "#002BE7", accent: "#fff" },
    hbo: { bg: "#2B2B2B", accent: "#fff" },
    prime: { bg: "#00A8E1", accent: "#fff" },
    amazon: { bg: "#232F3E", accent: "#FF9900" },
    spotify: { bg: "#191414", accent: "#1DB954" },
    youtube: { bg: "#212121", accent: "#FF0000" },
    crunchyroll: { bg: "#F47521", accent: "#fff" },
    vix: { bg: "#1A1A2E", accent: "#8B5CF6" },
    gpt: { bg: "#10A37F", accent: "#fff" },
    chatgpt: { bg: "#10A37F", accent: "#fff" },
    gemini: { bg: "#1C2A3A", accent: "#4285F4" },
    adobe: { bg: "#1C1C1C", accent: "#FF0000" },
    microsoft: { bg: "#0078D4", accent: "#fff" },
    office: { bg: "#D83B01", accent: "#fff" },
    paramount: { bg: "#0064FF", accent: "#fff" },
    default: { bg: "#0A1628", accent: "#0da6f2" },
};

function getPlatformColor(slug, name) {
    const key = String(slug || name || "").toLowerCase().replace(/[^a-z]/g, "");
    for (const [k, v] of Object.entries(PLATFORM_COLORS)) {
        if (key.includes(k)) return v;
    }
    return PLATFORM_COLORS.default;
}

export default function CatalogGrid({ catalog, buyLoading, onAddToCart }) {
    const sorted = [...catalog].sort((a, b) => {
        const sa = Number(a.stock || 0), sb = Number(b.stock || 0);
        if (sa > 0 && sb <= 0) return -1;
        if (sa <= 0 && sb > 0) return 1;
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

    return (
        <div className="catalog-grid">
            {sorted.map((item, index) => {
                if (index === 0) console.log("Catalog Item Sample:", item);
                const stock = Number(item.stock || 0);
                const outOfStock = stock <= 0;
                const logoSrc = getPlatformLogo(item.platformSlug, item.platformName);
                const color = getPlatformColor(item.platformSlug, item.platformName);

                return (
                    <motion.div
                        key={item.platformPriceId}
                        className={`catalog-card${outOfStock ? " catalog-card--out" : ""}`}
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
                            boxShadow: "0 18px 48px rgba(13,166,242,.22), 0 0 0 1px rgba(13,166,242,.28)"
                        } : {}}
                    >
                        {/* Solo SIN STOCK va arriba a la derecha */}
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
                            <img
                                src={logoSrc}
                                alt={item.platformName}
                                className="catalog-card__banner-img"
                                onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    e.currentTarget.nextSibling.style.display = "flex";
                                }}
                            />
                            {/* Fallback: nombre completo si no hay logo */}
                            <div
                                className="catalog-card__banner-fallback"
                                style={{ display: "none", color: color.accent }}
                            >
                                {item.platformName}
                            </div>
                        </div>

                        {/* Nombre, badge RENOVABLE y duración */}
                        <div className="catalog-card__body">
                            <div className="catalog-card__name-row">
                                <div className="catalog-card__name">{item.platformName}</div>
                                {item.is_renewable === 1 && !outOfStock && (
                                    <span className="badge badge--renovable">Renovable</span>
                                )}
                            </div>
                            <div className="catalog-card__duration">{item.durationName || "Por defecto"}</div>

                            {/* Stock: punto + cantidad numérica */}
                            <div className="catalog-card__stock">
                                <span className={`stock-dot${outOfStock ? " stock-dot--out" : ""}`} />
                                <span className="catalog-card__stock-text">
                                    {outOfStock
                                        ? "Sin Stock"
                                        : `Stock: ${stock}`
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
                                    {item.currency || "COP"}
                                </span>
                            </div>

                            <motion.button
                                className="catalog-card__btn"
                                disabled={buyLoading || outOfStock}
                                onClick={() => onAddToCart(item)}
                                whileHover={!outOfStock ? { scale: 1.08 } : {}}
                                whileTap={!outOfStock ? { scale: 0.92 } : {}}
                                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                </svg>
                                {outOfStock ? "Agotado" : "Agregar"}
                            </motion.button>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
