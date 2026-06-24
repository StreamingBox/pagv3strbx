const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "017_platform_type",
    name: "Add platform account type",
    async up({ query }) {
        await query(
            "ALTER TABLE platforms ADD COLUMN type ENUM('normal', 'correo') DEFAULT 'normal'",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
