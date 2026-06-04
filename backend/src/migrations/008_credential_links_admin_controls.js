const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "008_credential_links_admin_controls",
    name: "Add admin controls for credential links",
    async up({ query }) {
        await query("ALTER TABLE credential_links ADD COLUMN revoked_at DATETIME NULL DEFAULT NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("ALTER TABLE credential_links ADD COLUMN revoked_by_user_id INT NULL DEFAULT NULL", [], { ignoreCodes: IGNORE_DUP_COLUMN });
        await query("CREATE INDEX idx_credential_links_revoked_at ON credential_links(revoked_at)", [], { ignoreCodes: IGNORE_DUP_KEY });
        await query("CREATE INDEX idx_credential_links_created_at ON credential_links(created_at)", [], { ignoreCodes: IGNORE_DUP_KEY });
    },
};
