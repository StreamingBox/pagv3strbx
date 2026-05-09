const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { normalizeCurrency, currencyAliases } = require("../utils/currency");

const router = express.Router();

function slugify(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 180);
}

function cleanComboItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item, index) => ({
            platform_id: Number(item.platform_id ?? item.platformId),
            duration_id: Number(item.duration_id ?? item.durationId),
            quantity: Math.max(1, Number(item.quantity || 1)),
            sort_order: Number(item.sort_order ?? item.sortOrder ?? index),
        }))
        .filter((item) => Number.isInteger(item.platform_id) && item.platform_id > 0 && Number.isInteger(item.duration_id) && item.duration_id > 0);
}

function cleanPrices(prices) {
    if (!prices || typeof prices !== "object") return [];
    return Object.entries(prices)
        .map(([currency, value]) => ({
            currency: normalizeCurrency(String(currency || "").toUpperCase(), String(currency || "").toUpperCase()),
            price: Number(value),
        }))
        .filter((row) => ["COP", "MXN", "USD"].includes(row.currency) && Number.isFinite(row.price) && row.price >= 0);
}

async function getCatalogCombosForCurrency(currency) {
    const aliases = currencyAliases(currency, "COP");
    const placeholders = aliases.map(() => "?").join(",");

    const [combos] = await pool.query(
        `SELECT c.id, c.name, c.slug, c.description, c.badge, c.sort_order,
                cp.price, cp.compare_at_price, cp.currency
         FROM combos c
         JOIN combo_prices cp ON cp.combo_id = c.id
         WHERE c.is_active = 1
           AND cp.is_active = 1
           AND UPPER(cp.currency) IN (${placeholders})
         ORDER BY c.sort_order ASC, c.name ASC`,
        aliases
    );

    if (!combos.length) return [];

    const comboIds = combos.map((combo) => combo.id);
    const comboPlaceholders = comboIds.map(() => "?").join(",");

    const [items] = await pool.query(
        `SELECT
            ci.combo_id,
            ci.platform_id,
            ci.duration_id,
            ci.quantity,
            ci.sort_order,
            pp.id AS platformPriceId,
            pp.price AS itemPrice,
            pp.currency AS itemCurrency,
            pp.is_renewable,
            p.name AS platformName,
            p.slug AS platformSlug,
            p.type AS platformType,
            d.name AS durationName,
            d.days,
            CASE WHEN COALESCE(s.stock, 0) > 0 THEN COALESCE(s.stock, 0) ELSE COALESCE(fs.fallback_stock, 0) END AS stock
         FROM combo_items ci
         JOIN platforms p ON p.id = ci.platform_id AND p.is_active = 1
         JOIN durations d ON d.id = ci.duration_id
         JOIN platform_prices pp ON pp.platform_id = ci.platform_id
             AND pp.duration_id = ci.duration_id
             AND pp.is_active = 1
             AND UPPER(pp.currency) IN (${placeholders})
         LEFT JOIN (
            SELECT platform_id, COUNT(*) AS stock
            FROM platform_accounts
            WHERE status = 'available'
              AND (expires_at IS NULL OR expires_at > NOW())
            GROUP BY platform_id
         ) s ON s.platform_id = p.id
         LEFT JOIN (
            SELECT pf.source_platform_id AS platform_id, SUM(COALESCE(stock.stock, 0)) AS fallback_stock
            FROM platform_fallbacks pf
            JOIN platforms fp ON fp.id = pf.fallback_platform_id AND fp.is_active = 1
            LEFT JOIN (
                SELECT platform_id, COUNT(*) AS stock
                FROM platform_accounts
                WHERE status = 'available'
                  AND (expires_at IS NULL OR expires_at > NOW())
                GROUP BY platform_id
            ) stock ON stock.platform_id = pf.fallback_platform_id
            WHERE pf.is_active = 1
            GROUP BY pf.source_platform_id
         ) fs ON fs.platform_id = p.id
         WHERE ci.combo_id IN (${comboPlaceholders})
         ORDER BY ci.combo_id ASC, ci.sort_order ASC, p.name ASC`,
        [...aliases, ...comboIds]
    );

    const [expectedRows] = await pool.query(
        `SELECT combo_id, SUM(quantity) AS expected_count
         FROM combo_items
         WHERE combo_id IN (${comboPlaceholders})
         GROUP BY combo_id`,
        comboIds
    );
    const expectedCountByCombo = new Map(expectedRows.map((row) => [Number(row.combo_id), Number(row.expected_count || 0)]));

    const grouped = new Map();
    for (const item of items) {
        if (!grouped.has(item.combo_id)) grouped.set(item.combo_id, []);
        grouped.get(item.combo_id).push(item);
    }

    return combos
        .map((combo) => {
            const comboItems = grouped.get(combo.id) || [];
            const regularTotal = comboItems.reduce((sum, item) => sum + Number(item.itemPrice || 0) * Number(item.quantity || 1), 0);
            const stock = comboItems.length
                ? Math.min(...comboItems.map((item) => {
                    if (item.platformType === "correo") return 999999;
                    return Math.floor(Number(item.stock || 0) / Number(item.quantity || 1));
                }))
                : 0;
            const effectiveStock = stock === 999999 ? 999999 : Math.max(stock, 0);
            const compareAt = Number(combo.compare_at_price || 0) > 0 ? Number(combo.compare_at_price) : regularTotal;

            return {
                ...combo,
                price: Number(combo.price || 0),
                compare_at_price: compareAt,
                regular_total: regularTotal,
                savings: Math.max(compareAt - Number(combo.price || 0), 0),
                stock: effectiveStock,
                items: comboItems.map((item) => ({
                    platformPriceId: item.platformPriceId,
                    platformId: item.platform_id,
                    durationId: item.duration_id,
                    quantity: Number(item.quantity || 1),
                    platformName: item.platformName,
                    platformSlug: item.platformSlug,
                    platformType: item.platformType,
                    durationName: item.durationName,
                    days: item.days,
                    price: Number(item.itemPrice || 0),
                    currency: item.itemCurrency,
                    stock: Number(item.stock || 0),
                    is_renewable: item.is_renewable,
                })),
            };
        })
        .filter((combo) => {
            const resolvedCount = combo.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
            const expectedCount = expectedCountByCombo.get(Number(combo.id)) || 0;
            return combo.items.length > 0 && resolvedCount === expectedCount;
        });
}

router.get("/combos", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.sub;
        const [urows] = await pool.query("SELECT currency FROM users WHERE id = ? LIMIT 1", [userId]);
        const userCurrency = normalizeCurrency(urows?.[0]?.currency || "COP", "COP");
        const combos = await getCatalogCombosForCurrency(userCurrency);
        return res.json(combos);
    } catch (err) {
        console.error("GET /combos error:", err);
        return res.status(500).json({ message: "Error cargando combos." });
    }
});

router.get("/admin/combos", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        const [combos] = await pool.query(
            `SELECT id, name, slug, description, badge, is_active, sort_order, created_at, updated_at
             FROM combos
             ORDER BY sort_order ASC, id DESC`
        );

        if (!combos.length) return res.json([]);

        const comboIds = combos.map((combo) => combo.id);
        const placeholders = comboIds.map(() => "?").join(",");

        const [items] = await pool.query(
            `SELECT ci.id, ci.combo_id, ci.platform_id, ci.duration_id, ci.quantity, ci.sort_order,
                    p.name AS platform_name, d.name AS duration_name, d.days
             FROM combo_items ci
             JOIN platforms p ON p.id = ci.platform_id
             JOIN durations d ON d.id = ci.duration_id
             WHERE ci.combo_id IN (${placeholders})
             ORDER BY ci.combo_id ASC, ci.sort_order ASC, ci.id ASC`,
            comboIds
        );

        const [prices] = await pool.query(
            `SELECT id, combo_id, currency, price, compare_at_price, is_active
             FROM combo_prices
             WHERE combo_id IN (${placeholders})
             ORDER BY combo_id ASC, currency ASC`,
            comboIds
        );

        const itemMap = new Map();
        const priceMap = new Map();
        for (const item of items) {
            if (!itemMap.has(item.combo_id)) itemMap.set(item.combo_id, []);
            itemMap.get(item.combo_id).push(item);
        }
        for (const price of prices) {
            if (!priceMap.has(price.combo_id)) priceMap.set(price.combo_id, []);
            priceMap.get(price.combo_id).push({ ...price, price: Number(price.price || 0), compare_at_price: price.compare_at_price == null ? null : Number(price.compare_at_price) });
        }

        return res.json(combos.map((combo) => ({
            ...combo,
            items: itemMap.get(combo.id) || [],
            prices: priceMap.get(combo.id) || [],
        })));
    } catch (err) {
        console.error("GET /admin/combos error:", err);
        return res.status(500).json({ message: "Error cargando combos." });
    }
});

router.post("/admin/combos", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { name, slug, description, badge, is_active, sort_order, items, prices } = req.body || {};
        const comboName = String(name || "").trim();
        if (!comboName) return res.status(400).json({ message: "El nombre del combo es obligatorio." });

        const cleanItems = cleanComboItems(items);
        if (!cleanItems.length) return res.status(400).json({ message: "Agrega al menos una plataforma al combo." });

        const cleanPriceRows = cleanPrices(prices);
        if (!cleanPriceRows.length) return res.status(400).json({ message: "Agrega al menos un precio valido." });

        const finalSlug = slugify(slug || comboName);
        if (!finalSlug) return res.status(400).json({ message: "El slug del combo es invalido." });

        await conn.beginTransaction();
        const [insert] = await conn.query(
            `INSERT INTO combos (name, slug, description, badge, is_active, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                comboName,
                finalSlug,
                description ? String(description).trim() : null,
                badge ? String(badge).trim() : null,
                is_active === false || is_active === 0 ? 0 : 1,
                Number(sort_order || 0),
            ]
        );
        const comboId = insert.insertId;

        for (const item of cleanItems) {
            await conn.query(
                `INSERT INTO combo_items (combo_id, platform_id, duration_id, quantity, sort_order)
                 VALUES (?, ?, ?, ?, ?)`,
                [comboId, item.platform_id, item.duration_id, item.quantity, item.sort_order]
            );
        }

        for (const price of cleanPriceRows) {
            await conn.query(
                `INSERT INTO combo_prices (combo_id, currency, price, is_active)
                 VALUES (?, ?, ?, 1)`,
                [comboId, price.currency, price.price]
            );
        }

        await conn.commit();
        return res.status(201).json({ ok: true, id: comboId });
    } catch (err) {
        try { await conn.rollback(); } catch { }
        if (String(err?.code || "").includes("ER_DUP_ENTRY")) {
            return res.status(409).json({ message: "Ya existe un combo con ese slug o item duplicado." });
        }
        console.error("POST /admin/combos error:", err);
        return res.status(500).json({ message: "Error guardando combo." });
    } finally {
        conn.release();
    }
});

router.patch("/admin/combos/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const comboId = Number(req.params.id);
        if (!Number.isInteger(comboId) || comboId <= 0) return res.status(400).json({ message: "Combo invalido." });

        const { name, slug, description, badge, is_active, sort_order, items, prices } = req.body || {};
        const comboName = name !== undefined ? String(name || "").trim() : null;
        if (name !== undefined && !comboName) return res.status(400).json({ message: "El nombre del combo es obligatorio." });

        const cleanItems = items !== undefined ? cleanComboItems(items) : null;
        if (items !== undefined && !cleanItems.length) return res.status(400).json({ message: "Agrega al menos una plataforma al combo." });

        const cleanPriceRows = prices !== undefined ? cleanPrices(prices) : null;
        if (prices !== undefined && !cleanPriceRows.length) return res.status(400).json({ message: "Agrega al menos un precio valido." });

        const finalSlug = slug !== undefined || comboName ? slugify(slug || comboName) : null;

        await conn.beginTransaction();
        await conn.query(
            `UPDATE combos
             SET name = COALESCE(?, name),
                 slug = COALESCE(?, slug),
                 description = COALESCE(?, description),
                 badge = COALESCE(?, badge),
                 is_active = COALESCE(?, is_active),
                 sort_order = COALESCE(?, sort_order),
                 updated_at = NOW()
             WHERE id = ?`,
            [
                comboName,
                finalSlug,
                description !== undefined ? String(description || "").trim() : null,
                badge !== undefined ? String(badge || "").trim() : null,
                is_active !== undefined ? (is_active ? 1 : 0) : null,
                sort_order !== undefined ? Number(sort_order || 0) : null,
                comboId,
            ]
        );

        if (cleanItems) {
            await conn.query("DELETE FROM combo_items WHERE combo_id = ?", [comboId]);
            for (const item of cleanItems) {
                await conn.query(
                    `INSERT INTO combo_items (combo_id, platform_id, duration_id, quantity, sort_order)
                     VALUES (?, ?, ?, ?, ?)`,
                    [comboId, item.platform_id, item.duration_id, item.quantity, item.sort_order]
                );
            }
        }

        if (cleanPriceRows) {
            await conn.query("UPDATE combo_prices SET is_active = 0 WHERE combo_id = ?", [comboId]);
            for (const price of cleanPriceRows) {
                await conn.query(
                    `INSERT INTO combo_prices (combo_id, currency, price, is_active)
                     VALUES (?, ?, ?, 1)
                     ON DUPLICATE KEY UPDATE price = VALUES(price), is_active = 1, updated_at = NOW()`,
                    [comboId, price.currency, price.price]
                );
            }
        }

        await conn.commit();
        return res.json({ ok: true });
    } catch (err) {
        try { await conn.rollback(); } catch { }
        if (String(err?.code || "").includes("ER_DUP_ENTRY")) {
            return res.status(409).json({ message: "Ya existe un combo con ese slug o item duplicado." });
        }
        console.error("PATCH /admin/combos error:", err);
        return res.status(500).json({ message: "Error actualizando combo." });
    } finally {
        conn.release();
    }
});

router.delete("/admin/combos/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const comboId = Number(req.params.id);
        if (!Number.isInteger(comboId) || comboId <= 0) return res.status(400).json({ message: "Combo invalido." });
        await pool.query("UPDATE combos SET is_active = 0, updated_at = NOW() WHERE id = ?", [comboId]);
        return res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /admin/combos error:", err);
        return res.status(500).json({ message: "Error desactivando combo." });
    }
});

module.exports = router;
module.exports.getCatalogCombosForCurrency = getCatalogCombosForCurrency;
