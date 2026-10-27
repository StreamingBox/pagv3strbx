import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CatalogGrid from "./CatalogGrid.jsx";

vi.mock("framer-motion", async () => {
    const React = await vi.importActual("react");
    const motionProps = new Set(["initial", "animate", "exit", "transition", "whileHover", "whileTap"]);
    const componentFor = (tag) => React.forwardRef(({ children, ...props }, ref) => {
        const domProps = Object.fromEntries(Object.entries(props).filter(([name]) => !motionProps.has(name)));
        return React.createElement(tag, { ...domProps, ref }, children);
    });

    return {
        AnimatePresence: ({ children }) => children,
        motion: {
            div: componentFor("div"),
            button: componentFor("button"),
            section: componentFor("section"),
        },
    };
});

vi.mock("animejs", () => ({ animate: vi.fn(() => ({ revert: vi.fn() })) }));
vi.mock("../../utils/platform.js", () => ({ getPlatformLogoCandidates: vi.fn(() => []) }));
vi.mock("../text/BalancedText.jsx", async () => {
    const React = await vi.importActual("react");
    return {
        default: ({ as = "div", text, ...props }) => React.createElement(as, props, text),
    };
});
vi.mock("../../config/siteVariant.js", () => ({ isLiteSite: () => false }));

function product(overrides) {
    const platformSlug = overrides.platformSlug || "link-gemini-con-5-tb-de-almacenamiento";
    return {
        platformPriceId: `price-${platformSlug}`,
        platformName: "Link Gemini con 5 TB de almacenamiento",
        platformSlug,
        platformType: "correo",
        platformPromo: true,
        platformPromoColor: "#FFB000",
        platformPromoLastUnits: true,
        platformNewProduct: false,
        categoryName: "Inteligencia Artificial",
        durationName: "Mensual",
        currency: "COP",
        price: 12000,
        stock: 0,
        ...overrides,
    };
}

function renderCatalog(catalog) {
    const onAddToCart = vi.fn();
    const { container } = render(
        <CatalogGrid
            catalog={catalog}
            buyLoading={false}
            onAddToCart={onAddToCart}
            onNotifyMe={vi.fn()}
            cartCountByPlatformPriceId={new Map()}
        />
    );

    return { container, onAddToCart };
}

describe("CatalogGrid Gemini promotion", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-23T17:00:00.000Z"));
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("renders Gemini first, shows three days and preserves its add-to-cart action", () => {
        const gemini = product({});
        const netflix = product({
            platformName: "Netflix",
            platformSlug: "netflix",
            platformType: "perfil",
            platformPromo: false,
            platformPromoLastUnits: false,
            categoryName: "Video",
            stock: 4,
        });
        const { container, onAddToCart } = renderCatalog([netflix, gemini]);
        const cards = [...container.querySelectorAll(".catalog-card")];

        expect(cards.map((card) => card.querySelector(".catalog-card__name").textContent)).toEqual([
            gemini.platformName,
            netflix.platformName,
        ]);
        expect(cards[0].textContent).toContain("Quedan 3 días de promo");
        expect(cards[0].textContent).not.toContain("Últimas unidades de la promo");

        fireEvent.click(cards[0].querySelector(".catalog-card__btn"));
        expect(onAddToCart).toHaveBeenCalledWith(gemini);
    });

    it("shows the final-day message in Bogota and omits the countdown after the deadline", async () => {
        const gemini = product({});
        vi.setSystemTime(new Date("2026-10-26T15:00:00.000Z"));
        const { container } = renderCatalog([gemini]);
        expect(container.textContent).toContain("La promo finaliza hoy");

        vi.setSystemTime(new Date("2026-10-27T05:00:00.000Z"));
        await act(async () => vi.advanceTimersByTimeAsync(60_000));
        expect(container.textContent).not.toContain("La promo finaliza hoy");
        expect(container.textContent).not.toContain("Quedan 3 días de promo");
    });

    it("does not show a promotion countdown for a non-promo Gemini item", () => {
        const gemini = product({ platformPromo: false, platformPromoLastUnits: false });
        const { container } = renderCatalog([gemini]);

        expect(container.textContent).not.toContain("Quedan 3 días de promo");
        expect(container.textContent).not.toContain("La promo finaliza hoy");
    });
});

describe("Spotify plan artwork", () => {
    it("uses distinct duration artwork while preserving the Spotify mark", () => {
        const plans = [
            product({
                platformName: "Spotify 1 Mes",
                platformSlug: "spotify-1-mes",
                platformType: "normal",
                platformPromo: false,
                platformPromoLastUnits: false,
                durationName: "Mensual",
                days: 30,
                stock: 1,
            }),
            product({
                platformName: "Spotify 2 Meses",
                platformSlug: "spotify-2-meses",
                platformType: "normal",
                platformPromo: false,
                platformPromoLastUnits: false,
                durationName: "2 Meses",
                days: 60,
                stock: 1,
            }),
            product({
                platformName: "Spotify 3 Meses",
                platformSlug: "spotify-3-meses",
                platformType: "normal",
                platformPromo: false,
                platformPromoLastUnits: false,
                durationName: "Trimestral",
                days: 90,
                stock: 1,
            }),
        ];
        const { container } = renderCatalog(plans);
        const artworks = [...container.querySelectorAll(".catalog-card__spotify-art")];

        expect(artworks).toHaveLength(3);
        expect(artworks.map((art) => art.querySelector(".catalog-card__spotify-art-bg").getAttribute("src"))).toEqual([
            "/platform-logos/spotify-plan-1m.webp",
            "/platform-logos/spotify-plan-2m.webp",
            "/platform-logos/spotify-plan-3m.webp",
        ]);
        expect(artworks.map((art) => art.querySelector(".catalog-card__spotify-duration").textContent)).toEqual([
            "1 MES",
            "2 MESES",
            "3 MESES",
        ]);
        expect(artworks.every((art) => art.querySelector(".catalog-card__spotify-mark img").getAttribute("src") === "/platform-logos/spotify-3-meses.png")).toBe(true);
    });
});
