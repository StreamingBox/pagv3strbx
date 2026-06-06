const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "009_platform_device_usage_rule",
    name: "Add platform device usage rule toggle",
    async up({ query }) {
        await query(
            "ALTER TABLE platforms ADD COLUMN show_device_rule TINYINT(1) NOT NULL DEFAULT 1",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
