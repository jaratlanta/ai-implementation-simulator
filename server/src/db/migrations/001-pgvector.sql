-- Migration 001: Enable pgvector and add embedding column to content_chunks
-- Run: psql $DATABASE_URL -f server/src/db/migrations/001-pgvector.sql

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE content_chunks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- IVFFlat index for fast cosine similarity search
-- Note: requires at least 1 row with embedding before creating
-- CREATE INDEX IF NOT EXISTS idx_content_embedding
--   ON content_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- For small datasets (<1000 rows), use exact search instead (no index needed)
-- pgvector will do sequential scan which is fast enough
