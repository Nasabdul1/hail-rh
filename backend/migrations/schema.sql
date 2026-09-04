CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  address VARCHAR(42) UNIQUE NOT NULL,
  username VARCHAR(32),
  bio VARCHAR(256),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calls (
  id SERIAL PRIMARY KEY,
  call_id BIGINT NOT NULL UNIQUE,
  caller VARCHAR(42) NOT NULL,
  recipient VARCHAR(42) NOT NULL,
  value VARCHAR(64) DEFAULT '0',
  answered BOOLEAN DEFAULT FALSE,
  ended BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calls_caller_idx ON calls(caller);
CREATE INDEX IF NOT EXISTS calls_recipient_idx ON calls(recipient);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  owner VARCHAR(42) NOT NULL,
  address VARCHAR(42) NOT NULL,
  name VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(owner, address)
);

CREATE TABLE IF NOT EXISTS tokens (
  id SERIAL PRIMARY KEY,
  address VARCHAR(42) UNIQUE NOT NULL,
  creator VARCHAR(42) NOT NULL,
  name VARCHAR(64),
  symbol VARCHAR(16),
  supply VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);
