import { describe, expect, it } from "vitest";
import { sortAdvertisingFolders } from "./sortAdvertisingFolders.js";

describe("sortAdvertisingFolders", () => {
    it("puts Monday through Sunday first, then sorts the remaining folders alphabetically", () => {
        const folders = ["Variado", "Netflix", "Viernes", "Domingo", "Lunes", "Disney", "Miércoles", "Jueves", "Sábado", "Martes"]
            .map((name) => ({ name }));

        expect(sortAdvertisingFolders(folders).map(({ name }) => name)).toEqual([
            "Lunes",
            "Martes",
            "Miércoles",
            "Jueves",
            "Viernes",
            "Sábado",
            "Domingo",
            "Disney",
            "Netflix",
            "Variado",
        ]);
    });

    it("recognizes weekday names regardless of capitalization or accents", () => {
        const folders = [{ name: "Miercoles" }, { name: "VIERNES" }, { name: "DOMINGO" }, { name: "SÁBADO" }, { name: "Lunes" }];

        expect(sortAdvertisingFolders(folders).map(({ name }) => name)).toEqual([
            "Lunes",
            "Miercoles",
            "VIERNES",
            "SÁBADO",
            "DOMINGO",
        ]);
    });
});
