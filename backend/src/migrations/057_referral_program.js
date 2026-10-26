module.exports = {
    id: "057_referral_program",
    name: "Add opt-in referral rewards and audit trail",
    async up({ query }) {
        await query(`CREATE TABLE IF NOT EXISTS referral_codes (
            user_id BIGINT UNSIGNED PRIMARY KEY,
            code CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB`);
        await query(`CREATE TABLE IF NOT EXISTS referrals (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            referrer_user_id BIGINT UNSIGNED NOT NULL,
            referred_user_id BIGINT UNSIGNED NOT NULL UNIQUE,
            referral_code CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            settings_version INT UNSIGNED NOT NULL,
            reward_amount DECIMAL(12,2) NOT NULL,
            minimum_topup DECIMAL(12,2) NOT NULL,
            currency CHAR(3) NOT NULL DEFAULT 'COP',
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            reason VARCHAR(50) NULL,
            progress_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            qualifying_topup_id BIGINT UNSIGNED NULL UNIQUE,
            contact_consent_at DATETIME NULL,
            qualified_at DATETIME NULL,
            wallet_transaction_id BIGINT UNSIGNED NULL UNIQUE,
            reversal_transaction_id BIGINT UNSIGNED NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            credited_at DATETIME NULL,
            reversed_at DATETIME NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_referrals_referrer_created (referrer_user_id, created_at, id),
            INDEX idx_referrals_referrer_credit (referrer_user_id, status, credited_at),
            INDEX idx_referrals_status_created (status, created_at, id),
            INDEX idx_referrals_created (created_at, id)
        ) ENGINE=InnoDB`);
        await query(`CREATE TABLE IF NOT EXISTS referral_topups (
            topup_id BIGINT UNSIGNED PRIMARY KEY,
            referral_id BIGINT UNSIGNED NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            approved_at DATETIME NOT NULL,
            INDEX idx_referral_topups_record (referral_id, topup_id)
        ) ENGINE=InnoDB`);
        await query(`CREATE TABLE IF NOT EXISTS referral_budget_usage (
            month_key CHAR(7) PRIMARY KEY,
            total_awarded DECIMAL(12,2) NOT NULL DEFAULT 0
        ) ENGINE=InnoDB`);
        await query(`CREATE TABLE IF NOT EXISTS referral_audit_log (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            referral_id BIGINT UNSIGNED NULL,
            actor_user_id BIGINT UNSIGNED NULL,
            action VARCHAR(40) NOT NULL,
            detail TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_referral_audit_record (referral_id, id)
        ) ENGINE=InnoDB`);
        await query(`INSERT IGNORE INTO app_settings (setting_key, setting_value)
            VALUES ('referral_program_json', ?)`, [JSON.stringify({
            enabled: false, rewardAmount: 10000, minimumTopup: 50000, attributionDays: 30,
            monthlyRewardLimit: 0, monthlyBudget: 0, startsAt: null, endsAt: null, version: 1,
        })]);
    },
};
