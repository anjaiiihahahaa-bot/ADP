import bcrypt from 'bcryptjs';
import { query, queryOne } from './db';
import { logger } from './logger';

export async function runMigrations(): Promise<void> {
  logger.info('Running migrations...');

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(64) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin','admin','operator','user')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      totp_enabled BOOLEAN NOT NULL DEFAULT false,
      totp_secret TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT false
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(128) NOT NULL,
      description TEXT,
      owner_id UUID NOT NULL REFERENCES users(id),
      runtime VARCHAR(20) NOT NULL DEFAULT 'nodejs',
      entry_file VARCHAR(255),
      start_command VARCHAR(512),
      working_directory VARCHAR(512) NOT NULL,
      port INTEGER,
      domain VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'stopped',
      pid INTEGER,
      pm2_name VARCHAR(128),
      env_vars JSONB DEFAULT '{}',
      restart_policy VARCHAR(20) NOT NULL DEFAULT 'on-failure',
      max_restarts INTEGER NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS databases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(64) NOT NULL,
      owner_id UUID NOT NULL REFERENCES users(id),
      engine VARCHAR(20) NOT NULL,
      host VARCHAR(128) NOT NULL DEFAULT 'localhost',
      port INTEGER NOT NULL,
      db_username VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(128) NOT NULL,
      resource_type VARCHAR(64) NOT NULL,
      resource_id UUID,
      ip_address VARCHAR(45),
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(128) NOT NULL,
      token_hash TEXT NOT NULL,
      token_prefix VARCHAR(12) NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT '{}',
      expires_at TIMESTAMPTZ,
      last_used TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked BOOLEAN NOT NULL DEFAULT false
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS backup_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(20) NOT NULL,
      resource_id UUID,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      file_path TEXT,
      file_size BIGINT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS metric_history (
      id BIGSERIAL PRIMARY KEY,
      cpu FLOAT,
      mem_used BIGINT,
      mem_total BIGINT,
      disk_used BIGINT,
      disk_total BIGINT,
      net_rx BIGINT,
      net_tx BIGINT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed super_admin from env (only if no users exist yet)
  const adminEnv = {
    username: process.env.ADMIN_USERNAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  };
  if (adminEnv.username && adminEnv.email && adminEnv.password) {
    const existing = await queryOne('SELECT id FROM users WHERE username = $1', [adminEnv.username]);
    if (!existing) {
      const hash = await bcrypt.hash(adminEnv.password, 12);
      await query(
        `INSERT INTO users (username, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, 'super_admin', true)`,
        [adminEnv.username, adminEnv.email, hash]
      );
      logger.info(`Super admin "${adminEnv.username}" created`);
    }
  }

  logger.info('Migrations complete');
}
