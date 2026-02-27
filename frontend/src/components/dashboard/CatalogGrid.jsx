import { getPlatformLogo, getInitials } from "../../utils/platform.js";

export default function CatalogGrid({ catalog, buyLoading, onAddToCart }) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
                marginTop: 14,
            }}
        >
            {[...catalog]
                .sort((a, b) => {
                    const sa = Number(a.stock || 0);
                    const sb = Number(b.stock || 0);

                    // 1. En stock primero
                    if (sa > 0 && sb <= 0) return -1;
                    if (sa <= 0 && sb > 0) return 1;

                    // 2. Prioridad de categoría (Video > IA > Productividad > Otros)
                    const getPriority = (item) => {
                        const cat = String(item.categoryName || "").toLowerCase();
                        if (cat.includes("video")) return 1;
                        if (cat.includes("ia") || cat.includes("inteligencia")) return 2;
                        if (cat.includes("productividad") || cat.includes("product")) return 3;
                        return 4;
                    };

                    const pA = getPriority(a);
                    const pB = getPriority(b);

                    if (pA !== pB) return pA - pB;

                    // 3. Alfabético por defecto
                    return String(a.platformName || "").localeCompare(String(b.platformName || ""));
                })
                .map((item) => {
                    const stock = Number(item.stock || 0);
                    const outOfStock = stock <= 0;
                    const logoSrc = getPlatformLogo(item.platformSlug);

                    return (
                        <div key={item.platformPriceId} className="glass-card animate-slide-up">
                            {/* Imagen Superior Grande */}
                            <div className="product-image-container">
                                {logoSrc ? (
                                    <img
                                        src={logoSrc}
                                        alt={item.platformName}
                                        style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }}
                                        onError={(e) => (e.currentTarget.src = "https://placehold.co/400x250/000/fff?text=" + item.platformName)}
                                    />
                                ) : (
                                    <div style={{ fontSize: 32, fontWeight: 950, color: '#333' }}>{getInitials(item.platformName)}</div>
                                )}
                            </div>

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                {/* Nombre en negrita */}
                                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)', lineHeight: 1.3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                                    {item.platformName}
                                </div>

                                {/* Subtítulo (duración) */}
                                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                                    {item.durationName}
                                </div>

                                {/* Tags: Stock y Renovable juntos */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                    <span className="tag-stock">
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: outOfStock ? '#ff4444' : '#10b981', display: 'inline-block' }} />
                                        Stock: {stock}
                                    </span>

                                    {item.is_renewable ? (
                                        <span className="tag-renewable">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
                                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                                            </svg>
                                            RENOVABLE
                                        </span>
                                    ) : null}
                                </div>

                                {/* Fila de Precio y Botón (Empujada al fondo) */}
                                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--stroke)', paddingTop: 16 }}>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ fontSize: '1.05rem', opacity: 0.9 }}>$</span>
                                        {Number(item.price).toLocaleString('de-DE')}
                                    </div>

                                    <button
                                        className="btn-buy"
                                        disabled={buyLoading || outOfStock}
                                        onClick={() => onAddToCart(item)}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />
                                        </svg>
                                        Comprar
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
        </div>
    );
}
