-- Phase 4: AI feedback and interview history.
-- This migration extends the existing sessions table.

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS language_id INTEGER,
    ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS question_snapshot TEXT;

-- Speed up history queries for rooms.
CREATE INDEX IF NOT EXISTS idx_sessions_room_created_at
    ON sessions (room_id, created_at DESC);

-- Speed up recent session history for interviewers.
CREATE INDEX IF NOT EXISTS idx_rooms_interviewer_created_at
    ON rooms (interviewer_id, created_at DESC);

-- Speed up recent session history for candidates.
CREATE INDEX IF NOT EXISTS idx_rooms_candidate_created_at
    ON rooms (candidate_id, created_at DESC);