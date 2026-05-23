module.exports = {
    id: "002_users_status_rejected",
    name: "Allow rejected user status",
    async up({ query }) {
        await query("UPDATE users SET status = 'pending' WHERE status IS NULL OR status = ''");
        await query(`
            ALTER TABLE users
            MODIFY COLUMN status ENUM('active', 'inactive', 'blocked', 'pending', 'rejected')
            NOT NULL DEFAULT 'pending'
        `);
    },
};
