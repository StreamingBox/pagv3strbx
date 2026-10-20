import { describe, expect, it } from "vitest";
import { splitProfileHistory } from "./profileHistory.js";

describe("splitProfileHistory", () => {
    it("keeps the most recently updated account for each profile identity", () => {
        const result = splitProfileHistory([
            { id: 19, identity_id: 1, profile_number: 1, updated_at: "2026-02-01T00:00:00Z" },
            { id: 12, identity_id: 2, profile_number: 2, updated_at: "2026-02-03T00:00:00Z" },
            { id: 11, identity_id: 1, profile_number: 1, updated_at: "2026-02-05T00:00:00Z" },
        ]);

        expect(result.latest.map((profile) => profile.id)).toEqual([11, 12]);
        expect(result.history.map((profile) => profile.id)).toEqual([19]);
    });

    it("groups legacy rows by profile number and leaves unnumbered rows independent", () => {
        const result = splitProfileHistory([
            { id: 3, profile_number: "1" },
            { id: 8, profile_number: 1 },
            { id: 9, profile_number: null },
            { id: 10, profile_number: null },
        ]);

        expect(result.latest.map((profile) => profile.id)).toEqual([8, 9, 10]);
        expect(result.history.map((profile) => profile.id)).toEqual([3]);
    });
});
