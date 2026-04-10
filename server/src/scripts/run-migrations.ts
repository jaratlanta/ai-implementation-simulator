/**
 * Run database migrations
 * Run: cd server && npx tsx src/scripts/run-migrations.ts
 */
import 'dotenv/config';
import { query, closePool } from '../db/index.js';

async function main() {
    console.log('=== Running Database Migrations ===\n');

    // Migration 001: pgvector
    console.log('001: Enabling pgvector extension...');
    await query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('  ✓ pgvector extension enabled');

    await query('ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS embedding vector(768)');
    console.log('  ✓ embedding column added to content_chunks');

    await query("ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'");
    console.log('  ✓ tags column added to content_chunks');

    // Migration 002: feedback signals
    console.log('\n002: Creating feedback_signals table...');
    await query(`CREATE TABLE IF NOT EXISTS feedback_signals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES workshop_sessions(id),
        phase TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        signal_value NUMERIC NOT NULL,
        context JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query('CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback_signals(session_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_feedback_phase ON feedback_signals(phase, agent_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_signals(signal_type)');
    console.log('  ✓ feedback_signals table and indexes created');

    // Verify
    const chunks = await query('SELECT COUNT(*) as c FROM content_chunks');
    const hasEmbCol = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'content_chunks' AND column_name = 'embedding'");
    console.log(`\n=== Verification ===`);
    console.log(`content_chunks: ${chunks.rows[0].c} rows`);
    console.log(`embedding column: ${hasEmbCol.rows.length > 0 ? '✓ exists' : '✗ missing'}`);
    console.log(`\n✅ All migrations complete`);

    await closePool();
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
