require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

const SINCE_UTC = process.env.FIX_EXPIRY_SINCE_UTC || "2026-03-30 00:00:00";
const APPLY = process.argv.includes("--apply");

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        timezone: "Z",
    });

    try {
        const [preview] = await conn.query(
            `
            SELECT
              s.id AS subscription_id,
              s.platform_account_id,
              d.days,
              s.created_at,
              s.expires_at AS current_expires_at,
              DATE(DATE_SUB(DATE_ADD(s.created_at, INTERVAL d.days DAY), INTERVAL 5 HOUR)) AS fixed_subscription_expires_at,
              DATE_ADD(s.created_at, INTERVAL d.days DAY) AS fixed_account_expires_at
            FROM subscriptions s
            JOIN durations d ON d.id = s.duration_id
            WHERE s.status = 'active'
              AND s.created_at >= ?
              AND s.expires_at IS NOT NULL
              AND s.expires_at >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
              AND TIME(s.expires_at) = '00:00:00'
            ORDER BY s.id DESC
            `,
            [SINCE_UTC]
        );

        console.log(`Candidates since ${SINCE_UTC}: ${preview.length}`);
        console.table(preview.slice(0, 20));

        if (!APPLY) {
            console.log("Dry run only. Use --apply to update subscriptions and platform_accounts.");
            return;
        }

        await conn.beginTransaction();

        const [subUpdate] = await conn.query(
            `
            UPDATE subscriptions s
            JOIN durations d ON d.id = s.duration_id
            SET s.expires_at = DATE(DATE_SUB(DATE_ADD(s.created_at, INTERVAL d.days DAY), INTERVAL 5 HOUR))
            WHERE s.status = 'active'
              AND s.created_at >= ?
              AND s.expires_at IS NOT NULL
              AND s.expires_at >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
              AND TIME(s.expires_at) = '00:00:00'
            `,
            [SINCE_UTC]
        );

        const [accUpdate] = await conn.query(
            `
            UPDATE platform_accounts pa
            JOIN subscriptions s ON s.platform_account_id = pa.id
            JOIN durations d ON d.id = s.duration_id
            SET pa.expires_at = DATE_ADD(s.created_at, INTERVAL d.days DAY)
            WHERE s.status = 'active'
              AND s.created_at >= ?
              AND s.expires_at IS NOT NULL
              AND s.expires_at >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
              AND TIME(s.expires_at) = '00:00:00'
            `,
            [SINCE_UTC]
        );

        await conn.commit();

        console.log("Updated subscriptions:", subUpdate.affectedRows);
        console.log("Updated platform_accounts:", accUpdate.affectedRows);
    } catch (error) {
        try {
            await conn.rollback();
        } catch {}
        throw error;
    } finally {
        await conn.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
