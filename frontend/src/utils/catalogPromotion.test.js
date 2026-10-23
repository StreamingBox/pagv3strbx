import { describe, expect, it } from "vitest";
import { getGeminiPromoDaysRemaining, isGemini5Tb, sortCatalogItems } from "./catalogPromotion.js";

describe("catalog promotion ordering", () => {
    it("identifies the Gemini 5 TB catalog entry", () => {
        expect(isGemini5Tb({ platformName: "Link Gemini con 5 TB de almacenamiento" })).toBe(true);
        expect(isGemini5Tb({ platformName: "Gemini Advanced" })).toBe(false);
    });

    it("places Gemini 5 TB first without changing stock ordering for other products", () => {
        const ordered = sortCatalogItems([
            { platformName: "Netflix", platformType: "perfil", stock: 10, categoryName: "Video" },
            { platformName: "Gemini", platformSlug: "link-gemini-con-5-tb-de-almacenamiento", platformType: "correo", stock: 0, categoryName: "IA" },
            { platformName: "Prime Video", platformType: "correo", stock: 0, categoryName: "Video" },
            { platformName: "Spotify", platformType: "perfil", stock: 0, categoryName: "Música" },
        ]);

        expect(ordered.map(({ platformName }) => platformName)).toEqual([
            "Gemini",
            "Netflix",
            "Prime Video",
            "Spotify",
        ]);
    });
});

describe("Gemini promotion countdown", () => {
    it("counts remaining calendar days in Bogota, including the final day", () => {
        expect(getGeminiPromoDaysRemaining(new Date("2026-10-23T17:00:00.000Z"))).toBe(3);
        expect(getGeminiPromoDaysRemaining(new Date("2026-10-26T15:00:00.000Z"))).toBe(0);
        expect(getGeminiPromoDaysRemaining(new Date("2026-10-27T05:00:00.000Z"))).toBeNull();
    });
});
