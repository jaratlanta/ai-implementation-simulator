/**
 * Database connection and query utilities
 * Supports local PostgreSQL, Neon (serverless), and AWS RDS
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL || '';
const isRDS = dbUrl.includes('rds.amazonaws.com');
const isNeon = dbUrl.includes('neon.tech');
const isCloudDB = isRDS || isNeon || dbUrl.includes('supabase.co');

// SSL config: required for Neon, RDS, and other cloud providers
const sslConfig = isCloudDB ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString: dbUrl,
  max: isNeon ? 10 : 100, // Increased for 50 concurrent workshop users
  idleTimeoutMillis: isNeon ? 10000 : 30000, // Neon closes idle connections faster
  connectionTimeoutMillis: 10000,
  ssl: sslConfig,
});

pool.on('connect', () => {
  console.log('[DB] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  process.exit(-1);
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 100) {
      console.warn('[DB] SLOW Query:', { text: text.substring(0, 80), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error('[DB] Query FAILED after', duration, 'ms:', { text: text.substring(0, 80), error });
    throw error;
  }
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

export async function closePool(): Promise<void> {
  await pool.end();
  console.log('[DB] Pool closed');
}

export default pool;
