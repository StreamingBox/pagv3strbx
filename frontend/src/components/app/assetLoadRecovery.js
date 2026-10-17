export const ASSET_RECOVERY_ATTEMPT_KEY = "strbx-asset-recovery-attempted";
const APP_CACHE_PREFIX = "strbx-pwa-";

export function isAssetLoadError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    const staleModuleExport = message.includes("requested module")
        && message.includes("does not provide an export named");

    return staleModuleExport
        || message.includes("dynamically imported module")
        || message.includes("loading chunk")
        || message.includes("chunkloaderror")
        || message.includes("failed to fetch")
        || message.includes("importing a module script failed");
}

export function claimAutomaticAssetRecovery(storage) {
    if (!storage) return null;

    try {
        if (storage.getItem(ASSET_RECOVERY_ATTEMPT_KEY)) return false;
        storage.setItem(ASSET_RECOVERY_ATTEMPT_KEY, "1");
        return true;
    } catch {
        return null;
    }
}

export async function refreshApplicationAssets({ cacheStorage, serviceWorkerContainer, origin }) {
    if (cacheStorage) {
        try {
            const keys = await cacheStorage.keys();
            await Promise.all(
                keys
                    .filter((key) => key.startsWith(APP_CACHE_PREFIX))
                    .map((key) => cacheStorage.delete(key))
            );
        } catch {
            // A failed cache cleanup must not prevent updating the service worker.
        }
    }

    if (serviceWorkerContainer && origin) {
        try {
            const registrations = await serviceWorkerContainer.getRegistrations();
            const appScope = `${origin}/`;
            await Promise.all(
                registrations
                    .filter((registration) => registration.scope === appScope)
                    .map((registration) => registration.update())
            );
        } catch {
            // The page reload remains useful if a worker update is unavailable.
        }
    }
}

export function reloadCurrentPage() {
    window.location.reload();
}
