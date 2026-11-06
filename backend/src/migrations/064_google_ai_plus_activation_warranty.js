const PLATFORM_SLUGS = ["google-ai-plus", "google-ai-plus-12-meses"];
const ACTIVATION_WARRANTY = "**Garantía de activación**";

module.exports = {
    id: "064_google_ai_plus_activation_warranty",
    name: "Add activation warranty to Google AI PLUS plans",
    async up({ query }) {
        const [platforms] = await query(
            "SELECT id, product_details FROM platforms WHERE slug IN (?, ?)",
            PLATFORM_SLUGS
        );

        for (const platform of platforms) {
            const details = String(platform.product_details || "").trim();
            if (details.includes(ACTIVATION_WARRANTY)) continue;

            await query(
                "UPDATE platforms SET product_details = ? WHERE id = ?",
                [details ? `${details}\n${ACTIVATION_WARRANTY}` : ACTIVATION_WARRANTY, platform.id]
            );
        }
    },
};
