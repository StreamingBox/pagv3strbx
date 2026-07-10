require("dotenv").config({ override: true });
const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { isCountableLoginAttemptResponse } = require("./utils/loginRateLimit");
const cookieParser = require("cookie-parser");
const sanitize = require("./middleware/sanitize");
const logger = require("./utils/logger");

// ✅ Rutas
const codesRoutes = require("./routes/codes");
const codeLogsRoutes = require("./routes/codeLogs");
const adminCodeResetsRoutes = require("./routes/admin.codeResets");
const adminSupport = require("./routes/admin.support");
const supportTickets = require("./routes/supportTickets");
const adminReplacements = require("./routes/admin.replacements");
const adminMasterAccounts = require("./routes/admin.masterAccounts");
const adminCategories = require("./routes/admin.categories");

const usersRoutes = require("./routes/users");
const storeRoutes = require("./routes/store");
const shareRoutes = require("./routes/share");
const walletRoutes = require("./routes/wallet");
const catalogRoutes = require("./routes/catalog");
const combosRoutes = require("./routes/combos");

const adminUsers = require("./routes/admin.users");
const userNotifications = require("./routes/user.notifications");
const adminWallet = require("./routes/admin.wallet");
const adminPlatforms = require("./routes/admin.platforms");
const adminOrders = require("./routes/admin.orders");
const adminPrices = require("./routes/admin.prices");
const adminDurations = require("./routes/admin.durations");
const adminLinks = require("./routes/admin.links");

const adminAccountsRoutes = require("./routes/admin.accounts.routes");
const adminInventoryRoutes = require("./routes/admin.inventory.routes");

const brandingRoutes = require("./routes/branding");
const adminBrandingRoutes = require("./routes/admin.branding");

const authRoutes = require("./routes/auth");
const analyticsRoutes = require("./routes/analytics");
const adminUploads = require("./routes/admin.upload");
const adminAdvertisingRoutes = require("./routes/admin.advertising");
const advertisingRoutes = require("./routes/advertising");
const manualTopupsRoutes = require("./routes/manualTopups");
const notifaceRoutes = require("./routes/notiface");
const { initBot } = require("./services/telegramBot");
const pool = require("./db");
const { runMigrations } = require("./migrations/runner");
const { cleanupExpiredCredentialLinks } = require("./utils/tokens");
const { processPendingBrebTopups } = require("./services/brebReconciliation.service");
const { startPlatformStockAlertMonitor } = require("./services/stockAlertMonitor.service");
const { startMonthlyPurchaseEnforcement } = require("./services/monthlyPurchaseEnforcement.service");
const { startNotificationOutbox } = require("./services/notificationOutbox.service");

function requireProdEnv(name, { minLength = 1 } = {}) {
    const value = String(process.env[name] || "").trim();
    if (!value || value.length < minLength) {
        throw new Error(`[config] ${name} requerido en produccion.`);
    }
    return value;
}

function validatePublicUrl(name) {
    const value = requireProdEnv(name);
    try {
        const url = new URL(value);
        if (!["https:"].includes(url.protocol)) {
            throw new Error("must use https");
        }
        return url.origin;
    } catch {
        throw new Error(`[config] ${name} debe ser una URL HTTPS valida.`);
    }
}

function getEnvBool(name) {
    const raw = String(process.env[name] || "");
    const withoutComment = raw.split("#")[0].trim();
    const unquoted = withoutComment.replace(/^['"]|['"]$/g, "").trim().toLowerCase();
    return unquoted === "true" || unquoted === "1" || unquoted === "yes" || unquoted === "on";
}

function validateProductionConfig() {
    if (process.env.NODE_ENV !== "production") return;

    requireProdEnv("JWT_ACCESS_SECRET", { minLength: 32 });
    requireProdEnv("JWT_REFRESH_SECRET", { minLength: 32 });
    validatePublicUrl("FRONTEND_URL");
    validatePublicUrl("PUBLIC_BASE_URL");

    for (const name of ["IMAP_TLS_INSECURE", "NETFLIX_TLS_INSECURE"]) {
        if (getEnvBool(name)) {
            throw new Error(`[config] ${name} no puede estar activo en produccion.`);
        }
    }
}

try {
    validateProductionConfig();
} catch (error) {
    logger.error("production_config_invalid", { error });
    process.exit(1);
}

let instanceLockPath = null;
const lockEnabled = String(process.env.BACKEND_SINGLE_INSTANCE || "true").toLowerCase() !== "false";
if (lockEnabled) {
    try {
        const runtimeDir = path.join(__dirname, "..", ".runtime");
        fs.mkdirSync(runtimeDir, { recursive: true });
        instanceLockPath = path.join(runtimeDir, "backend.lock");

        if (fs.existsSync(instanceLockPath)) {
            const existingPid = Number(fs.readFileSync(instanceLockPath, "utf8").trim());
            let alive = false;
            if (Number.isFinite(existingPid) && existingPid > 0) {
                try {
                    process.kill(existingPid, 0);
                    alive = true;
                } catch {
                    alive = false;
                }
            }
            if (alive) {
                logger.error("backend_instance_lock_active", { existingPid });
                process.exit(1);
            }
        }

        fs.writeFileSync(instanceLockPath, String(process.pid), "utf8");
    } catch (e) {
        logger.error("backend_instance_lock_init_failed", { error: e });
        process.exit(1);
    }
}

const app = express();

// IP real detrás de Nginx
app.set("trust proxy", 1);

/* =======================
   CORS (ANTES DE RUTAS)
   ======================= */
const allowedOrigins = new Set([
    "https://strbx.com.co",
    "https://www.strbx.com.co",
]);

if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:5173");
    allowedOrigins.add("http://127.0.0.1:5173");
    allowedOrigins.add("http://localhost:5174");
    allowedOrigins.add("http://127.0.0.1:5174");
}
// Pruebas por IP / Elastic IP en EC2 (el navegador envía Origin: https://TU_IP)
// En backend/.env: CORS_EXTRA_ORIGINS=https://18.x.x.x,http://18.x.x.x
if (process.env.CORS_EXTRA_ORIGINS) {
    for (const raw of String(process.env.CORS_EXTRA_ORIGINS).split(/[,;\s]+/)) {
        const o = raw.trim().replace(/\/+$/, "");
        if (o) allowedOrigins.add(o);
    }
}
const localDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const allowLocalDevOrigin = process.env.NODE_ENV !== "production";

const corsOptions = {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // curl/postman
        if (allowedOrigins.has(origin) || (allowLocalDevOrigin && localDevOrigin.test(origin))) return cb(null, true);
        return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* =======================
   SECURITY — PRIMERO QUE LAS RUTAS
   ======================= */
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "default-src": ["'self'"],
                "script-src": ["'self'", "'unsafe-inline'"],
                "style-src": ["'self'", "'unsafe-inline'"],
                "img-src": ["'self'", "data:", "https:"],
                "connect-src": ["'self'"],
                "font-src": ["'self'", "https://fonts.gstatic.com"],
                "object-src": ["'none'"],
                "frame-ancestors": ["'none'"],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
    })
);

// Rate limit global: 120 req/min por IP
const globalRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
});
app.use(globalRateLimit);

// Solo POST /login y /register (no /me, /refresh, etc. — si no, 429 al cargar la app)
const loginRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: "Demasiados intentos de inicio de sesión. Intenta de nuevo en un minuto." },
    // Do not lock users out when the database or another dependency returns 5xx.
    skipFailedRequests: true,
    requestWasSuccessful: isCountableLoginAttemptResponse,
    skip: (req) => {
        if (req.method !== "POST") return true;
        const p = req.path || "";
        return !p.endsWith("/login") && !p.endsWith("/register");
    },
});

// Rate limit para códigos: 500 por hora
const codesRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 500,
    message: { ok: false, message: "Límite de solicitudes de código excedido (máximo 500 por hora)." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limit para forgot-password / reset-password: 3 req/min
const forgotPasswordRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: "Demasiadas solicitudes de recuperacion. Intenta de nuevo en un minuto." },
    skip: (req) => {
        if (req.method !== "POST") return true;
        const p = req.path || "";
        return !p.endsWith("/forgot-password") && !p.endsWith("/reset-password");
    },
});

// Rate limit para links compartidos: 30 req/min
const shareRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: "Demasiadas solicitudes al link compartido." },
});

/* =======================
   BODY PARSERS
   ======================= */
app.use(cookieParser());
app.use(express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
    },
}));
app.use(express.urlencoded({
    extended: true,
    limit: "5mb",
    parameterLimit: 200,
    depth: 5,
}));

// ✅ Sanitización de inputs (trim + anti prototype pollution)
app.use(sanitize);

// Evita cachear respuestas autenticadas o de configuración.
app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});

/* =======================
   ROUTES (solo bajo /api)
   ======================= */

// Liveness stays cheap; readiness verifies the dependency required by business flows.
app.get("/health", (_, res) => res.json({ ok: true, status: "live" }));
async function readinessHandler(_req, res) {
    let timeout;
    try {
        await Promise.race([
            pool.query("SELECT 1"),
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error("DB readiness timeout")), 3000);
            }),
        ]);
        return res.json({ ok: true, status: "ready" });
    } catch (error) {
        logger.error("readiness_failed", { error });
        return res.status(503).json({ ok: false, status: "not_ready" });
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}
app.get("/api/health", readinessHandler);
app.get("/api/readiness", readinessHandler);

// Auth — con rate limit específico en login
app.use("/api/auth", forgotPasswordRateLimit);
app.use("/api/auth", loginRateLimit);
app.use("/api/auth", authRoutes);

// Codes — con rate limit de 500/hr
app.use("/api/codes", codesRateLimit, codesRoutes);
app.get("/api/codes/_ping", (req, res) => res.json({ ok: true, mounted: true }));

// Code Logs (solo admin, ruta interna en su router)
app.use("/api", codeLogsRoutes);
app.use("/api", adminCodeResetsRoutes);

// Soporte admin
app.use("/api", adminSupport);
app.use("/api", supportTickets);
app.use("/api", adminReplacements);
app.use("/api", adminMasterAccounts);

// Categorías
app.use("/api", adminCategories);

// Branding
app.use("/api", brandingRoutes);
app.use("/api", adminBrandingRoutes);

// Uploads
app.use("/api", adminUploads);

// Users
app.use("/api/users", usersRoutes);

// Store: /checkout, /orders, /platforms
app.use("/api", storeRoutes);

// Short links /s/:token
app.use("/api/s", shareRateLimit);
app.use("/s", shareRateLimit);
app.use("/api", shareRoutes);
app.use(shareRoutes); // acceso directo sin /api para Nginx SPA catch-all

// Wallet y Catalog
app.use("/api", walletRoutes);
app.use("/api", catalogRoutes);
app.use("/api", combosRoutes);

// Admin
app.use("/api", adminUsers);
app.use("/api", userNotifications);
app.use("/api", adminWallet);
app.use("/api", adminPlatforms);
app.use("/api", adminAccountsRoutes);
app.use("/api", adminInventoryRoutes);
app.use("/api", adminOrders);
app.use("/api", adminPrices);
app.use("/api", adminDurations);
app.use("/api", adminLinks);

// Analytics
app.use("/api", analyticsRoutes);

// Publicidad / Advertising (Google Drive)
app.use("/api/admin/advertising", adminAdvertisingRoutes);
app.use("/api", advertisingRoutes);

app.use("/api", manualTopupsRoutes);
app.use("/api", notifaceRoutes);

app.use((req, res) => {
    return res.status(404).json({ ok: false, message: "Ruta no encontrada." });
});

app.use((err, req, res, _next) => {
    const status = Number(err?.status || err?.statusCode || 500);
    if (status >= 500) {
        logger.error("http_request_failed", {
            method: req.method,
            path: req.originalUrl,
            status,
            error: err,
        });
    }
    return res.status(status).json({
        ok: false,
        message: status >= 500 ? "Error interno." : (err?.message || "Solicitud invalida."),
    });
});

const port = process.env.PORT || 3000;
const server = http.createServer(app);
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 120000);
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 125000);
server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 5000);
server.maxHeadersCount = Number(process.env.HTTP_MAX_HEADERS_COUNT || 100);

async function startServer() {
    await runMigrations(pool);

    cleanupExpiredCredentialLinks(pool).catch(() => { });
    setInterval(() => {
        cleanupExpiredCredentialLinks(pool).catch(() => { });
    }, 60 * 60 * 1000).unref();

    server.listen(port, () => {
        logger.info("api_started", { port: Number(port), nodeEnv: process.env.NODE_ENV || "development" });
        initBot();
        startPlatformStockAlertMonitor();
        startMonthlyPurchaseEnforcement();
        startNotificationOutbox();
        processPendingBrebTopups().catch(() => { });
        setInterval(() => {
            processPendingBrebTopups().catch(() => { });
        }, 60 * 1000).unref();
    });
}

startServer().catch((err) => {
    logger.error("backend_start_failed", { error: err });
    releaseLock();
    try {
        server.close(() => process.exit(1));
    } catch {
        process.exit(1);
    }
});


function releaseLock() {
    if (instanceLockPath) {
        try { fs.unlinkSync(instanceLockPath); } catch { }
        instanceLockPath = null;
    }
}
process.on('SIGINT', () => { releaseLock(); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { releaseLock(); server.close(() => process.exit(0)); });
process.on('exit', releaseLock);
