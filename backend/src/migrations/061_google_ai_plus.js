const PLATFORM_NAME = "Google AI PLUS";
const PLATFORM_SLUG = "google-ai-plus";
const PRODUCT_DETAILS = [
    "Duración: 3 meses (90 días)",
    "Almacenamiento: 400 GB",
    "Acceso desde tu propia cuenta de Google.",
    "Activación mediante código de cupón oficial.",
    "El enlace de activación se entrega por WhatsApp después de la compra.",
    "**IMPORTANTE: Se requiere una tarjeta de activación con saldo mínimo de $4.000 COP.**",
].join("\n");

module.exports = {
    id: "061_google_ai_plus",
    name: "Add Google AI PLUS quarterly COP product",
    async up({ query }) {
        const [durationRows] = await query(
            "SELECT id FROM durations WHERE days = 90 AND is_active = 1 ORDER BY id ASC LIMIT 1"
        );
        if (!durationRows.length) {
            throw new Error("No existe una duración activa de 90 días para configurar Google AI PLUS.");
        }

        const [categoryRows] = await query(
            "SELECT id FROM categories WHERE slug = 'ia' AND is_active = 1 ORDER BY id ASC LIMIT 1"
        );
        if (!categoryRows.length) {
            throw new Error("No existe una categoría activa de IA para configurar Google AI PLUS.");
        }

        const [platformRows] = await query(
            "SELECT id FROM platforms WHERE slug = ? LIMIT 1",
            [PLATFORM_SLUG]
        );

        let platformId;
        if (platformRows.length) {
            platformId = Number(platformRows[0].id);
            await query(
                `UPDATE platforms
                    SET name = ?, category_id = ?, type = 'correo', is_active = 1, allowed_currencies = 'COP',
                        is_promo = 0, promo_color = NULL, show_promo_last_units = 0,
                        is_new_product = 1, show_device_rule = 0, product_details = ?, is_event_link = 0
                  WHERE id = ?`,
                [PLATFORM_NAME, Number(categoryRows[0].id), PRODUCT_DETAILS, platformId]
            );
        } else {
            const [insertedPlatform] = await query(
                `INSERT INTO platforms (
                    name, slug, category_id, type, is_active, allowed_currencies,
                    is_promo, promo_color, show_promo_last_units, is_new_product,
                    show_device_rule, product_details, is_event_link,
                    event_link_unit_cost, event_link_monthly_cost
                ) VALUES (?, ?, ?, 'correo', 1, 'COP', 0, NULL, 0, 1, 0, ?, 0, 3000, 20000)`,
                [PLATFORM_NAME, PLATFORM_SLUG, Number(categoryRows[0].id), PRODUCT_DETAILS]
            );
            platformId = Number(insertedPlatform.insertId);
        }

        const durationId = Number(durationRows[0].id);
        const [priceRows] = await query(
            `SELECT id FROM platform_prices
              WHERE platform_id = ? AND duration_id = ? AND currency = 'COP'
              LIMIT 1`,
            [platformId, durationId]
        );

        if (priceRows.length) {
            await query(
                `UPDATE platform_prices
                    SET price = 8000, is_active = 1, is_renewable = 0
                  WHERE id = ?`,
                [priceRows[0].id]
            );
        } else {
            await query(
                `INSERT INTO platform_prices
                    (platform_id, duration_id, price, currency, is_active, is_renewable)
                 VALUES (?, ?, 8000, 'COP', 1, 0)`,
                [platformId, durationId]
            );
        }
    },
};
