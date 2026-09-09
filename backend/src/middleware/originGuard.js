const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function createOriginGuard({ allowedOrigins = new Set(), allowLocalDev = false } = {}) {
    return (req, res, next) => {
        if (SAFE_METHODS.has(String(req.method || "").toUpperCase())) return next();

        const origin = String(req.get?.("origin") || "").trim().replace(/\/+$/, "");
        const fetchSite = String(req.get?.("sec-fetch-site") || "").trim().toLowerCase();
        const originAllowed = allowedOrigins.has(origin) || (allowLocalDev && LOCAL_DEV_ORIGIN.test(origin));

        // SameSite cookies cover normal navigation. Origin/Fetch Metadata adds
        // a server-side guard for cross-site forms and future cookie changes.
        if ((origin && !originAllowed) || (!origin && fetchSite === "cross-site")) {
            return res.status(403).json({ ok: false, message: "Origen no permitido." });
        }

        return next();
    };
}

module.exports = { createOriginGuard };
