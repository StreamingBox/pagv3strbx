const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
    const cookieToken = req.cookies?.accessToken || null;

    const auth = req.headers.authorization || "";
    const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    const token = cookieToken || headerToken;
    if (!token) return res.status(401).json({ message: "No autorizado." });

    try {
        const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        const resolvedUserId = payload?.sub ?? payload?.id ?? payload?.userId ?? null;

        if (!resolvedUserId) {
            return res.status(401).json({ message: "Token inválido o expirado." });
        }

        req.user = {
            sub: resolvedUserId,
            id: resolvedUserId,
            role: payload?.role || "user",
        };

        return next();
    } catch {
        return res.status(401).json({ message: "Token inválido o expirado." });
    }
}

module.exports = requireAuth;
