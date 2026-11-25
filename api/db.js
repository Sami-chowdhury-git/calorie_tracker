const mysql = require('mysql2/promise');

let uri = process.env.MYSQL_URL || '';
if (uri.includes('?')) {
  uri = uri.split('?')[0];
}

const pool = mysql.createPool({
  uri,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
