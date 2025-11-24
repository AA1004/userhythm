-- RLS 정책 완전 수정 스크립트
-- Supabase 대시보드 > SQL Editor에서 실행하세요

-- 1. 기존 정책 삭제
DROP POLICY IF EXISTS "Anyone can upload charts" ON charts;
DROP POLICY IF EXISTS "Public can view approved charts" ON charts;

-- 2. INSERT 정책: 누구나 pending 상태로 업로드 가능
CREATE POLICY "Anyone can upload charts"
  ON charts FOR INSERT
  TO public
  WITH CHECK (status = 'pending');

-- 3. SELECT 정책: 승인된 채보는 누구나 볼 수 있음
CREATE POLICY "Public can view approved charts"
  ON charts FOR SELECT
  TO public
  USING (status = 'approved');

-- 4. SELECT 정책: 관리자가 pending/rejected 채보를 볼 수 있음
-- (현재는 토큰 기반 관리자 인증을 사용하므로, 모든 사용자가 볼 수 있도록 설정)
-- 향후 Supabase 인증을 사용하면 authenticated 사용자만 볼 수 있도록 수정 가능
CREATE POLICY "Admin can view pending charts"
  ON charts FOR SELECT
  TO public
  USING (status IN ('pending', 'rejected'));

-- 5. UPDATE 정책: 관리자가 채보 상태를 업데이트할 수 있음
CREATE POLICY "Admin can update chart status"
  ON charts FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- 6. chart_reviews INSERT 정책: 관리자가 리뷰를 기록할 수 있음
CREATE POLICY "Admin can insert chart reviews"
  ON chart_reviews FOR INSERT
  TO public
  WITH CHECK (true);

-- 7. 정책 확인
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'charts'
ORDER BY policyname;

