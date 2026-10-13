// backend/config/db.js
const mysql = require('mysql2');
require('dotenv').config();
const { makeWithTransaction } = require('./transaction');
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306, 
    charset: 'utf8mb4'
};
if (process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1') {
    dbConfig.ssl = {
        rejectUnauthorized: false
    };
}
const pool = mysql.createPool(dbConfig).promise();
pool.withTransaction = makeWithTransaction(pool);
module.exports = pool;