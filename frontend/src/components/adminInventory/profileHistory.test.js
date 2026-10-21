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

    it("prefers the account with an active subscription over a newer replaced row", () => {
        const result = splitProfileHistory([
            { id: 19, profile_number: 4, active_subscriptions: 1, updated_at: "2026-10-09T00:00:00Z" },
            { id: 27, profile_number: 4, active_subscriptions: 0, state: "replaced", updated_at: "2026-10-13T00:00:00Z" },
        ]);

        expect(result.latest.map((profile) => profile.id)).toEqual([19]);
        expect(result.history.map((profile) => profile.id)).toEqual([27]);
    });

    it("uses recency to choose between rows with the same subscription activity", () => {
        const result = splitProfileHistory([
            { id: 19, profile_number: 4, active_subscriptions: 1, updated_at: "2026-10-09T00:00:00Z" },
            { id: 27, profile_number: 4, active_subscriptions: 1, updated_at: "2026-10-13T00:00:00Z" },
        ]);

        expect(result.latest.map((profile) => profile.id)).toEqual([27]);
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

    it("does not duplicate a screen when its older rows lack an identity", () => {
        const result = splitProfileHistory([
            { id: 1, identity_id: null, profile_number: " 1 " },
            { id: 2, identity_id: 10, profile_number: 1 },
            { id: 3, identity_id: 20, profile_number: 2 },
        ]);

        expect(result.latest.map((profile) => profile.id)).toEqual([2, 3]);
        expect(result.history.map((profile) => profile.id)).toEqual([1]);
    });

    it("reduces a long history to the seven latest screens without discarding records", () => {
        const profiles = Array.from({ length: 38 }, (_, index) => ({
            id: index + 1,
            profile_number: (index % 7) + 1,
            identity_id: index < 7 ? null : (index % 7) + 100,
        }));
        const result = splitProfileHistory(profiles);

        expect(result.latest.map((profile) => profile.id)).toEqual([36, 37, 38, 32, 33, 34, 35]);
        expect(result.history).toHaveLength(31);
        expect(result.latest.length + result.history.length).toBe(profiles.length);
    });
});
