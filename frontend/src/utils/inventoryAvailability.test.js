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
});
