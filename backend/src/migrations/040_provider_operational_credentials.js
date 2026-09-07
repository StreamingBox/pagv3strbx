const IGNORE_DUPLICATE_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "040_provider_operational_credentials",
    name: "Store provider WhatsApp and code page credentials",

    async up({ query }) {
        await query(
            "ALTER TABLE providers ADD COLUMN whatsapp_number VARCHAR(40) NULL AFTER name",
            [],
            { ignoreCodes: IGNORE_DUPLICATE_COLUMN }
        );
        await query(
            "ALTER TABLE providers ADD COLUMN code_page_url VARCHAR(500) NULL AFTER whatsapp_number",
            [],
            { ignoreCodes: IGNORE_DUPLICATE_COLUMN }
        );
        await query(
            "ALTER TABLE providers ADD COLUMN code_page_username VARCHAR(190) NULL AFTER code_page_url",
            [],
            { ignoreCodes: IGNORE_DUPLICATE_COLUMN }
        );
        await query(
            "ALTER TABLE providers ADD COLUMN code_page_password TEXT NULL AFTER code_page_username",
            [],
            { ignoreCodes: IGNORE_DUPLICATE_COLUMN }
        );

        // Preserve URLs that were previously entered in the legacy contact field.
        await query(`
            UPDATE providers
               SET code_page_url = contact_email,
                   contact_email = NULL
             WHERE (code_page_url IS NULL OR TRIM(code_page_url) = '')
               AND contact_email REGEXP '^https?://'
        `);
    },
};
