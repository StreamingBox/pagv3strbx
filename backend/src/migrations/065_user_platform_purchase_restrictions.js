module.exports = {
    id: "065_user_platform_purchase_restrictions",
    name: "Add per-user platform purchase restrictions",
    async up({ query }) {
        await query(`CREATE TABLE IF NOT EXISTS user_platform_purchase_restrictions (
            user_id INT NOT NULL,
            platform_id INT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, platform_id),
            INDEX idx_user_platform_purchase_restrictions_platform (platform_id)
        ) ENGINE=InnoDB`);
    },
};
