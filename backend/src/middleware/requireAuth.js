const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
    const cookieToken = req.cookies?.accessToken || null;

    const auth = req.headers.authorization || "";
    const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    // ✅ No se acepta token por query param: queda en logs de Nginx/browser
    const token = cookieToken || headerToken;
    if (!token) return res.status(401).json({ message: "No autorizado." });

    try {
        const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        // ✅ Unificar formato: sub (como JWT)
        req.user = {
            sub: payload.sub,
            role: payload.role,
            // opcional: mantener id por compatibilidad
            id: payload.sub,
        };

        return next();
    } catch {
        return res.status(401).json({ message: "Token inválido o expirado." });
    }
}

module.exports = requireAuth;
