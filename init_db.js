require('dotenv').config();
const db = require('./api/db.js');

async function init() {
  try {
    console.log('Connecting to database...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('users table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        user_id VARCHAR(36) PRIMARY KEY,
        data JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('profiles table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        user_id VARCHAR(36),
        date_str VARCHAR(10),
        data JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, date_str),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('diary_entries table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS weight_logs (
        user_id VARCHAR(36),
        date_str VARCHAR(10),
        weight DECIMAL(5,1) NOT NULL,
        PRIMARY KEY (user_id, date_str),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('weight_logs table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id VARCHAR(36) PRIMARY KEY,
        streaks JSON,
        achievements JSON,
        counters JSON,
        food_freq JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('user_stats table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS coach_conversations (
        user_id VARCHAR(36) PRIMARY KEY,
        data JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('coach_conversations table created');

    console.log('All tables created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error creating tables:', err);
    process.exit(1);
  }
}

init();
