const DEFAULT_BASE_URL = "https://proveedores-jeff.store/v1";
const STRBX_PROVIDER = "strbx";
const JEFF_PREMIUM_PROVIDER = "jeff_premium";
const STORETOOLS_PROVIDER = "storetools";
const LIVEONIX_PROVIDER = "liveonix";

function normalizeSlug(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "");
}

function normalizeCodeProvider(value) {
    const compact = String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    if ([
        "jeff",
        "jeffpremium",
        "jeff_premium",
        "proveedores_jeff",
        "proveedores_jeff_store",
    ].includes(compact)) {
        return JEFF_PREMIUM_PROVIDER;
    }
    if ([
        "storetools",
        "store_tools",
        "storetools_co",
        "storetools_provider",
    ].includes(compact)) {
        return STORETOOLS_PROVIDER;
    }
    if ([
        "liveonix",
        "liveonix_myes_space",
        "liveonix_provider",
    ].includes(compact)) {
        return LIVEONIX_PROVIDER;
    }
    return STRBX_PROVIDER;
}

function parseList(value) {
    return new Set(
        String(value || "")
            .split(",")
            .map(normalizeSlug)
            .filter(Boolean)
    );
}

function normalizeBaseUrl(value) {
    const raw = String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }
    if (parsed.protocol !== "https:") return null;
    return parsed.toString().replace(/\/+$/, "");
}

function getJeffProviderConfigForProvider(provider, env = process.env, metadata = {}) {
    const normalizedProvider = normalizeCodeProvider(provider);
    const requested = normalizedProvider === JEFF_PREMIUM_PROVIDER;
    const baseUrl = normalizeBaseUrl(env.JEFF_PROVIDER_BASE_URL);
    const username = String(env.JEFF_PROVIDER_USERNAME || env.JEFF_PROVIDER_PHONE || "").trim();
    const password = String(env.JEFF_PROVIDER_PASSWORD || "");
    const timeoutMs = Math.min(Math.max(Number(env.JEFF_PROVIDER_TIMEOUT_MS) || 15000, 5000), 30000);
    const maxAgeMinutes = Math.min(Math.max(Number(env.JEFF_PROVIDER_MAX_AGE_MINUTES) || 15, 1), 60);

    return {
        provider: normalizedProvider,
        slug: normalizeSlug(metadata.slug),
        requested,
        enabled: requested && Boolean(baseUrl && username && password),
        baseUrl,
        username,
        password,
        timeoutMs,
        maxAgeMinutes,
        loginPath: String(env.JEFF_PROVIDER_LOGIN_PATH || "/app-login").trim() || "/app-login",
        inboxPath: String(env.JEFF_PROVIDER_INBOX_PATH || "/user-panel/inbox").trim() || "/user-panel/inbox",
        searchPath: String(env.JEFF_PROVIDER_SEARCH_PATH || "").trim(),
        searchField: String(env.JEFF_PROVIDER_SEARCH_FIELD || "email").trim() || "email",
    };
}

function getJeffProviderConfigForSlug(slug, env = process.env) {
    const normalizedSlug = normalizeSlug(slug);
    const configuredSlugs = parseList(env.JEFF_PROVIDER_PLATFORM_SLUGS || env.JEFF_PROVIDER_PLATFORMS);
    const provider = configuredSlugs.has(normalizedSlug)
        ? JEFF_PREMIUM_PROVIDER
        : STRBX_PROVIDER;
    return getJeffProviderConfigForProvider(provider, env, { slug: normalizedSlug });
}

module.exports = {
    DEFAULT_BASE_URL,
    STRBX_PROVIDER,
    JEFF_PREMIUM_PROVIDER,
    STORETOOLS_PROVIDER,
    LIVEONIX_PROVIDER,
    getJeffProviderConfigForSlug,
    getJeffProviderConfigForProvider,
    normalizeCodeProvider,
    normalizeSlug,
};
