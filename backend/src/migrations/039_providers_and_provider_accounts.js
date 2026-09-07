module.exports = {
    id: "039_providers_and_provider_accounts",
    name: "Create providers and provider accounts modules",

    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS providers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(160) NOT NULL,
                contact_email VARCHAR(190) NULL,
                notes TEXT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_providers_name (name),
                INDEX idx_providers_active_name (is_active, name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS provider_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                provider_id INT NOT NULL,
                platform_id INT NOT NULL,
                account_email VARCHAR(190) NOT NULL,
                account_password TEXT NOT NULL,
                purchase_date DATE NOT NULL,
                expires_at DATE NOT NULL,
                ip_address VARCHAR(64) NULL,
                amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                currency VARCHAR(3) NOT NULL DEFAULT 'COP',
                status VARCHAR(16) NOT NULL DEFAULT 'active',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_provider_accounts_provider_status (provider_id, status),
                INDEX idx_provider_accounts_platform_status (platform_id, status),
                INDEX idx_provider_accounts_expires_status (expires_at, status),
                CONSTRAINT fk_provider_accounts_provider
                    FOREIGN KEY (provider_id) REFERENCES providers(id)
                    ON UPDATE CASCADE ON DELETE RESTRICT,
                CONSTRAINT fk_provider_accounts_platform
                    FOREIGN KEY (platform_id) REFERENCES platforms(id)
                    ON UPDATE CASCADE ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
};
