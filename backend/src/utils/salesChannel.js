const LITE_CHANNEL = "lite";
const RESELLER_CHANNEL = "reseller";

function normalizeHost(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        .split(":")[0];
}

function configuredLiteHosts() {
    return String(process.env.LITE_HOSTS || process.env.CLIENT_LITE_HOSTS || "")
        .split(",")
        .map(normalizeHost)
        .filter(Boolean);
}

function hostLooksLite(host) {
    const normalized = normalizeHost(host);
    if (!normalized) return false;

    const configured = configuredLiteHosts();
    if (configured.includes(normalized)) return true;

    return (
        normalized.startsWith("lite.") ||
        normalized.startsWith("cliente.") ||
        normalized.startsWith("clientes.")
    );
}

function requestHost(req) {
    return (
        req?.headers?.["x-forwarded-host"] ||
        req?.headers?.host ||
        req?.get?.("host") ||
        ""
    );
}

function getSalesChannel(req) {
    return hostLooksLite(requestHost(req)) ? LITE_CHANNEL : RESELLER_CHANNEL;
}

function isLiteChannel(channel) {
    return String(channel || "").toLowerCase() === LITE_CHANNEL;
}

function isLiteRequest(req) {
    return isLiteChannel(getSalesChannel(req));
}

module.exports = {
    LITE_CHANNEL,
    RESELLER_CHANNEL,
    getSalesChannel,
    isLiteChannel,
    isLiteRequest,
    hostLooksLite,
    normalizeHost,
};
