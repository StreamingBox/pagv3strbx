const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const { signAccessToken, signRefreshToken, sha256 } = require("../auth/tokens");
const jwt = require("jsonwebtoken");
const requireAuth = require("../middleware/requireAuth");
const router = express.Router();

/**
 * Si tu API pública está detrás de /api (Nginx: /api -> backend),
 * entonces PUBLIC_API_PREFIX debe ser "/api" en producción.
 * En local normalmente debe ser "" (vacío).
 *
 * Producción (.env): PUBLIC_API_PREFIX=/api
 * Local: PUBLIC_API_PREFIX=
 */
const PUBLIC_API_PREFIX = (process.env.PUBLIC_API_PREFIX || "").trim();
const REFRESH_COOKIE_PATH = `${PUBLIC_API_PREFIX}/auth`.replace(/\/+/g, "/");

function cookieOpts(req, maxAgeMs, path = "/") {
    const isProd = process.env.NODE_ENV === "production";

    return {
        httpOnly: true,
        secure: isProd,   // 🔥 SOLO secure en producción real
        sameSite: "strict",
        path,
        maxAge: maxAgeMs,
    };
}


/**
 * Inserta refresh token en BD con defensa contra colisión de uq_refresh_token_hash.
 * Reintenta 1 vez si pasa ER_DUP_ENTRY.
 */
async function insertRefreshTokenSafe(userId, role, db = pool) {
    const refreshDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "30", 10);
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    for (let attempt = 0; attempt < 2; attempt++) {
        const refreshToken = signRefreshToken({ sub: userId, role });
        const refreshHash = sha256(refreshToken);

        try {
            await db.query(
                "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
                [userId, refreshHash, expiresAt]
            );
            return { refreshToken, refreshDays };
        } catch (err) {
            if (err?.code === "ER_DUP_ENTRY" && attempt === 0) {
                // Reintenta una vez generando otro refresh token
                continue;
            }
            throw err;
        }
    }

    throw new Error("No se pudo insertar refresh token (colisión repetida).");
}

router.post("/register", async (req, res) => {
    try {
        const { name, email, password, phone } = req.body || {};

        if (!name || !email || !password || !phone) {
            return res.status(400).json({ message: "Nombre, email, contraseña y número de WhatsApp son obligatorios." });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres." });
        }
        if (phone.length < 7) {
            return res.status(400).json({ message: "El número de WhatsApp no parece válido." });
        }

        const emailClean = email.trim().toLowerCase();

        // Check for existing email
        const [existing] = await pool.query(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [emailClean]
        );
        if (existing.length) {
            return res.status(409).json({ message: "Este email ya está registrado." });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await pool.query(
            "INSERT INTO users (name, email, password_hash, role, status, currency, whatsapp) VALUES (?, ?, ?, 'user', 'pending', 'COP', ?)",
            [name.trim(), emailClean, passwordHash, phone.trim()]
        );

        return res.status(201).json({
            ok: true,
            message: "Cuenta creada. Contacta al administrador para activarla.",
        });
    } catch (err) {
        console.error("REGISTER ERROR:", err.message);
        return res.status(500).json({ message: "Error interno." });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({ message: "Email y password son obligatorios." });
        }

        const [rows] = await pool.query(
            "SELECT id, name, email, password_hash, role, status, currency FROM users WHERE email = ? LIMIT 1",
            [email.trim().toLowerCase()]
        );

        if (!rows.length) return res.status(401).json({ message: "Credenciales inválidas." });

        const user = rows[0];
        if (user.status !== "active") {
            return res.status(403).json({ message: "Usuario no activo. Contacta al administrador." });
        }

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ message: "Credenciales inválidas." });

        const accessToken = signAccessToken({ sub: user.id, role: user.role });

        // ✅ Insert refresh token con defensa contra duplicados
        const { refreshToken, refreshDays } = await insertRefreshTokenSafe(user.id, user.role);

        await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

        // Cookies
        res.cookie("accessToken", accessToken, cookieOpts(req, 15 * 60 * 1000, "/"));
        res.cookie(
            "refreshToken",
            refreshToken,
            cookieOpts(req, refreshDays * 24 * 60 * 60 * 1000, REFRESH_COOKIE_PATH)
        );

        return res.json({
            ok: true,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, currency: user.currency },
        });
    } catch (err) {
        console.error("LOGIN ERROR DETAILS:", err.message);
        return res.status(500).json({ message: "Error interno." });
    }
});

// REFRESH (rota refresh token) - usa cookie refreshToken
router.post("/refresh", async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            conn.release();
            return res.status(401).json({ message: "No refresh token." });
        }

        let payload;
        try {
            payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        } catch {
            conn.release();
            return res.status(401).json({ message: "Refresh token inválido o expirado." });
        }

        const refreshHash = sha256(refreshToken);

        await conn.beginTransaction();

        // Busca el token en BD
        const [rows] = await conn.query(
            `SELECT id, user_id, revoked_at, expires_at
       FROM refresh_tokens
       WHERE token_hash = ?
       LIMIT 1`,
            [refreshHash]
        );

        if (!rows.length) {
            await conn.rollback();
            conn.release();
            return res.status(401).json({ message: "Refresh token no reconocido." });
        }

        const rt = rows[0];
        if (rt.revoked_at) {
            await conn.rollback();
            conn.release();
            return res.status(401).json({ message: "Refresh token revocado." });
        }
        if (new Date(rt.expires_at).getTime() < Date.now()) {
            await conn.rollback();
            conn.release();
            return res.status(401).json({ message: "Refresh token expirado." });
        }

        // Verifica usuario
        const [urows] = await conn.query(
            "SELECT id, role, status, name, email, currency FROM users WHERE id = ? LIMIT 1",
            [rt.user_id]
        );
        if (!urows.length) {
            await conn.rollback();
            conn.release();
            return res.status(401).json({ message: "Usuario no existe." });
        }
        const user = urows[0];
        if (user.status !== "active") {
            await conn.rollback();
            conn.release();
            return res.status(403).json({ message: "Usuario no activo." });
        }

        // Revoca el viejo
        await conn.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?", [rt.id]);

        // Emite nuevos tokens
        const newAccessToken = signAccessToken({ sub: user.id, role: user.role });

        // Emite nuevo refresh token (reutiliza lógica con defensa anti-colisión)
        const { refreshToken: newRefreshToken, refreshDays } = await insertRefreshTokenSafe(user.id, user.role, conn);

        await conn.commit();
        conn.release();

        // ✅ Set cookies (después de commit)
        res.cookie("accessToken", newAccessToken, cookieOpts(req, 15 * 60 * 1000, "/"));
        res.cookie(
            "refreshToken",
            newRefreshToken,
            cookieOpts(req, refreshDays * 24 * 60 * 60 * 1000, REFRESH_COOKIE_PATH)
        );

        return res.json({ ok: true });
    } catch (err) {
        try {
            await conn.rollback();
        } catch { }
        conn.release();
        console.error("Refresh Token Error:", err.message);
        return res.status(500).json({ message: "Error interno." });
    }
});

// LOGOUT (revoca refresh token actual) - usa cookie refreshToken
router.post("/logout", async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken) {
            const refreshHash = sha256(refreshToken);
            await pool.query(
                "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL",
                [refreshHash]
            );
        }

        const isProd =
            process.env.NODE_ENV === "production" ||
            req.secure ||
            req.headers["x-forwarded-proto"] === "https";

        const common = {
            httpOnly: true,
            secure: !!isProd,
            sameSite: "strict",
        };

        res.clearCookie("accessToken", { ...common, path: "/" });
        res.clearCookie("refreshToken", { ...common, path: REFRESH_COOKIE_PATH });

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

// ME: devuelve el usuario desde la cookie accessToken
router.get("/me", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.sub ?? req.user?.id;

        const [rows] = await pool.query(
            "SELECT id, name, email, role, status, currency FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        if (!rows.length) return res.status(401).json({ message: "No autorizado." });

        const u = rows[0];
        if (u.status !== "active") return res.status(403).json({ message: "Usuario no activo." });

        return res.json({
            ok: true,
            user: { id: u.id, name: u.name, email: u.email, role: u.role, currency: u.currency },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
