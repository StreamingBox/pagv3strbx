const APPLE_TV_CODE_PLATFORM = {
    slug: "appletv",
    name: "Apple TV",
    gmailFrom: "apple.com",
    codeRegex: "([0-9]{6})",
    maxAgeMinutes: 30,
};

module.exports = {
    id: "067_apple_tv_code_platform",
    name: "Configure Apple TV email codes",
    async up({ query }) {
        const [rows] = await query(
            "SELECT id FROM code_platforms WHERE LOWER(slug) = ? LIMIT 1",
            [APPLE_TV_CODE_PLATFORM.slug]
        );

        if (rows.length) {
            await query(
                `UPDATE code_platforms
                 SET name = ?, gmail_from = ?, code_regex = ?, max_age_minutes = ?, is_active = 1
                 WHERE id = ?`,
                [APPLE_TV_CODE_PLATFORM.name, APPLE_TV_CODE_PLATFORM.gmailFrom, APPLE_TV_CODE_PLATFORM.codeRegex,
                    APPLE_TV_CODE_PLATFORM.maxAgeMinutes, rows[0].id]
            );
            return;
        }

        await query(
            `INSERT INTO code_platforms (slug, name, gmail_from, code_regex, max_age_minutes, is_active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [APPLE_TV_CODE_PLATFORM.slug, APPLE_TV_CODE_PLATFORM.name, APPLE_TV_CODE_PLATFORM.gmailFrom,
                APPLE_TV_CODE_PLATFORM.codeRegex, APPLE_TV_CODE_PLATFORM.maxAgeMinutes]
        );
    },
};
