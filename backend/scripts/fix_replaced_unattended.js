require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        timezone: "+00:00",
    });

    try {
        const [[before]] = await conn.query(
            `SELECT
                COUNT(DISTINCT s.id) AS total,
                MIN(arl.created_at) AS first_replacement_at,
                MAX(arl.created_at) AS last_replacement_at
             FROM subscriptions s
             JOIN account_replacement_logs arl ON arl.subscription_id = s.id
             WHERE s.status = 'active'
               AND IFNULL(s.is_attended, 0) = 0`
        );

        const [updateResult] = await conn.query(
            `UPDATE subscriptions s
             JOIN (
                 SELECT DISTINCT subscription_id
                 FROM account_replacement_logs
             ) repl ON repl.subscription_id = s.id
             SET s.is_attended = 1
             WHERE s.status = 'active'
               AND IFNULL(s.is_attended, 0) = 0`
        );

        const [[after]] = await conn.query(
            `SELECT COUNT(DISTINCT s.id) AS total
             FROM subscriptions s
             JOIN account_replacement_logs arl ON arl.subscription_id = s.id
             WHERE s.status = 'active'
               AND IFNULL(s.is_attended, 0) = 0`
        );

        console.log(JSON.stringify({
            ok: true,
            before: {
                total: Number(before?.total || 0),
                firstReplacementAt: before?.first_replacement_at || null,
                lastReplacementAt: before?.last_replacement_at || null,
            },
            updatedRows: Number(updateResult?.affectedRows || 0),
            remaining: Number(after?.total || 0),
        }, null, 2));
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
