const {
    STORETOOLS_PROVIDER,
    normalizeCodeProvider,
    normalizeSlug,
} = require("./jeffProvider");

const DEFAULT_STORETOOLS_BASE_URL = "https://storetools.co";

function normalizeBaseUrl(value) {
    const raw = String(value || DEFAULT_STORETOOLS_BASE_URL).trim().replace(/\/+$/, "");
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }
    if (parsed.protocol !== "https:") return null;
    return parsed.toString().replace(/\/+$/, "");
}

function getStoretoolsProviderConfigForProvider(provider, env = process.env, metadata = {}) {
    const normalizedProvider = normalizeCodeProvider(provider);
    const requested = normalizedProvider === STORETOOLS_PROVIDER;
    const baseUrl = normalizeBaseUrl(env.STORETOOLS_PROVIDER_BASE_URL);
    const userId = String(
        env.STORETOOLS_PROVIDER_USER_ID || env.STORETOOLS_USER_ID || ""
    ).trim();
    const timeoutMs = Math.min(
        Math.max(Number(env.STORETOOLS_PROVIDER_TIMEOUT_MS) || 15000, 5000),
        30000
    );

    return {
        provider: normalizedProvider,
        slug: normalizeSlug(metadata.slug),
        requested,
        enabled: requested && Boolean(baseUrl && userId),
        baseUrl,
        userId,
        timeoutMs,
        pagePath: "/consultar",
        loginPath: "/funciones/validarID.php",
        queryPath: "/funciones/get_email.php",
        platform: "netflix",
        platformId: "1",
        language: "es",
    };
}

module.exports = {
    DEFAULT_STORETOOLS_BASE_URL,
    getStoretoolsProviderConfigForProvider,
};
