-- RLS 정책 수정 스크립트
-- Supabase 대시보드 > SQL Editor에서 실행하세요

-- 기존 정책 삭제 (있는 경우)
DROP POLICY IF EXISTS "Anyone can upload charts" ON charts;

-- 새로운 정책 생성: 인증 여부와 관계없이 누구나 pending 상태로 업로드 가능
CREATE POLICY "Anyone can upload charts"
  ON charts FOR INSERT
  TO public
  WITH CHECK (status = 'pending');

-- 정책 확인
SELECT * FROM pg_policies WHERE tablename = 'charts';

