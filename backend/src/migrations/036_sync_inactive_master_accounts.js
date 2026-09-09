module.exports = {
    id: "036_sync_inactive_master_accounts",
    name: "Mark available copies of inactive master accounts as down",
    async up({ query }) {
        await query(`
            UPDATE platform_accounts pa
            JOIN master_accounts ma
              ON ma.platform_id = pa.platform_id
             AND LOWER(TRIM(COALESCE(ma.account_email, ''))) = LOWER(TRIM(COALESCE(pa.email, '')))
             AND ma.status = 'inactive'
               SET pa.status = 'down',
                   pa.updated_at = CURRENT_TIMESTAMP
             WHERE pa.status = 'available'
        `);
    },
};
