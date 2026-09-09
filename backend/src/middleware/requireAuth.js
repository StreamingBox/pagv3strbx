const jwt = require("jsonwebtoken");
const pool = require("../db");

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

        return pool.query(
            "SELECT status, auth_version FROM users WHERE id = ? LIMIT 1",
            [resolvedUserId]
        ).then(([rows]) => {
            const user = rows?.[0];
            const currentAuthVersion = Number(user?.auth_version || 0);
            const tokenAuthVersion = Number(payload?.authVersion || 0);

            if (!user || user.status !== "active" || currentAuthVersion !== tokenAuthVersion) {
                return res.status(401).json({ message: "Sesión inválida o expirada." });
            }

            req.user = {
                sub: resolvedUserId,
                id: resolvedUserId,
                role: payload?.role || "user",
            };

            return next();
        }).catch(() => res.status(401).json({ message: "No se pudo validar la sesión." }));
    } catch {
        return res.status(401).json({ message: "Token inválido o expirado." });
    }
}

module.exports = requireAuth;
