const {
    LIVEONIX_PROVIDER,
    normalizeCodeProvider,
    normalizeSlug,
} = require("./jeffProvider");

const DEFAULT_LIVEONIX_BASE_URL = "https://liveonix.myes.space";

function normalizeBaseUrl(value) {
    const raw = String(value || DEFAULT_LIVEONIX_BASE_URL).trim().replace(/\/+$/, "");
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }
    if (parsed.protocol !== "https:") return null;
    return parsed.toString().replace(/\/+$/, "");
}

function getLiveonixProviderConfigForProvider(provider, env = process.env, metadata = {}) {
    const normalizedProvider = normalizeCodeProvider(provider);
    const requested = normalizedProvider === LIVEONIX_PROVIDER;
    const baseUrl = normalizeBaseUrl(env.LIVEONIX_PROVIDER_BASE_URL);
    const username = String(env.LIVEONIX_PROVIDER_USERNAME || "").trim();
    const password = String(env.LIVEONIX_PROVIDER_PASSWORD || "");
    const timeoutMs = Math.min(
        Math.max(Number(env.LIVEONIX_PROVIDER_TIMEOUT_MS) || 15000, 5000),
        30000
    );
    const maxMessages = Math.min(
        Math.max(Number(env.LIVEONIX_PROVIDER_MAX_MESSAGES) || 12, 1),
        30
    );

    return {
        provider: normalizedProvider,
        slug: normalizeSlug(metadata.slug),
        requested,
        enabled: requested && Boolean(baseUrl && username && password),
        baseUrl,
        username,
        password,
        timeoutMs,
        maxMessages,
        loginPath: "/login",
        inboxPath: "/",
    };
}

module.exports = {
    DEFAULT_LIVEONIX_BASE_URL,
    getLiveonixProviderConfigForProvider,
};
