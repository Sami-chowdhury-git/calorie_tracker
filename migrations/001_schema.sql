CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY email (email)
);

CREATE TABLE IF NOT EXISTS app_secrets (
  key_name VARCHAR(64) NOT NULL,
  secret_value VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key_name)
);

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_sessions_user_exp (user_id, expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key VARCHAR(128) NOT NULL,
  window_start BIGINT NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (rate_key)
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id VARCHAR(36) NOT NULL,
  data JSON NOT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_at_ms BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id),
  CONSTRAINT profiles_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diary_entries (
  user_id VARCHAR(36) NOT NULL,
  date_str VARCHAR(10) NOT NULL,
  data JSON NOT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, date_str),
  CONSTRAINT diary_entries_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diary_items (
  user_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  date_str VARCHAR(10) NOT NULL,
  meal_type VARCHAR(16) NOT NULL,
  data JSON NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_id),
  INDEX idx_diary_items_user_date (user_id, date_str),
  INDEX idx_diary_items_user_updated (user_id, updated_at),
  CONSTRAINT diary_items_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS water_entries (
  user_id VARCHAR(36) NOT NULL,
  entry_id VARCHAR(64) NOT NULL,
  date_str VARCHAR(10) NOT NULL,
  ml INT NOT NULL,
  logged_at VARCHAR(40) NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, entry_id),
  INDEX idx_water_user_date (user_id, date_str),
  INDEX idx_water_user_updated (user_id, updated_at),
  CONSTRAINT water_entries_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weight_logs (
  user_id VARCHAR(36) NOT NULL,
  date_str VARCHAR(10) NOT NULL,
  weight DECIMAL(6,2) NOT NULL,
  updated_at_ms BIGINT NOT NULL DEFAULT 0,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date_str),
  CONSTRAINT weight_logs_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id VARCHAR(36) NOT NULL,
  streaks JSON DEFAULT NULL,
  achievements JSON DEFAULT NULL,
  counters JSON DEFAULT NULL,
  food_freq JSON DEFAULT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_at_ms BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id),
  CONSTRAINT user_stats_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coach_conversations (
  user_id VARCHAR(36) NOT NULL,
  data JSON NOT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT coach_conversations_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coach_threads (
  user_id VARCHAR(36) NOT NULL,
  conv_id VARCHAR(64) NOT NULL,
  title VARCHAR(160) NOT NULL,
  messages JSON NOT NULL,
  active_flag TINYINT(1) NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, conv_id),
  INDEX idx_coach_threads_user_updated (user_id, updated_at),
  CONSTRAINT coach_threads_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
