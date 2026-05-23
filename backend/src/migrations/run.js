require("dotenv").config({ override: true });

const pool = require("../db");
const { runMigrations } = require("./runner");

runMigrations(pool)
    .then(async () => {
        await pool.end();
    })
    .catch(async (err) => {
        console.error("[migrate] Error:", err?.message || err);
        try {
            await pool.end();
        } catch {
            // ignore shutdown errors
        }
        process.exit(1);
    });
