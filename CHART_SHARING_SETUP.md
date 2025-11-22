# 채보 공유 기능 설정 가이드

## 개요

UserRhythm에 온라인 채보 공유 기능이 추가되었습니다. 사용자는 자신이 만든 채보를 업로드하고, 다른 사용자가 만든 채보를 검색하여 플레이할 수 있습니다.

## 주요 기능

1. **채보 업로드**: 에디터에서 만든 채보를 온라인에 공유
2. **채보 선택**: 승인된 채보를 검색, 정렬, 미리보기하여 선택
3. **관리자 승인**: 업로드된 채보를 검토하고 승인/거절
4. **플레이 통계**: 채보 플레이 횟수 자동 집계

## Supabase 설정

### 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 가입하고 새 프로젝트를 생성합니다.
2. 프로젝트 대시보드에서 **Settings > API**로 이동합니다.
3. 다음 정보를 복사합니다:
   - `Project URL` (예: https://xxxxx.supabase.co)
   - `anon public` API Key

### 2. 데이터베이스 스키마 생성

1. Supabase 대시보드에서 **SQL Editor**로 이동합니다.
2. 프로젝트 루트의 `supabase-schema.sql` 파일 내용을 복사하여 실행합니다.
3. 이 스크립트는 다음을 생성합니다:
   - `charts` 테이블: 채보 데이터 저장
   - `chart_reviews` 테이블: 승인/거절 로그
   - 필요한 인덱스 및 함수
   - Row Level Security (RLS) 정책

### 3. Storage 버킷 생성 (선택사항)

미리보기 이미지를 업로드하려면:

1. Supabase 대시보드에서 **Storage**로 이동합니다.
2. 새 버킷 생성: `chart-images`
3. 버킷을 **Public**으로 설정합니다.
4. 파일 크기 제한을 5MB로 설정합니다.

### 4. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가합니다:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Admin Token (for chart approval)
VITE_ADMIN_TOKEN=your_secure_admin_token
```

**주의**: `.env` 파일은 `.gitignore`에 추가하여 Git에 커밋되지 않도록 하세요.

## 사용 방법

### 채보 만들기 및 공유

1. 메인 화면에서 **✏️ 채보 만들기** 클릭
2. 에디터에서 채보 작성
3. 오른쪽 사이드바의 **🌐 채보 공유하기** 버튼 클릭
4. 제목, 작성자, 난이도, 설명 입력
5. **공유하기** 버튼 클릭
6. 업로드 완료 후 관리자 승인 대기

### 채보 선택하기

1. 메인 화면에서 **📚 채보 선택하기** 클릭
2. Supabase 환경 변수가 설정되지 않은 경우 안내 화면이 표시됩니다
   - `.env` 파일에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY` 설정 필요
   - 환경 변수 설정 후 개발 서버 재시작 필요
3. 환경 변수가 설정된 경우:
   - 검색창에서 제목 또는 작성자로 검색
   - 정렬 옵션 선택 (최신순, 인기순, 제목순)
   - 채보 카드 클릭하여 상세 정보 확인
   - **🎮 이 채보로 플레이** 버튼 클릭
4. 채보 로딩 중 오류 발생 시 "다시 시도" 버튼으로 재시도 가능

### 관리자 승인

1. 메인 화면에서 **🔐 관리자** 버튼 클릭
2. 관리자 토큰 입력 (`.env`에 설정한 `VITE_ADMIN_TOKEN`)
3. 대기 중인 채보 목록에서 채보 선택
4. 채보 정보 확인 및 **🎮 채보 테스트** (선택사항)
5. 검토 코멘트 입력 (선택사항)
6. **✅ 승인** 또는 **❌ 거절** 버튼 클릭

## 데이터 구조

### Chart 테이블

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | 채보 고유 ID |
| title | TEXT | 채보 제목 |
| author | TEXT | 작성자 이름 |
| bpm | NUMERIC | BPM |
| preview_image | TEXT | 미리보기 이미지 URL (선택) |
| difficulty | TEXT | 난이도 (Easy/Normal/Hard/Expert) |
| data_json | TEXT | 채보 데이터 (JSON 문자열) |
| youtube_url | TEXT | YouTube URL (선택) |
| description | TEXT | 설명 (선택) |
| status | TEXT | 상태 (pending/approved/rejected) |
| play_count | INTEGER | 플레이 횟수 |
| created_at | TIMESTAMPTZ | 생성 일시 |
| updated_at | TIMESTAMPTZ | 수정 일시 |

### Chart Data JSON 구조

```json
{
  "notes": [
    {
      "id": 1,
      "lane": 0,
      "time": 1000,
      "duration": 0,
      "endTime": 1000,
      "type": "tap"
    }
  ],
  "bpm": 120,
  "timeSignatures": [
    {
      "id": 0,
      "beatIndex": 0,
      "beatsPerMeasure": 4
    }
  ],
  "timeSignatureOffset": 0,
  "youtubeVideoId": "video_id",
  "youtubeUrl": "https://youtube.com/...",
  "playbackSpeed": 1
}
```

## 보안 고려사항

1. **관리자 토큰**: `.env` 파일의 `VITE_ADMIN_TOKEN`을 강력한 비밀번호로 설정하세요.
2. **RLS 정책**: Supabase의 Row Level Security가 활성화되어 있어 승인되지 않은 채보는 공개되지 않습니다.
3. **환경 변수**: `.env` 파일을 절대 Git에 커밋하지 마세요.

## 문제 해결

### "Supabase credentials not configured" 경고

- `.env` 파일이 프로젝트 루트에 있는지 확인
- 환경 변수 이름이 `VITE_` 접두사로 시작하는지 확인
- 개발 서버를 재시작 (`npm run dev`)
- 채보 선택 화면에서 환경 변수 미설정 시 안내 화면이 표시됩니다

### 채보 선택 화면이 빈 화면으로 표시됨

- Supabase 환경 변수가 설정되었는지 확인
- 브라우저 콘솔에서 에러 메시지 확인
- 네트워크 탭에서 API 요청 실패 여부 확인
- "다시 시도" 버튼을 클릭하여 재시도

### 채보 업로드 실패

- Supabase 프로젝트 URL과 API Key가 올바른지 확인
- `supabase-schema.sql`이 정상적으로 실행되었는지 확인
- 브라우저 콘솔에서 에러 메시지 확인

### 채보가 목록에 표시되지 않음

- 채보가 관리자에 의해 승인되었는지 확인 (`status = 'approved'`)
- 검색 필터를 초기화하고 다시 시도
- Supabase 대시보드에서 `charts` 테이블의 `status` 필드 확인
- 페이지네이션을 확인하여 다른 페이지에 있는지 확인

### 채보 선택 후 게임이 시작되지 않음

- 브라우저 콘솔에서 에러 메시지 확인
- 채보 데이터에 유효한 `notes` 배열이 있는지 확인
- 채보 데이터 구조가 올바른지 확인

## 향후 개선 사항

- [ ] 사용자 인증 시스템 추가
- [ ] 채보 평가 및 댓글 기능
- [ ] 미리보기 이미지 업로드 UI
- [ ] 채보 수정 기능
- [ ] 개인 채보 관리 페이지
- [ ] 채보 태그 및 카테고리

## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.

