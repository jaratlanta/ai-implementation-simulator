// check-level2.ts
import 'dotenv/config';
import { query, closePool } from './src/db/index.js';

async function main() {
    const res = await query(`
        SELECT source_type, COUNT(*) as count 
        FROM content_chunks 
        GROUP BY source_type
    `);
    
    console.log('--- Content Types ---');
    console.table(res.rows);

    await closePool();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
