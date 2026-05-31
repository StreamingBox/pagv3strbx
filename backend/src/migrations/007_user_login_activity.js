const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "007_user_login_activity",
    name: "Track user login activity",
    async up({ query }) {
        await query("ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL DEFAULT NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });

        await query(`
            CREATE TABLE IF NOT EXISTS user_devices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                device_fingerprint CHAR(64) NOT NULL,
                device_label VARCHAR(160) NULL,
                device_type VARCHAR(40) NULL,
                browser_name VARCHAR(80) NULL,
                os_name VARCHAR(80) NULL,
                ip_address VARCHAR(64) NULL,
                user_agent VARCHAR(512) NULL,
                first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                login_count INT NOT NULL DEFAULT 0,
                last_event VARCHAR(32) NOT NULL DEFAULT 'login',
                UNIQUE KEY uq_user_devices_user_fingerprint (user_id, device_fingerprint),
                INDEX idx_user_devices_user_seen (user_id, last_seen_at),
                INDEX idx_user_devices_fingerprint (device_fingerprint)
            )
        `);

        await query("ALTER TABLE user_devices ADD COLUMN device_label VARCHAR(160) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_devices ADD COLUMN device_type VARCHAR(40) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_devices ADD COLUMN browser_name VARCHAR(80) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_devices ADD COLUMN os_name VARCHAR(80) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_devices ADD COLUMN ip_address VARCHAR(64) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_devices ADD COLUMN user_agent VARCHAR(512) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_devices ADD COLUMN login_count INT NOT NULL DEFAULT 0", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_devices ADD COLUMN last_event VARCHAR(32) NOT NULL DEFAULT 'login'", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("CREATE UNIQUE INDEX uq_user_devices_user_fingerprint ON user_devices(user_id, device_fingerprint)", [], { ignoreCodes: IGNORE_DUP_KEY });
        await query("CREATE INDEX idx_user_devices_user_seen ON user_devices(user_id, last_seen_at)", [], { ignoreCodes: IGNORE_DUP_KEY });
        await query("CREATE INDEX idx_user_devices_fingerprint ON user_devices(device_fingerprint)", [], { ignoreCodes: IGNORE_DUP_KEY });

        await query(`
            CREATE TABLE IF NOT EXISTS user_login_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                event_type VARCHAR(32) NOT NULL DEFAULT 'login',
                device_fingerprint CHAR(64) NULL,
                device_label VARCHAR(160) NULL,
                device_type VARCHAR(40) NULL,
                browser_name VARCHAR(80) NULL,
                os_name VARCHAR(80) NULL,
                ip_address VARCHAR(64) NULL,
                user_agent VARCHAR(512) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_login_events_user_created (user_id, created_at),
                INDEX idx_user_login_events_fingerprint (device_fingerprint)
            )
        `);

        await query("ALTER TABLE user_login_events ADD COLUMN event_type VARCHAR(32) NOT NULL DEFAULT 'login'", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_login_events ADD COLUMN device_fingerprint CHAR(64) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_login_events ADD COLUMN device_label VARCHAR(160) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_login_events ADD COLUMN device_type VARCHAR(40) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_login_events ADD COLUMN browser_name VARCHAR(80) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_login_events ADD COLUMN os_name VARCHAR(80) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_login_events ADD COLUMN ip_address VARCHAR(64) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE user_login_events ADD COLUMN user_agent VARCHAR(512) NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("CREATE INDEX idx_user_login_events_user_created ON user_login_events(user_id, created_at)", [], { ignoreCodes: IGNORE_DUP_KEY });
        await query("CREATE INDEX idx_user_login_events_fingerprint ON user_login_events(device_fingerprint)", [], { ignoreCodes: IGNORE_DUP_KEY });
    },
};
