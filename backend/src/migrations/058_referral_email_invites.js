module.exports = {
    id: "058_referral_email_invites",
    name: "Add single-use email referral invitations",
    async up({ query }) {
        await query(`CREATE TABLE IF NOT EXISTS referral_email_invites (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            referrer_user_id BIGINT UNSIGNED NOT NULL,
            recipient_email VARCHAR(254) NOT NULL,
            recipient_email_key VARCHAR(254) NOT NULL,
            token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
            referral_code CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            settings_version INT UNSIGNED NOT NULL,
            reward_amount DECIMAL(12,2) NOT NULL,
            minimum_topup DECIMAL(12,2) NOT NULL,
            attribution_days SMALLINT UNSIGNED NOT NULL,
            expires_at DATETIME NOT NULL,
            sent_at DATETIME NULL,
            used_at DATETIME NULL,
            registered_user_id BIGINT UNSIGNED NULL,
            revoked_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_referral_invite_recipient (recipient_email_key),
            INDEX idx_referral_invite_referrer_created (referrer_user_id, created_at, id),
            INDEX idx_referral_invite_expiry (expires_at, used_at, revoked_at)
        ) ENGINE=InnoDB`);
    },
};
