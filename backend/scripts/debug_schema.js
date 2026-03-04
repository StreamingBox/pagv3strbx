const pool = require("./src/db");

async function debug() {
    try {
        const [rows] = await pool.query("DESCRIBE wallet_transactions");
        console.log("COLUMNS OF wallet_transactions:");
        console.table(rows);

        const [users] = await pool.query("SELECT id, email FROM users LIMIT 10");
        console.log("SAMPLE USERS:");
        console.table(users);

        const [trans] = await pool.query(`
            SELECT t.*, w.user_id as owner_id, u.email as owner_email
            FROM wallet_transactions t
            JOIN wallets w ON t.wallet_id = w.id
            JOIN users u ON w.user_id = u.id
            LIMIT 5
        `);
        console.log("SAMPLE TRANSACTIONS WITH OWNER:");
        console.table(trans);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

debug();
