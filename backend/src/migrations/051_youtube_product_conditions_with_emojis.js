const {
    DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS,
    DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS,
} = require("../utils/youtubeMusic");

module.exports = {
    id: "051_youtube_product_conditions_with_emojis",
    name: "Clarify YouTube Music and three-month purchase conditions",
    async up({ query }) {
        await query(
            `UPDATE platforms
                SET product_details = ?
              WHERE LOWER(name) LIKE '%youtube music%'
                 OR LOWER(slug) LIKE '%youtube-music%'`,
            [DEFAULT_YOUTUBE_MUSIC_PRODUCT_DETAILS]
        );
        await query(
            `UPDATE platforms
                SET product_details = ?
              WHERE LOWER(name) LIKE '%youtube%3%mes%'
                 OR LOWER(slug) LIKE '%youtube%3%mes%'
                 OR LOWER(name) LIKE '%youtube%3%month%'
                 OR LOWER(slug) LIKE '%youtube%3%month%'`,
            [DEFAULT_YOUTUBE_THREE_MONTHS_PRODUCT_DETAILS]
        );
    },
};
