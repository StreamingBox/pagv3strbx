const PLATFORM_SLUG = "google-ai-plus";
const TRIAL_ELIGIBILITY = "**PRUEBA: Solo funciona en cuentas de Google que no tengan planes anteriores ni planes activos.**";

module.exports = {
    id: "062_google_ai_plus_trial_eligibility",
    name: "Add Google AI PLUS trial eligibility condition",
    async up({ query }) {
        const [platformRows] = await query(
            "SELECT id, product_details FROM platforms WHERE slug = ? LIMIT 1",
            [PLATFORM_SLUG]
        );
        if (!platformRows.length) return;

        const details = String(platformRows[0].product_details || "").trim();
        if (details.includes(TRIAL_ELIGIBILITY)) return;

        await query(
            "UPDATE platforms SET product_details = ? WHERE id = ?",
            [details ? `${details}\n${TRIAL_ELIGIBILITY}` : TRIAL_ELIGIBILITY, platformRows[0].id]
        );
    },
};
