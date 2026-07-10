const dns = require("node:dns");
const mysql = require("mysql2/promise");
const { buildDbConfig } = require("./utils/dbConfig");

dns.setDefaultResultOrder(process.env.DB_DNS_RESULT_ORDER || "ipv4first");

const pool = mysql.createPool(buildDbConfig());

module.exports = pool;
