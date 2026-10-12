const { DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS } = require("../utils/youtubeMusic");

module.exports = {
    id: "049_youtube_music_channel_name_and_terms",
    name: "Store the YouTube Music channel and explain purchase conditions",
    async up({ query }) {
        await query(`
            ALTER TABLE platform_accounts
            ADD COLUMN youtube_channel_name VARCHAR(180) NULL AFTER profile_number
        `);
        await query(
            `UPDATE platforms
                SET product_details = CONCAT(
                    CASE WHEN TRIM(COALESCE(product_details, '')) = '' THEN ''
                         ELSE CONCAT(TRIM(product_details), '\n\n') END,
                    ?
                )
              WHERE (LOWER(name) LIKE '%youtube music%' OR LOWER(slug) LIKE '%youtube-music%')
                AND (product_details IS NULL OR product_details NOT LIKE '%CONDICIONES DE COMPRA - YOUTUBE MUSIC%')`,
            [DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS]
        );
    },
};
