import { describe, expect, it } from "vitest";
import { buildMonthProjectionSeries } from "./analyticsForecast.js";

describe("analytics monthly forecast", () => {
    it("uses the compared month curve when the current month has only one day", () => {
        const july = {
            year: 2026,
            month: 7,
            label: "Jul 2026",
            total: 5000,
            daily: [{ day: 1, revenue: 5000 }],
        };
        const june = {
            year: 2026,
            month: 6,
            label: "Jun 2026",
            total: 4_500_000,
            daily: Array.from({ length: 30 }, (_item, index) => ({
                day: index + 1,
                revenue: 70_000 + (index % 5) * 35_000,
            })),
        };

        const projection = buildMonthProjectionSeries(
            july,
            [june],
            new Date("2026-07-01T15:00:00-05:00")
        );

        expect(projection?.isProjection).toBe(true);
        expect(projection.value).toBeGreaterThan(2_000_000);
        expect(projection.series.find((point) => point.day === 2)?.value).toBeGreaterThan(25_000);
        expect(projection.series.find((point) => point.day === 31)?.value).toBeGreaterThan(25_000);
    });
});
