import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api.js", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "./api.js";
import { getAdminSidebarCounts } from "./adminSidebarCounts.js";

describe("getAdminSidebarCounts", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it("deduplicates concurrent requests and caches the result for 60 seconds", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
        const counts = { stock: 1, expirations: 2, topups: 3, support: 4 };
        apiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: counts });

        const first = getAdminSidebarCounts();
        const concurrent = getAdminSidebarCounts();
        expect(concurrent).toBe(first);
        await expect(first).resolves.toMatchObject({ ok: true, data: counts });

        await expect(getAdminSidebarCounts()).resolves.toMatchObject({ ok: true, data: counts });
        expect(apiFetch).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(60_001);
        apiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: counts });
        await getAdminSidebarCounts();
        expect(apiFetch).toHaveBeenCalledTimes(2);
    });
});
