import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/dashboard.css";
import "../styles/dashboard-stitch.css";

import Sidebar from "../components/dashboard/Sidebar.jsx";
import CatalogGrid from "../components/dashboard/CatalogGrid.jsx";
import ComboGrid from "../components/dashboard/ComboGrid.jsx";
import CartDrawer from "../components/dashboard/CartDrawer.jsx";
import { useDashboardData } from "../hooks/useDashboardData.js";
import { apiFetch } from "../api/api";
import { useAuth } from "../context/AuthContext.jsx";
import useAppLogout from "../hooks/useAppLogout.js";

const CART_STORAGE_PREFIX = "dashboard_cart_v1";
const GUEST_CART_STORAGE_KEY = `${CART_STORAGE_PREFIX}:guest`;

export default function Dashboard() {
    const navigate = useNavigate();
    const { user, authLoading } = useAuth();
    const logout = useAppLogout();

    const { wallet, setWallet, catalog, combos, loading, error, setError, reload } = useDashboardData();

    const cartStorageKey = `${CART_STORAGE_PREFIX}:${user?.id || user?.email || "guest"}`;

    const [cartOpen, setCartOpen] = useState(false);
    const [cart, setCart] = useState([]);
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [cartHydrated, setCartHydrated] = useState(false);

    useEffect(() => {
        if (authLoading) return;

        try {
            const raw = localStorage.getItem(cartStorageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                setCart(Array.isArray(parsed) ? parsed : []);
                setCartHydrated(true);
                return;
            }

            if (user?.id || user?.email) {
                const guestRaw = localStorage.getItem(GUEST_CART_STORAGE_KEY);
                if (guestRaw) {
                    const guestParsed = JSON.parse(guestRaw);
                    const safeCart = Array.isArray(guestParsed) ? guestParsed : [];
                    setCart(safeCart);
                    if (safeCart.length) {
                        localStorage.setItem(cartStorageKey, JSON.stringify(safeCart));
                    }
                    localStorage.removeItem(GUEST_CART_STORAGE_KEY);
                    setCartHydrated(true);
                    return;
                }
            }

            setCart([]);
        } catch {
            setCart([]);
        } finally {
            setCartHydrated(true);
        }
    }, [authLoading, cartStorageKey, user?.email, user?.id]);

    useEffect(() => {
        if (!cartHydrated) return;

        try {
            if (!cart.length) {
                localStorage.removeItem(cartStorageKey);
                return;
            }
            localStorage.setItem(cartStorageKey, JSON.stringify(cart));
        } catch {
            // Si el storage falla, el carrito sigue funcionando en memoria.
        }
    }, [cart, cartHydrated, cartStorageKey]);

    useEffect(() => {
        if (!catalog?.length || !cartHydrated) return;

        const stockByPlatformPriceId = new Map(
            catalog.map((item) => [
                item.platformPriceId,
                {
                    stock: Number(item.stock || 0),
                    isUnlimited: item.platformType === "correo",
                },
            ])
        );
        const stockByComboId = new Map((combos || []).map((combo) => [combo.id, Number(combo.stock || 0)]));

        setCart((prev) => {
            const counts = new Map();
            const comboCounts = new Map();
            let changed = false;

            const next = prev.filter((item) => {
                if (item.type === "combo") {
                    const stock = stockByComboId.get(item.comboId);
                    if (stock === undefined) {
                        changed = true;
                        return false;
                    }

                    const currentCount = comboCounts.get(item.comboId) || 0;
                    if (currentCount >= stock) {
                        changed = true;
                        return false;
                    }

                    comboCounts.set(item.comboId, currentCount + 1);
                    return true;
                }

                const stockInfo = stockByPlatformPriceId.get(item.platformPriceId);
                if (!stockInfo) {
                    changed = true;
                    return false;
                }

                if (stockInfo.isUnlimited) return true;

                const currentCount = counts.get(item.platformPriceId) || 0;
                if (currentCount >= stockInfo.stock) {
                    changed = true;
                    return false;
                }

                counts.set(item.platformPriceId, currentCount + 1);
                return true;
            });

            return changed ? next : prev;
        });
    }, [catalog, combos, cartHydrated]);

    const cartCountByPlatformPriceId = useMemo(() => {
        const counts = new Map();
        for (const item of cart) {
            if (item.type === "combo") continue;
            counts.set(item.platformPriceId, (counts.get(item.platformPriceId) || 0) + 1);
        }
        return counts;
    }, [cart]);

    const cartCountByComboId = useMemo(() => {
        const counts = new Map();
        for (const item of cart) {
            if (item.type !== "combo") continue;
            counts.set(item.comboId, (counts.get(item.comboId) || 0) + 1);
        }
        return counts;
    }, [cart]);

    function addToCart(item) {
        setError("");
        const isUnlimited = item.platformType === "correo";
        const stock = Number(item.stock || 0);

        setCart((prev) => {
            if (!isUnlimited) {
                const alreadyInCart = prev.filter((x) => x.platformPriceId === item.platformPriceId).length;
                if (alreadyInCart >= stock) {
                    setError(`Solo hay ${stock} disponible${stock === 1 ? "" : "s"} de ${item.platformName}.`);
                    return prev;
                }
            }

            return [
                ...prev,
                {
                    platformPriceId: item.platformPriceId,
                    platformName: item.platformName,
                    durationName: item.durationName,
                    days: item.days,
                    price: item.price,
                    currency: item.currency,
                    platformSlug: item.platformSlug,
                },
            ];
        });
    }

    function addComboToCart(combo) {
        setError("");
        const stock = Number(combo.stock || 0);

        setCart((prev) => {
            const alreadyInCart = prev.filter((x) => x.type === "combo" && x.comboId === combo.id).length;
            if (alreadyInCart >= stock) {
                setError(`Solo hay ${stock} combo${stock === 1 ? "" : "s"} disponible${stock === 1 ? "" : "s"} de ${combo.name}.`);
                return prev;
            }

            return [
                ...prev,
                {
                    type: "combo",
                    comboId: combo.id,
                    comboName: combo.name,
                    platformName: combo.name,
                    durationName: "Combo",
                    days: null,
                    price: combo.price,
                    currency: combo.currency,
                    items: combo.items || [],
                },
            ];
        });
    }

    async function handleNotifyMe(item) {
        if (!item.platformPriceId) return;
        try {
            const r = await apiFetch(`/catalog/${item.platformPriceId}/notify`, { method: "POST" });
            if (r) {
                alert(`¡Listo! Te notificaremos internamente cuando tengamos stock de ${item.platformName}.`);
            }
        } catch (e) {
            alert(e.message || "No se pudo registrar la solicitud.");
        }
    }

    const categories = useMemo(() => {
        const map = new Map();

        for (const item of catalog || []) {
            if (!item.categoryId) continue;

            if (!map.has(item.categoryId)) {
                map.set(item.categoryId, {
                    id: item.categoryId,
                    name: item.categoryName || "Sin nombre",
                    slug: item.categorySlug || "",
                    sortOrder: item.categorySortOrder ?? 9999,
                    totalStock: 0,
                    hasUnlimited: false,
                });
            }

            map.get(item.categoryId).totalStock += (Number(item.stock) || 0);
            if (item.platformType === "correo") {
                map.get(item.categoryId).hasUnlimited = true;
            }
        }

        return Array.from(map.values())
            .filter((c) => c.totalStock > 0 || c.hasUnlimited)
            .sort((a, b) => {
                const diff = (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
                return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name));
            });
    }, [catalog]);

    const activeCategoryFilter = useMemo(() => {
        if (categoryFilter === "all") return "all";
        if (categoryFilter === "combos") return "combos";
        return categories.some((c) => String(c.id) === String(categoryFilter)) ? categoryFilter : "all";
    }, [categories, categoryFilter]);

    const filteredCatalog = useMemo(() => {
        let list = catalog || [];

        if (activeCategoryFilter === "combos") return [];

        if (activeCategoryFilter !== "all") {
            list = list.filter((x) => String(x.categoryId) === String(activeCategoryFilter));
        }

        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter((x) => {
                const haystack = [x.platformName, x.platformSlug, x.durationName, x.categoryName]
                    .map((v) => String(v || "").toLowerCase())
                    .join(" ");

                return haystack.includes(q);
            });
        }

        return list;
    }, [catalog, activeCategoryFilter, search]);

    return (
        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
                <div className="bg-orb orb-1" />
                <div className="bg-orb orb-2" />
                <div className="bg-grid" />
            </div>

            <div className="page-inner">
                <Sidebar
                    user={user}
                    wallet={wallet}
                    cartCount={cart.length}
                    onOpenCart={() => setCartOpen((v) => !v)}
                    onGoOrders={() => navigate("/orders")}
                    onGoRenewals={() => navigate("/renewals")}
                    onGoWallet={() => navigate("/topups")}
                    onGoAnalytics={() => navigate("/analytics")}
                    onGoCodes={() => navigate("/codes")}
                    onGoCodeLogs={() => navigate("/admin/code-logs")}
                    onGoAdmin={() => navigate("/admin")}
                    onGoExpirations={() => navigate("/expirations")}
                    onGoAdvertising={() => navigate("/advertising")}
                    onGoHome={() => navigate("/dashboard")}
                    onLogout={logout}
                />

                <main className="main">
                    <div className="dash-header">
                        <h1 style={{ margin: 0 }}>Plataformas disponibles</h1>
                    </div>

                    <p style={{ marginTop: 6, color: "var(--muted)" }}>
                        Compra contenido premium con tu saldo activo.
                    </p>

                    {loading ? <p style={{ color: "var(--muted)" }}>Cargando...</p> : null}
                    {error ? <div className="error">{error}</div> : null}

                    {!loading ? (
                        <div className="dash-toolbar dash-toolbar--swap">
                            <div className={`dash-search2 ${search ? "has-text" : ""}`} role="search">
                                <button
                                    type="button"
                                    className="dash-search2__btn"
                                    onClick={() => document.getElementById("dashSearchInput")?.focus()}
                                    aria-label="Buscar"
                                    title="Buscar"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                        <path
                                            d="M10.5 18.5C14.9183 18.5 18.5 14.9183 18.5 10.5C18.5 6.08172 14.9183 2.5 10.5 2.5C6.08172 2.5 2.5 6.08172 2.5 10.5C2.5 14.9183 6.08172 18.5 10.5 18.5Z"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        />
                                        <path
                                            d="M16.5 16.5L21.5 21.5"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </button>

                                <input
                                    id="dashSearchInput"
                                    className="dash-search2__input"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar plataforma..."
                                    aria-label="Buscar plataforma"
                                />

                                {search.trim() ? (
                                    <button
                                        type="button"
                                        className="dash-search2__clear"
                                        onClick={() => setSearch("")}
                                        aria-label="Limpiar búsqueda"
                                        title="Limpiar"
                                    >
                                        ✕
                                    </button>
                                ) : null}
                            </div>

                            <div className="dash-tabs dash-tabs--right">
                                    <button
                                        className="btn-ghost"
                                        onClick={() => setCategoryFilter("all")}
                                        style={{
                                            opacity: activeCategoryFilter === "all" ? 1 : 0.7,
                                            border: activeCategoryFilter === "all" ? "1px solid rgba(46,123,255,.4)" : undefined,
                                        }}
                                    >
                                        Todos
                                    </button>

                                    <button
                                        className="btn-ghost"
                                        onClick={() => setCategoryFilter("combos")}
                                        style={{
                                            opacity: activeCategoryFilter === "combos" ? 1 : 0.7,
                                            border: activeCategoryFilter === "combos" ? "1px solid rgba(46,123,255,.4)" : undefined,
                                        }}
                                    >
                                        Combos
                                    </button>

                                    {categories.map((c) => (
                                        <button
                                            key={c.id}
                                            className="btn-ghost"
                                            onClick={() => setCategoryFilter(String(c.id))}
                                            style={{
                                                opacity: String(activeCategoryFilter) === String(c.id) ? 1 : 0.7,
                                                border:
                                                    String(activeCategoryFilter) === String(c.id)
                                                        ? "1px solid rgba(46,123,255,.4)"
                                                        : undefined,
                                            }}
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                            </div>
                        </div>
                    ) : null}

                    {activeCategoryFilter === "all" || activeCategoryFilter === "combos" ? (
                        <ComboGrid
                            combos={combos}
                            onAddCombo={addComboToCart}
                            cartCountByComboId={cartCountByComboId}
                        />
                    ) : null}

                    {activeCategoryFilter === "combos" && !combos.length ? (
                        <div className="kpi" style={{ padding: 18, color: "var(--muted)", borderRadius: 14 }}>
                            No hay combos disponibles para tu moneda o stock actual.
                        </div>
                    ) : null}

                    {activeCategoryFilter !== "combos" ? (
                        <CatalogGrid
                            catalog={filteredCatalog}
                            buyLoading={false}
                            onAddToCart={addToCart}
                            onNotifyMe={handleNotifyMe}
                            cartCountByPlatformPriceId={cartCountByPlatformPriceId}
                        />
                    ) : null}
                </main>
            </div>

            <CartDrawer
                open={cartOpen}
                onClose={() => setCartOpen(false)}
                cart={cart}
                setCart={setCart}
                wallet={wallet}
                setWallet={setWallet}
                onPurchaseSuccess={() => {
                    reload();
                }}
            />
        </div>
    );
}
