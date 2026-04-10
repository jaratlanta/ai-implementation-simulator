/**
 * Database migration runner
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query, closePool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
    console.log('[Migration] Starting...');

    try {
        const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
        await query(schema);
        console.log('[Migration] Schema applied successfully');
    } catch (error) {
        console.error('[Migration] Failed:', error);
        process.exit(1);
    } finally {
        await closePool();
    }
}

migrate();
