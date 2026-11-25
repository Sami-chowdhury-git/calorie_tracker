const mysql = require('mysql2/promise');

let uri = process.env.MYSQL_URL || '';
if (uri.includes('?')) {
  uri = uri.split('?')[0];
}

const pool = mysql.createPool({
  uri,
  waitForConnections: true,
  connectionLimit: 2,
  maxIdle: 1,
  idleTimeout: 10000,
  queueLimit: 0,
  enableKeepAlive: true,
  connectTimeout: 10000,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
