require('dotenv').config();
const pool = require('./src/db');
pool.query('DESCRIBE order_items').then(r => console.log(r[0])).catch(console.error).finally(() => process.exit());
