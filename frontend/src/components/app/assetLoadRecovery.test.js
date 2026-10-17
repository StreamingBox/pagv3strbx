import { describe, expect, it, vi } from "vitest";
import {
    ASSET_RECOVERY_ATTEMPT_KEY,
    claimAutomaticAssetRecovery,
    isAssetLoadError,
    refreshApplicationAssets,
} from "./assetLoadRecovery.js";

describe("asset load recovery", () => {
    it("recognizes lazy chunk failures without treating ordinary errors as stale assets", () => {
        expect(isAssetLoadError(new Error("Failed to fetch dynamically imported module"))).toBe(true);
        expect(isAssetLoadError(new Error("Loading chunk 42 failed"))).toBe(true);
        expect(isAssetLoadError(new Error("The requested module './index.js' does not provide an export named 'default'"))).toBe(true);
        expect(isAssetLoadError(new Error("User data is invalid"))).toBe(false);
    });

    it("allows only one automatic recovery per tab session", () => {
        const storage = window.sessionStorage;
        storage.removeItem(ASSET_RECOVERY_ATTEMPT_KEY);

        expect(claimAutomaticAssetRecovery(storage)).toBe(true);
        expect(claimAutomaticAssetRecovery(storage)).toBe(false);
    });

    it("does not claim recovery when session storage is unavailable", () => {
        const storage = {
            getItem: vi.fn(() => { throw new Error("blocked"); }),
            setItem: vi.fn(),
        };

        expect(claimAutomaticAssetRecovery(storage)).toBeNull();
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("clears only app caches and updates only its root service worker", async () => {
        const cacheStorage = {
            keys: vi.fn().mockResolvedValue(["strbx-pwa-v19-assets", "other-app-cache"]),
            delete: vi.fn().mockResolvedValue(true),
        };
        const rootUpdate = vi.fn().mockResolvedValue(undefined);
        const nestedUpdate = vi.fn().mockResolvedValue(undefined);
        const serviceWorkerContainer = {
            getRegistrations: vi.fn().mockResolvedValue([
                { scope: "https://example.test/", update: rootUpdate },
                { scope: "https://example.test/other/", update: nestedUpdate },
            ]),
        };

        await refreshApplicationAssets({
            cacheStorage,
            serviceWorkerContainer,
            origin: "https://example.test",
        });

        expect(cacheStorage.delete).toHaveBeenCalledTimes(1);
        expect(cacheStorage.delete).toHaveBeenCalledWith("strbx-pwa-v19-assets");
        expect(rootUpdate).toHaveBeenCalledTimes(1);
        expect(nestedUpdate).not.toHaveBeenCalled();
    });

    it("still updates the app worker when cache cleanup fails", async () => {
        const update = vi.fn().mockResolvedValue(undefined);

        await refreshApplicationAssets({
            cacheStorage: { keys: vi.fn().mockRejectedValue(new Error("blocked")) },
            serviceWorkerContainer: {
                getRegistrations: vi.fn().mockResolvedValue([
                    { scope: "https://example.test/", update },
                ]),
            },
            origin: "https://example.test",
        });

        expect(update).toHaveBeenCalledTimes(1);
    });
});
