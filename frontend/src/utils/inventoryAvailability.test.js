import { describe, expect, it } from "vitest";
import { filterAvailabilityRows, availabilitySheets, availabilityTotals } from "./inventoryAvailability.js";

const row = (id, extra = {}) => ({
    accountActive: true, providerId: id, providerName: `Proveedor ${id}`, platformId: 18, platformName: "Netflix Internacional",
    accountEmail: `account${id}@example.com`, providerAccountId: id, accountIds: [id], expectedProfiles: 2,
    freeProfiles: [2], occupiedProfiles: [1], reviewProfiles: [], availability: "with_free", classification: "complete",
    profiles: [
        { number: 1, state: "occupied", accountIds: [id], buyerEmails: ["customer@example.com"] },
        { number: 2, state: "free", accountIds: [id + 10], buyerEmails: [] },
    ], ...extra,
});

describe("profile availability exports and filters", () => {
    it("combines provider, platform, search and vacancy filters and always excludes inactive accounts", () => {
        const rows = [row(1), row(2), row(1, { accountActive: false }), row(1, { platformId: 6 })];
        expect(filterAvailabilityRows(rows, { providerFilter: "1", platformFilter: "18", search: "ACCOUNT1", availability: "with_free" })).toHaveLength(1);
    });
    it("exports every filtered account beyond the page size and no inactive rows or replacement history", () => {
        const rows = Array.from({ length: 25 }, (_, index) => row(index + 1));
        const sheets = availabilitySheets([...rows, row(99, { accountActive: false })]);
        expect(sheets.Cuentas).toHaveLength(25);
        expect(sheets.Perfiles).toHaveLength(50);
        expect(sheets.Cuentas[0]["Perfiles libres"]).toBe("2");
        expect(sheets.Perfiles[1].Estado).toBe("Libre");
        expect(Object.keys(sheets)).toEqual(["Cuentas", "Perfiles"]);
        expect(JSON.stringify(sheets)).not.toContain("account99");
    });
    it("keeps totals scoped to the chosen provider", () => {
        const filtered = filterAvailabilityRows([row(1), row(2), row(3, { accountActive: false })], { providerFilter: "2" });
        expect(availabilityTotals(filtered)).toEqual({ accounts: 1, withFree: 1, full: 0, review: 0, free: 1, occupied: 1 });
    });
    it("exports duplicate profiles with the account IDs, buyers, and review reason", () => {
        const duplicateRow = row(44, {
            availability: "full",
            classification: "exception",
            freeProfiles: [],
            occupiedProfiles: [1, 2],
            duplicateProfiles: [2],
            reviewProfiles: [],
            reviewReasons: ["perfiles duplicados"],
            profiles: [
                { number: 1, state: "occupied", accountIds: [44], buyerEmails: ["first@example.com"] },
                { number: 2, state: "occupied", accountIds: [145, 246], buyerEmails: ["first@example.com", "second@example.com"] },
            ],
        });
        const sheets = availabilitySheets([duplicateRow]);

        expect(sheets.Cuentas[0]["Perfiles duplicados"]).toBe("2");
        expect(sheets.Cuentas[0]["Motivo de revisión"]).toBe("perfiles duplicados");
        expect(sheets.Perfiles[1].Estado).toBe("Duplicado");
        expect(sheets.Perfiles[1]["Detalle de revisión"]).toContain("#145, #246");
        expect(sheets.Perfiles[1]["Detalle de revisión"]).toContain("second@example.com");
    });
});
