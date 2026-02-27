function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ message: "No autorizado." });
        if (req.user.role !== role) return res.status(403).json({ message: "Prohibido." });
        return next();
    };
}

module.exports = requireRole;
