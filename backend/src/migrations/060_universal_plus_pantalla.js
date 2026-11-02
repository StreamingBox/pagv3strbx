const PLATFORM_NAME = "Universal+ Pantalla";
const PLATFORM_SLUG = "universal-plus-pantalla";
const PRODUCT_DETAILS = "Acceso a Universal+ por correo durante la vigencia indicada en el pedido. La plataforma puede solicitar un código de inicio de sesión enviado al correo. Uso permitido en un solo dispositivo.";

module.exports = {
    id: "060_universal_plus_pantalla",
    name: "Add Universal+ single-screen COP product",
    async up({ query }) {
        const [durationRows] = await query(
            "SELECT id FROM durations WHERE days = 30 AND is_active = 1 ORDER BY id ASC LIMIT 1"
        );
        if (!durationRows.length) {
            throw new Error("No existe una duración activa de 30 días para configurar Universal+.");
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
                    SET name = ?, type = 'correo', is_active = 1, allowed_currencies = 'COP',
                        is_promo = 0, promo_color = NULL, show_promo_last_units = 0,
                        is_new_product = 0, show_device_rule = 1, product_details = ?
                  WHERE id = ?`,
                [PLATFORM_NAME, PRODUCT_DETAILS, platformId]
            );
        } else {
            const [insertedPlatform] = await query(
                `INSERT INTO platforms (
                    name, slug, category_id, type, is_active, allowed_currencies,
                    is_promo, promo_color, show_promo_last_units, is_new_product,
                    show_device_rule, product_details, is_event_link,
                    event_link_unit_cost, event_link_monthly_cost
                ) VALUES (?, ?, NULL, 'correo', 1, 'COP', 0, NULL, 0, 0, 1, ?, 0, 3000, 20000)`,
                [PLATFORM_NAME, PLATFORM_SLUG, PRODUCT_DETAILS]
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
