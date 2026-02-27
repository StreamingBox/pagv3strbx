require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const binancePaymentsRoutes = require("./routes/payments.binance");

// ✅ Rutas existentes
const codesRoutes = require("./routes/codes");
const codeLogsRoutes = require("./routes/codeLogs");
const adminSupport = require("./routes/admin.support");
const adminCategories = require("./routes/admin.categories");

const usersRoutes = require("./routes/users");
const storeRoutes = require("./routes/store"); // ✅ aquí viven /checkout, /orders, /platforms
const shareRoutes = require("./routes/share"); // ✅ /s/:token
const walletRoutes = require("./routes/wallet"); // ✅ /wallet
const catalogRoutes = require("./routes/catalog"); // ✅ /catalog

const adminUsers = require("./routes/admin.users");
const adminWallet = require("./routes/admin.wallet");
const adminPlatforms = require("./routes/admin.platforms");
const adminOrders = require("./routes/admin.orders");
const adminPrices = require("./routes/admin.prices");
const adminDurations = require("./routes/admin.durations");

// ✅ cuentas e inventario
const adminAccountsRoutes = require("./routes/admin.accounts.routes");
const adminInventoryRoutes = require("./routes/admin.inventory.routes");

const brandingRoutes = require("./routes/branding");
const adminBrandingRoutes = require("./routes/admin.branding");

const authRoutes = require("./routes/auth");

const app = express();

// IP real detrás de Nginx
app.set("trust proxy", 1);

// ✅ Cookies
app.use(cookieParser());

/* =======================
   CORS (ANTES DE RUTAS)
   ======================= */
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

// ✅ Preflight global (NO uses "*")
app.options(/.*/, cors(corsOptions));
app.use("/api", binancePaymentsRoutes);



/* =======================
   SECURITY / LIMITS
   ======================= */
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
);

app.use(
    rateLimit({
        windowMs: 60 * 1000,
        max: 120,
        standardHeaders: true,
        legacyHeaders: false,
    })
);

app.use(express.json({
    limit: "5mb",
    verify: (req, res, buf) => {
        req.rawBody = buf.toString("utf8");
    },
}));

app.use(express.urlencoded({ extended: true, limit: "5mb" }));

/* =======================
   ROUTES
   ======================= */

// ✅ Soporte (AHORA sí con CORS aplicado)
app.use(adminSupport);
app.use("/api", adminSupport);

// ✅ CÓDIGOS (ya está bajo /api)
app.use("/api/codes", codesRoutes);
app.get("/api/codes/_ping", (req, res) => res.json({ ok: true, mounted: true }));

// ✅ LOGS SOLO ADMIN (ruta interna en su router)
app.use(codeLogsRoutes);
app.use("/api", codeLogsRoutes); // ✅ también /api/...

// ✅ Categorías (ruta interna en su router)
app.use(adminCategories);
app.use("/api", adminCategories); // ✅ también /api/...

// ✅ Auth (cookies)
app.use("/auth", authRoutes); // compat viejo
app.use("/api/auth", authRoutes); // frontend prod con /api

// ✅ Branding (ya está bajo /api)
app.use("/api", brandingRoutes);
app.use("/api", adminBrandingRoutes);

// ✅ Users
app.use("/users", usersRoutes);
app.use("/api/users", usersRoutes); // opcional pero recomendado

// ✅ Store: AQUÍ viven /checkout, /orders, /platforms
app.use(storeRoutes); // /checkout, /orders, /platforms
app.use("/api", storeRoutes); // /api/checkout, /api/orders, /api/platforms

// ✅ Short links /s/:token (NO lo metas bajo /api, va directo)
app.use(shareRoutes);

// ✅ Wallet y Catalog (ahora también bajo /api)
app.use(walletRoutes); // /wallet
app.use("/api", walletRoutes); // /api/wallet

app.use(catalogRoutes); // /catalog
app.use("/api", catalogRoutes); // /api/catalog

// ✅ Admin (SIN /api) - compat viejo
app.use(adminUsers);
app.use(adminWallet);
app.use(adminPlatforms);
app.use(adminAccountsRoutes);
app.use(adminInventoryRoutes);
app.use(adminOrders);
app.use(adminPrices);
app.use(adminDurations);

// ✅ Admin (CON /api) - ✅ FIX DEFINITIVO para producción con VITE_API_BASE=/api
app.use("/api", adminUsers);
app.use("/api", adminWallet);
app.use("/api", adminPlatforms);
app.use("/api", adminAccountsRoutes);
app.use("/api", adminInventoryRoutes);
app.use("/api", adminOrders);
app.use("/api", adminPrices);
app.use("/api", adminDurations);

// Health
app.get("/health", (_, res) => res.json({ ok: true }));
app.get("/api/health", (_, res) => res.json({ ok: true })); // ✅ útil para smoke test

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on :${port}`));
