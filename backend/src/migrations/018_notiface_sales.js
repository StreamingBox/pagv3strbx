const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "018_notiface_sales",
    name: "Add NotiFace sales audit table",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS notiface_sales (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NULL,
                order_code VARCHAR(64) NULL,
                conversation_code VARCHAR(64) NULL,
                face VARCHAR(64) NULL,
                buyer_name VARCHAR(160) NULL,
                listing_name VARCHAR(160) NULL,
                platform_alias VARCHAR(160) NULL,
                platform_price_id INT NULL,
                status ENUM('sold', 'failed') NOT NULL DEFAULT 'sold',
                error_message TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_notiface_sales_code (conversation_code),
                INDEX idx_notiface_sales_order (order_id),
                INDEX idx_notiface_sales_created (created_at)
            )
        `);

        await query("CREATE INDEX idx_notiface_sales_code ON notiface_sales(conversation_code)", [], { ignoreCodes: IGNORE_DUP_KEY });
        await query("CREATE INDEX idx_notiface_sales_order ON notiface_sales(order_id)", [], { ignoreCodes: IGNORE_DUP_KEY });
        await query("CREATE INDEX idx_notiface_sales_created ON notiface_sales(created_at)", [], { ignoreCodes: IGNORE_DUP_KEY });
    },
};
