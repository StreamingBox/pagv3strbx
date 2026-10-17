const DISNEY_CODE_WINDOW_MINUTES = 10;
const DISNEY_CODE_WINDOW_MS = DISNEY_CODE_WINDOW_MINUTES * 60 * 1000;

function normalizeDisneyText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function isDisneySender(value) {
    return /@(?:[a-z0-9-]+\.)*disneyplus\.com(?=$|[\s>,;])/i.test(String(value || ""));
}

function isDisneyOtpSubject(subject) {
    const normalized = normalizeDisneyText(subject);
    return [
        /^(?:tu\s+)?codigo\s+de\s+acceso\s+unico\s+para\s+disney\+?$/,
        /^din\s+engangskod\s+till\s+disney\+?$/,
        /^your\s+disney\+?\s+one[- ]time\s+(?:pass)?code$/,
        /^your\s+one[- ]time\s+(?:pass)?code\s+for\s+disney\+?$/,
        /^your\s+verification\s+code\s+for\s+disney\+?$/,
    ].some((pattern) => pattern.test(normalized));
}

function isDisneyLoginNotice({ subject, text, html } = {}) {
    if (isDisneyOtpSubject(subject)) return false;

    const normalizedSubject = normalizeDisneyText(subject);
    const normalizedBody = normalizeDisneyText(text || String(html || "").replace(/<[^>]*>/g, " "));
    const loginNoticePattern = /(?:nuevo\s+inicio\s+de\s+sesion|new\s+(?:sign[ -]?in|login)(?:\s+activity)?)/;
    const bodyConfirmationPattern = /(?:identificamos|detectamos)\s+(?:un\s+)?nuevo\s+inicio\s+de\s+sesion\s+en\s+disney|we\s+(?:identified|detected)\s+(?:a\s+)?new\s+(?:sign[ -]?in|login)\s+(?:to|on)\s+disney/;

    return loginNoticePattern.test(normalizedSubject)
        || bodyConfirmationPattern.test(normalizedBody);
}

function extractDisneyOtpCode({ subject, text, html } = {}) {
    if (!isDisneyOtpSubject(subject)) return "";

    const body = String(text || String(html || "").replace(/<[^>]*>/g, " "));
    const codes = [...new Set([...body.matchAll(/(?:^|\D)(\d{6})(?!\d)/g)].map((match) => match[1]))];
    return codes.length === 1 ? codes[0] : "";
}

function checkDisneyPurchaseWindow(purchasedAt, now = Date.now()) {
    if (purchasedAt == null || String(purchasedAt).trim() === "") {
        return { allowed: false, status: "purchase_time_unavailable" };
    }
    const purchaseTimestamp = purchasedAt instanceof Date
        ? purchasedAt.getTime()
        : new Date(purchasedAt).getTime();
    const nowTimestamp = now instanceof Date ? now.getTime() : Number(now);

    if (!Number.isFinite(purchaseTimestamp) || !Number.isFinite(nowTimestamp) || purchaseTimestamp > nowTimestamp) {
        return { allowed: false, status: "purchase_time_unavailable" };
    }
    if (nowTimestamp - purchaseTimestamp > DISNEY_CODE_WINDOW_MS) {
        return { allowed: false, status: "purchase_window_expired" };
    }
    return { allowed: true, status: "within_window" };
}

module.exports = {
    DISNEY_CODE_WINDOW_MINUTES,
    checkDisneyPurchaseWindow,
    extractDisneyOtpCode,
    isDisneyLoginNotice,
    isDisneyOtpSubject,
    isDisneySender,
};
