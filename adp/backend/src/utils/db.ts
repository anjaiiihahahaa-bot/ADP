import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import { logger } from './logger';

let pgPool: PgPool | null = null;
let mysqlPool: mysql.Pool | null = null;

export type DbEngine = 'postgresql' | 'mariadb';

export function getDbEngine(): DbEngine {
  const raw = (process.env.DB_ENGINE || 'postgresql').trim().toLowerCase();
  // Backward compatibility with the installer and older .env files.
  if (raw === 'postgres' || raw === 'postgresql') return 'postgresql';
  if (raw === 'mariadb' || raw === 'mysql') return 'mariadb';
  throw new Error(`Unsupported DB_ENGINE '${raw}'. Use postgresql or mariadb.`);
}

function dbConfig(key: 'HOST' | 'PORT' | 'NAME' | 'USER' | 'PASSWORD', fallback: string): string {
  const canonical = process.env[`DB_${key}`];
  if (canonical !== undefined && canonical !== '') return canonical;
  const prefix = getDbEngine() === 'postgresql' ? 'POSTGRES' : 'MARIADB';
  const legacyKey = key === 'NAME' ? 'DB' : key;
  return process.env[`${prefix}_${legacyKey}`] || fallback;
}


export async function initDb(): Promise<void> {
  const engine = getDbEngine();
  if (engine === 'postgresql') {
    pgPool = new PgPool({
      host: dbConfig('HOST', 'localhost'),
      port: parseInt(dbConfig('PORT', '5432'), 10),
      database: dbConfig('NAME', 'adp'),
      user: dbConfig('USER', 'adp'),
      password: dbConfig('PASSWORD', ''),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    await pgPool.query('SELECT 1');
    logger.info('PostgreSQL connected');
  } else {
    mysqlPool = mysql.createPool({
      host: dbConfig('HOST', 'localhost'),
      port: parseInt(dbConfig('PORT', '3306'), 10),
      database: dbConfig('NAME', 'adp'),
      user: dbConfig('USER', 'adp'),
      password: dbConfig('PASSWORD', ''),
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
    });
    await mysqlPool.query('SELECT 1');
    logger.info('MariaDB connected');
  }
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  try {
    if (getDbEngine() === 'postgresql' && pgPool) {
      const result = await pgPool.query(sql, params);
      return result.rows as T[];
    } else if (mysqlPool) {
      const [rows] = await mysqlPool.execute(sql, params);
      return rows as T[];
    }
    throw new Error('Database not initialized');
  } catch (err) {
    logger.error('DB query error', { sql: sql.substring(0, 100), err });
    throw err;
  }
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function getDbPool() {
  return getDbEngine() === 'postgresql' ? pgPool : mysqlPool;
}
