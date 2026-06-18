const express = require("express");
const multer = require("multer");

const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    sendTopupSubmittedEmail,
} = require("../services/mailService");
const {
    mapManualTopupRow,
    sanitizeManualTopupForClient,
    updateManualTopupStatus,
    createManualTopupProofToken,
    getManualTopupProofAccess,
    markManualTopupProofTokenOpened,
    revokeManualTopupProofToken,
} = require("../services/manualTopups.service");
const { notifyManualTopupSubmitted, notifyManualTopupStatusChanged } = require("../services/telegramBot");
const { attemptAutoReconcileManualTopup } = require("../services/brebReconciliation.service");
const { normalizeCurrency, sameCurrency, displayCurrency } = require("../utils/currency");
const { saveManualTopupProof } = require("../utils/manualTopupProofStorage");

const router = express.Router();
const AUTO_RECONCILE_METHOD_KEYS = new Set(["breb", "binance"]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
        if (!allowed.has(String(file.mimetype || "").toLowerCase())) {
            return cb(new Error("Solo se permiten JPG, PNG, WEBP o PDF."));
        }
        cb(null, true);
    },
});

function uploadProof(req, res, next) {
    upload.single("proof")(req, res, (err) => {
        if (!err) return next();
        const isFileSize = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
        const message = isFileSize
            ? "El comprobante supera el tamaño permitido. Usa un archivo de máximo 5MB."
            : (err?.message || "No se pudo leer el comprobante. Usa JPG, PNG, WEBP o PDF.");
        return res.status(isFileSize ? 413 : 400).json({ ok: false, message });
    });
}

async function ensureSettingsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key   VARCHAR(128) PRIMARY KEY,
            setting_value TEXT         NOT NULL,
            updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

function defaultPaymentMethods() {
    return [
        {
            key: "breb",
            label: "Bre-B",
            currency: "COP",
            holderName: "ANGEL MORENO",
            accountLabel: "Llave",
            accountValue: "3006952221",
            accountType: "llave",
            accountAlias: "",
            qrImageUrl: "",
            minAmount: 3000,
            instructions: "Envía por llaves Bre-B a la llave 3006952221. Si pagas por otro medio, la recarga pasará a segunda validación manual.",
        },
        {
            key: "binance",
            label: "Binance",
            currency: "USDT",
            holderName: "SCREEN",
            accountLabel: "ID Binance",
            accountValue: "920604097",
            accountAlias: "SCREEN",
            accountType: "binance",
            minAmount: 1,
            instructions: "Transfiere USDT por Binance usando el ID o alias y luego sube el comprobante.",
        },
        {
            key: "binance",
            label: "Binance",
            currency: "MXN",
            holderName: "SCREEN",
            accountLabel: "ID Binance",
            accountValue: "920604097",
            accountAlias: "SCREEN",
            accountType: "binance",
            minAmount: 1,
            instructions: "Transfiere USDT por Binance usando el ID o alias y luego sube el comprobante.",
        },
    ];
}

function normalizeQrImageUrl(value) {
    const input = String(value || "").trim();
    if (!input) return "";

    try {
        const url = new URL(input);
        if (url.hostname.includes("drive.google.com")) {
            const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
            const directId = fileMatch?.[1] || url.searchParams.get("id");
            if (directId) {
                return `https://drive.google.com/uc?export=view&id=${directId}`;
            }
        }
    } catch {
        return input;
    }

    return input;
}

function normalizeMethod(input) {
    const raw = input && typeof input === "object" ? input : {};
    const requestedCurrency = String(raw.currency || "").trim().toUpperCase();
    const currency = displayCurrency(normalizeCurrency(requestedCurrency || "COP", "COP"), "COP");
    const rawKey = String(raw.key || "").trim().toLowerCase();
    const key = currency === "COP" ? "breb" : rawKey;
    const parsedMinAmount = Number(raw.minAmount || 0);
    const normalizedMinAmount = key === "binance"
        ? 1
        : Number.isFinite(parsedMinAmount)
            ? parsedMinAmount
            : 0;

    return {
        key,
        label: currency === "COP" ? "Bre-B" : String(raw.label || "").trim(),
        currency,
        holderName: String(raw.holderName || "").trim(),
        accountLabel: String(raw.accountLabel || "").trim(),
        accountValue: String(raw.accountValue || "").trim(),
        accountAlias: String(raw.accountAlias || "").trim(),
        accountType: String(raw.accountType || "").trim(),
        minAmount: normalizedMinAmount,
        qrImageUrl: normalizeQrImageUrl(raw.qrImageUrl),
        instructions: String(raw.instructions || "").trim(),
    };
}

async function getPaymentMethodsConfig() {
    await ensureSettingsTable();
    const defaults = defaultPaymentMethods();
    const defaultCopMethod = defaults.find((item) => item.currency === "COP");
    const defaultNonCopMethods = defaults.filter((item) => item.currency !== "COP");
    const [[row]] = await pool.query(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'topup_payment_methods_json' LIMIT 1"
    );
    if (!row?.setting_value) return defaults;

    try {
        const parsed = JSON.parse(row.setting_value);
        if (!Array.isArray(parsed)) return defaults;
        const methods = parsed.map(normalizeMethod).filter((item) => item.key && item.label && item.currency && item.accountValue);
        if (!methods.length) return defaults;

        const nonCopMethods = methods.filter((item) => item.currency !== "COP");
        const brebCopMethod = methods.find((item) => item.currency === "COP" && item.key === "breb");
        const existingCurrencies = new Set(nonCopMethods.map((item) => item.currency));
        const completedNonCopMethods = [
            ...nonCopMethods,
            ...defaultNonCopMethods.filter((item) => !existingCurrencies.has(item.currency)),
        ];
        return [
            ...(defaultCopMethod ? [brebCopMethod || defaultCopMethod] : []),
            ...completedNonCopMethods,
        ];
    } catch {
        return defaults;
    }
}

function getDefaultMethodsForCurrency(currency) {
    const normalizedCurrency = displayCurrency(normalizeCurrency(currency || "COP", "COP"), "COP");
    return defaultPaymentMethods().filter((item) => sameCurrency(item.currency, normalizedCurrency));
}

async function savePaymentMethodsConfig(methods) {
    await ensureSettingsTable();
    await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES ('topup_payment_methods_json', ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [JSON.stringify(methods)]
    );
}

function buildRequestCode() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `REC-${stamp}-${rand}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getRequestUserId(req) {
    const raw = req?.user?.sub ?? req?.user?.id ?? req?.user?.userId ?? null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

async function createProofLinkResponse({ topupId, proofFileUrl, actorUserId = null, actorRole = null }) {
    const tokenInfo = await createManualTopupProofToken({
        topupId,
        proofFileUrl,
        actorUserId,
        actorRole,
    });
    return { ok: true, viewerUrl: tokenInfo?.viewerUrl || null };
}

router.get("/wallet/manual-topups/config", requireAuth, async (req, res) => {
    try {
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "No autorizado." });
        }

        const [[userRow]] = await pool.query(
            `SELECT COALESCE(u.currency, w.currency, 'COP') AS currency
             FROM users u
             LEFT JOIN wallets w ON w.user_id = u.id
             WHERE u.id = ?
             LIMIT 1`,
            [userId]
        );
        const currency = displayCurrency(normalizeCurrency(userRow?.currency || "COP", "COP"), "COP");
        const methods = await getPaymentMethodsConfig();
        const filteredMethods = methods.filter((item) => sameCurrency(item.currency, currency));
        const safeMethods = filteredMethods.length ? filteredMethods : getDefaultMethodsForCurrency(currency);
        return res.json({
            ok: true,
            config: {
                currency,
                methods: safeMethods,
            },
        });
    } catch (err) {
        console.error("Error GET /wallet/manual-topups/config:", err);
        return res.status(500).json({ message: "No se pudo cargar la configuracion de recarga." });
    }
});

router.get("/wallet/manual-topups", requireAuth, async (req, res) => {
    try {
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "No autorizado." });
        }
        const [rows] = await pool.query(
            `SELECT *
             FROM manual_topup_requests
             WHERE user_id = ?
             ORDER BY id DESC
             LIMIT 20`,
            [userId]
        );
        return res.json({ ok: true, items: rows.map(sanitizeManualTopupForClient) });
    } catch (err) {
        console.error("Error GET /wallet/manual-topups:", err);
        return res.status(500).json({ message: "No se pudieron cargar las recargas." });
    }
});

router.post("/wallet/manual-topups", requireAuth, uploadProof, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "No autorizado." });
        }
        const amount = Number(req.body?.amount || 0);
        const methodKey = String(req.body?.methodKey || "").trim().toLowerCase();
        const methodCurrency = normalizeCurrency(req.body?.methodCurrency || "", "");
        const payerName = String(req.body?.payerName || "").trim();
        const declaredPaidAtRaw = String(req.body?.declaredPaidAt || "").trim();
        let declaredPaidAt = declaredPaidAtRaw ? new Date(declaredPaidAtRaw) : null;
        const methods = await getPaymentMethodsConfig();

        const [[userRow]] = await conn.query(
            "SELECT id, name, email, currency FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        if (!userRow) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        const userCurrency = normalizeCurrency(userRow.currency || "COP", "COP");
        const userDisplayCurrency = displayCurrency(userCurrency, "COP");
        const selectedMethod = methods.find((item) =>
            item.key === methodKey &&
            sameCurrency(item.currency, methodCurrency || userCurrency) &&
            sameCurrency(item.currency, userCurrency)
        );

        if (!selectedMethod) {
            return res.status(400).json({ message: "El medio de pago no esta disponible para tu moneda." });
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "Ingresa un monto valido." });
        }

        if (amount < Number(selectedMethod.minAmount || 0)) {
            return res.status(400).json({ message: `La recarga minima para ${selectedMethod.label} es de ${Number(selectedMethod.minAmount || 0).toLocaleString("es-CO")} ${userDisplayCurrency}.` });
        }

        const requiresProof = selectedMethod.key !== "breb";
        const requiresPayerName = AUTO_RECONCILE_METHOD_KEYS.has(selectedMethod.key);
        const usesAutoReconciliation = AUTO_RECONCILE_METHOD_KEYS.has(selectedMethod.key);

        if (requiresPayerName && !payerName) {
            return res.status(400).json({ message: "Debes indicar el nombre o usuario del remitente." });
        }
        if (usesAutoReconciliation && (!declaredPaidAt || Number.isNaN(declaredPaidAt.getTime()))) {
            declaredPaidAt = new Date();
        }

        if (requiresProof && !req.file) {
            return res.status(400).json({ message: "Debes adjuntar el comprobante." });
        }

        const requestCode = buildRequestCode();
        const proofFileUrl = req.file ? saveManualTopupProof({ file: req.file, requestCode }) : "";

        await conn.beginTransaction();
        const [ins] = await conn.query(
            `INSERT INTO manual_topup_requests
                (request_code, user_id, method_key, method_label, amount, currency, proof_file_url, payer_name, declared_paid_at, auto_validation_status, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
            [
                requestCode,
                userId,
                selectedMethod.key,
                selectedMethod.label,
                amount,
                userCurrency,
                proofFileUrl,
                payerName || null,
                declaredPaidAt && !Number.isNaN(declaredPaidAt.getTime()) ? declaredPaidAt : null,
                usesAutoReconciliation ? "pending" : "manual_review",
            ]
        );
        await conn.commit();

        sendTopupSubmittedEmail({
            to: userRow.email,
            name: userRow.name,
            requestCode,
            amount,
            currency: userCurrency,
        }).then(() => {
            pool.query(
                "UPDATE manual_topup_requests SET submitted_email_sent_at = UTC_TIMESTAMP() WHERE id = ?",
                [ins.insertId]
            ).catch(() => { });
        }).catch((mailErr) => {
            console.error("[mail] sendTopupSubmittedEmail:", mailErr?.message || mailErr);
        });

        notifyManualTopupSubmitted(ins.insertId).catch((tgErr) => {
            console.error("[TelegramBot] notifyManualTopupSubmitted:", tgErr?.message || tgErr);
        });
        if (usesAutoReconciliation) {
            attemptAutoReconcileManualTopup(ins.insertId).catch((brebErr) => {
                console.error("[topup] attemptAutoReconcileManualTopup:", brebErr?.message || brebErr);
            });
        }

        return res.json({
            ok: true,
            request: sanitizeManualTopupForClient({
                id: ins.insertId,
                request_code: requestCode,
                user_id: userId,
                amount,
                currency: userCurrency,
                method_key: selectedMethod.key,
                method_label: selectedMethod.label,
                proof_file_url: proofFileUrl,
                payer_name: payerName || null,
                declared_paid_at: declaredPaidAt && !Number.isNaN(declaredPaidAt.getTime()) ? declaredPaidAt.toISOString() : null,
                auto_validation_status: usesAutoReconciliation ? "pending" : "manual_review",
                auto_validation_note: usesAutoReconciliation
                    ? (selectedMethod.key === "breb"
                        ? "Pendiente por conciliación automática Bre-B."
                        : "Pendiente por conciliación automática Binance.")
                    : "Pendiente de revisión manual.",
                status: "submitted",
                created_at: new Date().toISOString(),
            }),
        });
    } catch (err) {
        try { await conn.rollback(); } catch { }
        console.error("Error POST /wallet/manual-topups:", err);
        return res.status(500).json({ message: "No se pudo crear la solicitud de recarga. Intenta nuevamente." });
    } finally {
        conn.release();
    }
});

router.get("/admin/manual-topups/config", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        return res.json({ ok: true, config: { methods: await getPaymentMethodsConfig() } });
    } catch (err) {
        console.error("Error GET /admin/manual-topups/config:", err);
        return res.status(500).json({ message: "No se pudo cargar la configuracion." });
    }
});

router.put("/admin/manual-topups/config", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const rawMethods = Array.isArray(req.body?.methods) ? req.body.methods : [];
        const methods = rawMethods.map(normalizeMethod).filter((item) => item.key && item.label && item.currency && item.accountValue);

        if (!methods.length) {
            return res.status(400).json({ message: "Debes guardar al menos un medio de pago valido." });
        }

        for (const method of methods) {
            if (!Number.isFinite(method.minAmount) || method.minAmount <= 0) {
                return res.status(400).json({ message: `El monto minimo de ${method.label} debe ser mayor a 0.` });
            }
        }
        const copMethods = methods.filter((item) => item.currency === "COP");
        if (copMethods.length !== 1 || copMethods[0]?.key !== "breb") {
            return res.status(400).json({ message: "Para COP solo se permite un medio y debe ser Bre-B." });
        }

        await savePaymentMethodsConfig(methods);
        return res.json({ ok: true, config: { methods: await getPaymentMethodsConfig() } });
    } catch (err) {
        console.error("Error PUT /admin/manual-topups/config:", err);
        return res.status(500).json({ message: "No se pudo guardar la configuracion." });
    }
});

router.get("/admin/manual-topups", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { page = 1, limit = 20, status = "", q = "" } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const offset = (pageNum - 1) * limitNum;

        const where = [];
        const params = [];

        if (status) {
            where.push("m.status = ?");
            params.push(String(status).trim().toLowerCase());
        }

        if (q) {
            const like = `%${String(q).trim()}%`;
            where.push("(m.request_code LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR m.method_label LIKE ?)");
            params.push(like, like, like, like);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM manual_topup_requests m
             JOIN users u ON u.id = m.user_id
             ${whereSql}`,
            params
        );
        const total = Number(countRows[0]?.total || 0);

        const [rows] = await pool.query(
            `SELECT m.*, u.email AS user_email, u.name AS user_name
             FROM manual_topup_requests m
             JOIN users u ON u.id = m.user_id
             ${whereSql}
             ORDER BY m.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limitNum, offset]
        );

        return res.json({
            ok: true,
            items: rows.map(sanitizeManualTopupForClient),
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.max(Math.ceil(total / limitNum), 1),
        });
    } catch (err) {
        console.error("Error GET /admin/manual-topups:", err);
        return res.status(500).json({ message: "No se pudieron cargar las solicitudes." });
    }
});

router.patch("/admin/manual-topups/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const status = String(req.body?.status || "").trim().toLowerCase();
        const adminNote = String(req.body?.adminNote || "").trim() || null;
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "ID invalido." });
        }
        if (!["reviewing", "approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Estado invalido." });
        }
        const item = await updateManualTopupStatus({
            id,
            status,
            adminUserId: req.user.id,
            adminNote,
        });
        notifyManualTopupStatusChanged(item, { actor: req.user.email || req.user.name || "admin web" }).catch((tgErr) => {
            console.error("[TelegramBot] notifyManualTopupStatusChanged:", tgErr?.message || tgErr);
        });
        return res.json({ ok: true, item: sanitizeManualTopupForClient(item) });
    } catch (err) {
        console.error("Error PATCH /admin/manual-topups/:id/status:", err);
        const message = err?.message || "No se pudo actualizar la solicitud.";
        if (/no encontrada/i.test(message)) return res.status(404).json({ message });
        if (/invalido|cerrada|wallet|estado/i.test(message)) return res.status(400).json({ message });
        return res.status(500).json({ message });
    }
});

router.post("/wallet/manual-topups/:id/proof-link", requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "ID invalido." });
        }
        const [[row]] = await pool.query(
            `SELECT id, user_id, proof_file_url
             FROM manual_topup_requests
             WHERE id = ?
             LIMIT 1`,
            [id]
        );
        if (!row || Number(row.user_id) !== Number(req.user.id)) {
            return res.status(404).json({ message: "Comprobante no encontrado." });
        }
        if (!row.proof_file_url) {
            return res.status(404).json({ message: "Esta recarga no tiene comprobante adjunto." });
        }
        return res.json(await createProofLinkResponse({
            topupId: id,
            proofFileUrl: row.proof_file_url,
            actorUserId: req.user.id,
            actorRole: "user",
        }));
    } catch (err) {
        console.error("Error POST /wallet/manual-topups/:id/proof-link:", err);
        return res.status(500).json({ message: "No se pudo abrir el comprobante." });
    }
});

router.post("/admin/manual-topups/:id/proof-link", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "ID invalido." });
        }
        const [[row]] = await pool.query(
            `SELECT id, proof_file_url
             FROM manual_topup_requests
             WHERE id = ?
             LIMIT 1`,
            [id]
        );
        if (!row) {
            return res.status(404).json({ message: "Comprobante no encontrado." });
        }
        if (!row.proof_file_url) {
            return res.status(404).json({ message: "Esta recarga no tiene comprobante adjunto." });
        }
        return res.json(await createProofLinkResponse({
            topupId: id,
            proofFileUrl: row.proof_file_url,
            actorUserId: req.user.id,
            actorRole: "admin",
        }));
    } catch (err) {
        console.error("Error POST /admin/manual-topups/:id/proof-link:", err);
        return res.status(500).json({ message: "No se pudo abrir el comprobante." });
    }
});

router.get("/topup-proofs/view/:token", async (req, res) => {
    try {
        const access = await getManualTopupProofAccess(req.params.token);
        if (!access) {
            return res.status(404).send("Comprobante no disponible.");
        }
        await markManualTopupProofTokenOpened(req.params.token);
        const isPdf = access.contentType === "application/pdf";
        const fileUrl = `/api/topup-proofs/file/${encodeURIComponent(req.params.token)}`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Comprobante temporal</title>
  <style>
    body{margin:0;background:#0f172a;color:#fff;font-family:Arial,Helvetica,sans-serif}
    .wrap{min-height:100vh;display:grid;grid-template-rows:auto 1fr}
    .top{padding:14px 18px;border-bottom:1px solid rgba(148,163,184,.18);display:flex;justify-content:space-between;gap:12px;align-items:center}
    .btn{border:1px solid rgba(148,163,184,.25);background:#1e293b;color:#fff;border-radius:10px;padding:10px 14px;cursor:pointer;text-decoration:none}
    .body{display:grid;place-items:center;padding:16px}
    iframe,img{max-width:100%;max-height:calc(100vh - 96px);border:0;border-radius:14px;background:#fff}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>Comprobante temporal</div>
      <button class="btn" onclick="window.close()">Cerrar</button>
    </div>
    <div class="body">
      ${isPdf
                ? `<iframe title="Comprobante" src="${escapeHtml(fileUrl)}" style="width:100%;height:calc(100vh - 110px)"></iframe>`
                : `<img alt="Comprobante" src="${escapeHtml(fileUrl)}" />`}
    </div>
  </div>
  <script>
    let revoked = false;
    function revoke() {
      if (revoked) return;
      revoked = true;
      try {
        navigator.sendBeacon('/api/topup-proofs/revoke/${encodeURIComponent(req.params.token)}');
      } catch (_) {
        fetch('/api/topup-proofs/revoke/${encodeURIComponent(req.params.token)}', { method: 'POST', keepalive: true }).catch(() => {});
      }
    }
    window.addEventListener('pagehide', revoke);
    window.addEventListener('beforeunload', revoke);
  </script>
</body>
</html>`);
    } catch (err) {
        console.error("Error GET /topup-proofs/view/:token:", err);
        return res.status(500).send("No se pudo abrir el comprobante.");
    }
});

router.get("/topup-proofs/file/:token", async (req, res) => {
    try {
        const access = await getManualTopupProofAccess(req.params.token);
        if (!access) {
            return res.status(404).send("Comprobante no disponible.");
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", access.contentType);
        return res.sendFile(access.filePath);
    } catch (err) {
        console.error("Error GET /topup-proofs/file/:token:", err);
        return res.status(500).send("No se pudo leer el comprobante.");
    }
});

router.post("/topup-proofs/revoke/:token", async (req, res) => {
    try {
        await revokeManualTopupProofToken(req.params.token);
        return res.status(204).end();
    } catch (err) {
        console.error("Error POST /topup-proofs/revoke/:token:", err);
        return res.status(204).end();
    }
});

module.exports = router;
