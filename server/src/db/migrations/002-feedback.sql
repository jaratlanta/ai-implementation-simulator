-- Migration 002: Feedback signals for reinforcement learning
-- Run: psql $DATABASE_URL -f server/src/db/migrations/002-feedback.sql

CREATE TABLE IF NOT EXISTS feedback_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES workshop_sessions(id),
  phase TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,  -- 'quick_reply_used', 'message_length', 'phase_velocity', 'explicit_rating', 'completion_depth'
  signal_value NUMERIC NOT NULL,  -- normalized 0-1 or raw value
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback_signals(session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_phase ON feedback_signals(phase, agent_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback_signals(signal_type);
