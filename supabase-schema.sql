-- Supabase Schema for Chart Sharing

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Charts table
CREATE TABLE IF NOT EXISTS charts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  bpm NUMERIC NOT NULL,
  preview_image TEXT,
  difficulty TEXT,
  data_json TEXT NOT NULL,
  youtube_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  play_count INTEGER DEFAULT 0
);

-- Chart reviews table (for approval logs)
CREATE TABLE IF NOT EXISTS chart_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chart_id UUID NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_charts_status ON charts(status);
CREATE INDEX IF NOT EXISTS idx_charts_created_at ON charts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charts_play_count ON charts(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_chart_reviews_chart_id ON chart_reviews(chart_id);

-- Function to increment play count
CREATE OR REPLACE FUNCTION increment_play_count(chart_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE charts SET play_count = play_count + 1 WHERE id = chart_id;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) Policies
ALTER TABLE charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_reviews ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read approved charts
CREATE POLICY "Public can view approved charts"
  ON charts FOR SELECT
  USING (status = 'approved');

-- Policy: Anyone can insert charts (as pending)
CREATE POLICY "Anyone can upload charts"
  ON charts FOR INSERT
  WITH CHECK (status = 'pending');

-- Policy: Only allow reading own pending/rejected charts (optional, for future user auth)
-- This can be expanded when user authentication is added

-- Policy: Chart reviews are read-only for public
CREATE POLICY "Public can view chart reviews"
  ON chart_reviews FOR SELECT
  USING (true);

-- Storage bucket for preview images
-- Run this in Supabase Dashboard > Storage:
-- 1. Create a new bucket named 'chart-images'
-- 2. Make it public
-- 3. Set file size limit (e.g., 5MB)

-- Note: Admin operations (approve/reject) should be done with service role key
-- or through a secure backend endpoint with proper authentication








