export const ASSET_RECOVERY_ATTEMPT_KEY = "strbx-asset-recovery-attempted";
export const STARTUP_RENDER_RECOVERY_ATTEMPT_KEY = "strbx-startup-render-recovery-attempted";
export const STARTUP_RENDER_RECOVERY_WINDOW_MS = 12_000;
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

export function claimAutomaticAssetRecovery(storage, key = ASSET_RECOVERY_ATTEMPT_KEY) {
    if (!storage) return null;

    try {
        if (storage.getItem(key)) return false;
        storage.setItem(key, "1");
        return true;
    } catch {
        return null;
    }
}

export function shouldRecoverStartupRenderError(error, { pathname, elapsedMs, userInteracted }) {
    const route = String(pathname || "");
    if (isAssetLoadError(error) || userInteracted) return false;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > STARTUP_RENDER_RECOVERY_WINDOW_MS) return false;

    return route === "/admin"
        || route.startsWith("/admin/")
        || route === "/codes"
        || route === "/support";
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
