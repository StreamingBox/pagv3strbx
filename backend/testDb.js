require('dotenv').config();
const pool = require('./src/db');
pool.query("SELECT * FROM order_items LIMIT 5").then(r => console.log(r[0])).catch(console.error).finally(() => process.exit());
