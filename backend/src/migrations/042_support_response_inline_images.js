module.exports = {
    id: "042_support_response_inline_images",
    name: "Store inline images for support responses",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS support_response_attachments (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                ticket_id BIGINT NOT NULL,
                event_id BIGINT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(160) NOT NULL,
                file_mime VARCHAR(100) NOT NULL,
                file_size INT UNSIGNED NOT NULL DEFAULT 0,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_support_response_attachments_ticket (ticket_id, event_id, sort_order, id)
            )
        `);
    },
};
