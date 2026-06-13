const mysql = require("mysql2/promise");
const { buildDbConfig } = require("./utils/dbConfig");

const pool = mysql.createPool(buildDbConfig());

module.exports = pool;
