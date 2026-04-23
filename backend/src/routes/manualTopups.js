const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    sendTopupSubmittedEmail,
} = require("../services/mailService");
const {
    mapManualTopupRow,
    updateManualTopupStatus,
} = require("../services/manualTopups.service");
const { notifyManualTopupSubmitted, notifyManualTopupStatusChanged } = require("../services/telegramBot");
const { attemptAutoReconcileManualTopup } = require("../services/brebReconciliation.service");

const router = express.Router();

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
            currency: "USD",
            holderName: "SCREEN",
            accountLabel: "ID Binance",
            accountValue: "920604097",
            accountAlias: "SCREEN",
            accountType: "binance",
            minAmount: 10,
            instructions: "Transfiere por Binance usando el ID o alias y luego sube el comprobante.",
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
    return {
        key: String(raw.key || "").trim().toLowerCase(),
        label: String(raw.label || "").trim(),
        currency: String(raw.currency || "").trim().toUpperCase(),
        holderName: String(raw.holderName || "").trim(),
        accountLabel: String(raw.accountLabel || "").trim(),
        accountValue: String(raw.accountValue || "").trim(),
        accountAlias: String(raw.accountAlias || "").trim(),
        accountType: String(raw.accountType || "").trim(),
        minAmount: Number(raw.minAmount || 0),
        qrImageUrl: normalizeQrImageUrl(raw.qrImageUrl),
        instructions: String(raw.instructions || "").trim(),
    };
}

async function getPaymentMethodsConfig() {
    await ensureSettingsTable();
    const defaults = defaultPaymentMethods();
    const defaultCopMethod = defaults.find((item) => item.currency === "COP");
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
        return [
            ...(defaultCopMethod ? [brebCopMethod || defaultCopMethod] : []),
            ...nonCopMethods,
        ];
    } catch {
        return defaults;
    }
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

function extFor(file) {
    const mime = String(file?.mimetype || "").toLowerCase();
    if (mime === "image/jpeg") return ".jpg";
    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    if (mime === "application/pdf") return ".pdf";
    return path.extname(String(file?.originalname || "")).toLowerCase() || ".bin";
}

function ensureProofDirs() {
    const frontEndBase = path.join(__dirname, "../../../frontend");
    const publicDir = path.join(frontEndBase, "public/topup-proofs");
    const distDir = path.join(frontEndBase, "dist/topup-proofs");
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    return { publicDir, distDir };
}

function saveProofFile({ file, requestCode }) {
    const { publicDir, distDir } = ensureProofDirs();
    const filename = `${String(requestCode || "proof").toLowerCase()}${extFor(file)}`;
    const publicPath = path.join(publicDir, filename);
    const distPath = path.join(distDir, filename);
    fs.writeFileSync(publicPath, file.buffer);
    if (fs.existsSync(path.join(distDir, ".."))) {
        fs.copyFileSync(publicPath, distPath);
    }
    return `/topup-proofs/${filename}`;
}

router.get("/wallet/manual-topups/config", requireAuth, async (req, res) => {
    try {
        const [[userRow]] = await pool.query(
            "SELECT currency FROM users WHERE id = ? LIMIT 1",
            [req.user.id]
        );
        const currency = String(userRow?.currency || "").trim().toUpperCase();
        const methods = await getPaymentMethodsConfig();
        const filteredMethods = methods.filter((item) => item.currency === currency);
        return res.json({
            ok: true,
            config: {
                currency,
                methods: filteredMethods,
            },
        });
    } catch (err) {
        console.error("Error GET /wallet/manual-topups/config:", err);
        return res.status(500).json({ message: "No se pudo cargar la configuracion de recarga." });
    }
});

router.get("/wallet/manual-topups", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            `SELECT *
             FROM manual_topup_requests
             WHERE user_id = ?
             ORDER BY id DESC
             LIMIT 20`,
            [userId]
        );
        return res.json({ ok: true, items: rows.map(mapManualTopupRow) });
    } catch (err) {
        console.error("Error GET /wallet/manual-topups:", err);
        return res.status(500).json({ message: "No se pudieron cargar las recargas." });
    }
});

router.post("/wallet/manual-topups", requireAuth, upload.single("proof"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const userId = req.user.id;
        const amount = Number(req.body?.amount || 0);
        const methodKey = String(req.body?.methodKey || "").trim().toLowerCase();
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

        const userCurrency = String(userRow.currency || "").trim().toUpperCase();
        const selectedMethod = methods.find((item) => item.key === methodKey && item.currency === userCurrency);

        if (!selectedMethod) {
            return res.status(400).json({ message: "El medio de pago no esta disponible para tu moneda." });
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "Ingresa un monto valido." });
        }

        if (amount < Number(selectedMethod.minAmount || 0)) {
            return res.status(400).json({ message: `La recarga minima para ${selectedMethod.label} es de ${Number(selectedMethod.minAmount || 0).toLocaleString("es-CO")} ${userCurrency}.` });
        }

        const requiresProof = selectedMethod.key !== "breb";

        if (selectedMethod.key === "breb") {
            if (!payerName) {
                return res.status(400).json({ message: "Debes indicar el nombre de la persona que hizo el giro." });
            }
            if (!declaredPaidAt || Number.isNaN(declaredPaidAt.getTime())) {
                declaredPaidAt = new Date();
            }
        }

        if (requiresProof && !req.file) {
            return res.status(400).json({ message: "Debes adjuntar el comprobante." });
        }

        const requestCode = buildRequestCode();
        const proofFileUrl = req.file ? saveProofFile({ file: req.file, requestCode }) : "";

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
                selectedMethod.key === "breb" ? "pending" : "manual_review",
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
        if (selectedMethod.key === "breb") {
            attemptAutoReconcileManualTopup(ins.insertId).catch((brebErr) => {
                console.error("[breb] attemptAutoReconcileManualTopup:", brebErr?.message || brebErr);
            });
        }

        return res.json({
            ok: true,
            request: mapManualTopupRow({
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
                auto_validation_status: selectedMethod.key === "breb" ? "pending" : "manual_review",
                auto_validation_note: selectedMethod.key === "breb" ? "Pendiente por conciliación automática Bre-B." : "Pendiente de revisión manual.",
                status: "submitted",
                created_at: new Date().toISOString(),
            }),
        });
    } catch (err) {
        try { await conn.rollback(); } catch { }
        console.error("Error POST /wallet/manual-topups:", err);
        return res.status(500).json({ message: err?.message || "No se pudo crear la solicitud de recarga." });
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
            items: rows.map(mapManualTopupRow),
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
        return res.json({ ok: true, item });
    } catch (err) {
        console.error("Error PATCH /admin/manual-topups/:id/status:", err);
        const message = err?.message || "No se pudo actualizar la solicitud.";
        if (/no encontrada/i.test(message)) return res.status(404).json({ message });
        if (/invalido|cerrada|wallet|estado/i.test(message)) return res.status(400).json({ message });
        return res.status(500).json({ message });
    }
});

module.exports = router;
