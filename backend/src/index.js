require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const sanitize = require("./middleware/sanitize");

// ✅ Rutas
const codesRoutes = require("./routes/codes");
const codeLogsRoutes = require("./routes/codeLogs");
const adminSupport = require("./routes/admin.support");
const adminCategories = require("./routes/admin.categories");

const usersRoutes = require("./routes/users");
const storeRoutes = require("./routes/store");
const shareRoutes = require("./routes/share");
const walletRoutes = require("./routes/wallet");
const catalogRoutes = require("./routes/catalog");

const adminUsers = require("./routes/admin.users");
const adminWallet = require("./routes/admin.wallet");
const adminPlatforms = require("./routes/admin.platforms");
const adminOrders = require("./routes/admin.orders");
const adminPrices = require("./routes/admin.prices");
const adminDurations = require("./routes/admin.durations");

const adminAccountsRoutes = require("./routes/admin.accounts.routes");
const adminInventoryRoutes = require("./routes/admin.inventory.routes");

const brandingRoutes = require("./routes/branding");
const adminBrandingRoutes = require("./routes/admin.branding");

const authRoutes = require("./routes/auth");
const analyticsRoutes = require("./routes/analytics");
const adminUploads = require("./routes/admin.upload");

const app = express();

// IP real detrás de Nginx
app.set("trust proxy", 1);

/* =======================
   CORS (ANTES DE RUTAS)
   ======================= */
const allowedOrigins = new Set([
    "https://strbx.com.co",
    "https://www.strbx.com.co",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]);

const corsOptions = {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // curl/postman
        if (allowedOrigins.has(origin)) return cb(null, true);
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
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "default-src": ["'self'"],
                "script-src": ["'self'"],
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

// Rate limit para auth/login: 10 intentos/min por IP (anti fuerza bruta)
const loginRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: "Demasiados intentos de inicio de sesión. Intenta de nuevo en un minuto." },
});

// Rate limit para códigos: 500 por hora
const codesRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 500,
    message: { ok: false, message: "Límite de solicitudes de código excedido (máximo 500 por hora)." },
    standardHeaders: true,
    legacyHeaders: false,
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
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ✅ Sanitización de inputs (trim + anti prototype pollution)
app.use(sanitize);

/* =======================
   ROUTES (solo bajo /api)
   ======================= */

// Health
app.get("/health", (_, res) => res.json({ ok: true }));
app.get("/api/health", (_, res) => res.json({ ok: true }));

// Auth — con rate limit específico en login
app.use("/api/auth", loginRateLimit);
app.use("/api/auth", authRoutes);

// Codes — con rate limit de 500/hr
app.use("/api/codes", codesRateLimit, codesRoutes);
app.get("/api/codes/_ping", (req, res) => res.json({ ok: true, mounted: true }));

// Code Logs (solo admin, ruta interna en su router)
app.use("/api", codeLogsRoutes);

// Soporte admin
app.use("/api", adminSupport);

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
app.use("/api", shareRoutes);
app.use(shareRoutes); // acceso directo sin /api para Nginx SPA catch-all

// Wallet y Catalog
app.use("/api", walletRoutes);
app.use("/api", catalogRoutes);

// Admin
app.use("/api", adminUsers);
app.use("/api", adminWallet);
app.use("/api", adminPlatforms);
app.use("/api", adminAccountsRoutes);
app.use("/api", adminInventoryRoutes);
app.use("/api", adminOrders);
app.use("/api", adminPrices);
app.use("/api", adminDurations);

// Analytics
app.use("/api", analyticsRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on :${port}`));
