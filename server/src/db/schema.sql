-- AI Implementation Simulator - Database Schema
-- Meaningful AI Owl Agent Workshop

-- Enable pgvector for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Workshop Sessions
CREATE TABLE IF NOT EXISTS workshop_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  avatar_url TEXT,
  avatar_data TEXT,  -- base64 avatar stored server-side (survives browser clear)
  company_name TEXT,
  company_url TEXT,
  company_context TEXT,
  industry TEXT,
  path TEXT DEFAULT 'discovery',
  current_gear INT DEFAULT 1,
  current_phase TEXT DEFAULT '1.1',
  completed_phases TEXT[] DEFAULT '{}',
  current_agent TEXT DEFAULT 'poly',
  chat_history JSONB DEFAULT '[]',
  session_data JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ DEFAULT NULL,  -- soft delete: NULL = not deleted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration helper: add columns if they don't exist (safe for re-runs)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workshop_sessions' AND column_name = 'avatar_data') THEN
    ALTER TABLE workshop_sessions ADD COLUMN avatar_data TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workshop_sessions' AND column_name = 'deleted_at') THEN
    ALTER TABLE workshop_sessions ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

-- API Usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES workshop_sessions(id),
  service TEXT NOT NULL,
  model TEXT,
  type TEXT DEFAULT 'text',
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  units INT DEFAULT 1,
  cost_estimate NUMERIC(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content chunks for RAG (Meaningful AI knowledge base)
-- Note: pgvector extension and embedding column added when RAG is set up
CREATE TABLE IF NOT EXISTS content_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_name TEXT,
  section TEXT,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_count INT DEFAULT 0,
  embedding vector(768),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback signals for reinforcement learning
CREATE TABLE IF NOT EXISTS feedback_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES workshop_sessions(id),
  phase TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value NUMERIC NOT NULL,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deliverables (implementation plans, strategy briefs)
CREATE TABLE IF NOT EXISTS deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES workshop_sessions(id),
  title TEXT,
  content_markdown TEXT,
  content_html TEXT,
  deliverable_type TEXT DEFAULT 'implementation_plan',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_active ON workshop_sessions(is_active);
-- CREATE INDEX IF NOT EXISTS idx_content_embedding ON content_chunks
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX IF NOT EXISTS idx_api_usage_session ON api_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_session ON deliverables(session_id);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_workshop_sessions_updated_at ON workshop_sessions;
CREATE TRIGGER update_workshop_sessions_updated_at
  BEFORE UPDATE ON workshop_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
