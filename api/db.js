const mysql = require('mysql2/promise');

let uri = process.env.MYSQL_URL || '';
if (uri.includes('?')) {
  uri = uri.split('?')[0]; // Remove query params like ssl-mode=REQUIRED which mysql2 doesn't like
}

const pool = mysql.createPool({
  uri: uri,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
