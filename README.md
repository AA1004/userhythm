# UseRhythm

누구나 리듬게임 채보를 만들고 공유할 수 있는 4키 리듬게임입니다.

## 🎮 주요 기능

### 게임 플레이
- 4개의 레인에서 노트가 떨어지는 리듬게임
- 실시간 점수 및 콤보 표시
- 정확도 계산
- 판정 피드백 애니메이션
- YouTube 음악과 동기화
- INSANE 난이도 모드(전용 필터/테마)
- 글로벌/채보별/유저별 리더보드
- 작성자 배지/체스 말 표시 (ADMIN/MOD 표시)
- 채보 마지막 노트 기반으로 자동 종료 시간 계산

### 채보 에디터
- **비주얼 에디터**: 마우스로 노트를 쉽게 배치
- **YouTube 연동**: YouTube URL을 입력하면 자동으로 음악 로드
- **BPM 분석**: 자동 BPM 감지 또는 수동 입력
- **타임라인 편집**: 확대/축소, 스크롤, 재생선 이동
- **롱노트 지원**: 탭 노트와 홀드 노트 모두 지원
- **BGA 가림 구간**: 구간별 숨김/표시, 페이드 인/아웃 또는 하드컷 설정
- **자막 페이드 미리보기**: 에디터 미리보기에서도 fade in/out 반영
- **실시간 테스트**: 에디터에서 바로 채보 테스트 (BGA 가림 구간 포함)
- **자동 저장**: 작업 중인 채보 자동 저장
- **업로드 개선**: 로그인 닉네임 자동 기입, 새 백엔드 업로드 지원
- **키음**: 퍼커션 계열 샘플, 볼륨 슬라이더 지원

### 채보 공유
- **온라인 공유**: 만든 채보를 온라인에 업로드
- **Preview 이미지**: 채보에 미리보기 이미지 추가
- **채보 검색**: 제목, 작성자로 채보 검색
- **정렬 기능**: 최신순, 인기순, 제목순 정렬
- **관리자 승인**: 업로드된 채보 승인/거절 시스템

## 📦 설치 방법 (요약임 자세한 건 개발자에게 직접 문의)

### 필수 요구사항
- Node.js 18 이상
- npm 또는 yarn

### 설치

```bash
# 저장소 클론
git clone https://github.com/your-username/userhythm.git
cd userhythm

# 의존성 설치
npm install

# (옵션) 백엔드 의존성
# 백엔드가 `backend/` (Next.js + Prisma)인 경우
# cd backend && npm install
```

## 🚀 실행 방법

### 개발 모드

```bash
# 클라이언트 실행 (Vite)
npm run dev

# (옵션) 백엔드 실행
# cd backend && npm run dev
```

브라우저에서 `http://localhost:5173` (또는 표시된 포트)로 접속하세요.

### 개별 실행

```bash
# 클라이언트만 실행
npm run dev:client

# 서버만 실행
npm run dev:server
```

### 프로덕션 빌드

```bash
# 빌드
npm run build

# 빌드된 파일 미리보기
npm run preview
```

## 🎯 조작 방법

### 게임 플레이
- **D** 키 : 첫 번째 레인
- **F** 키 : 두 번째 레인
- **J** 키 : 세 번째 레인
- **K** 키 : 네 번째 레인

### 채보 에디터
- **마우스 클릭**: 노트 삭제
- **스페이스바**: 재생/일시정지
- **마우스 드래그**: 재생선 이동
- **A,S,D,F**: 각각 1,2,3,4번 레인에 해당당
- **Ctrl + Z**: 실행 취소
- **Ctrl + Y**: 다시 실행

## 📊 게임 판정 (기본값)
- 노트가 판정선에 도달할 때 해당 레인 키 입력
- 기본 등급 예시 (judgeConfig.ts에서 조절 가능)
  - **PERFECT**: ±40ms
  - **GREAT**: ±80ms
  - **GOOD**: ±160ms
  - **MISS**: 타이밍 실패/미입력

## ⚙️ 환경 변수 설정

### 기본 설정 (선택사항)

프로젝트 루트에 `.env` 파일을 생성:

```env
# Supabase Configuration (채보 공유 기능 사용 시)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Admin Token (관리자 기능 사용 시)
VITE_ADMIN_TOKEN=your_secure_admin_token
```



## 🌐 채보 공유 기능 설정

채보 공유 기능을 사용하려면 Supabase 설정이 필요합니다.

자세한 설정 방법은 [CHART_SHARING_SETUP.md](./CHART_SHARING_SETUP.md)를 참고하세요.

### 빠른 설정

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. `supabase-schema.sql` 파일을 SQL Editor에서 실행
3. Storage에 `chart-images` 버킷 생성 (Public)
4. `.env` 파일에 Supabase 정보 추가

## 🎵 YouTube 연동

### 서버 설정

YouTube 다운로드를 위해 `yt-dlp`가 필요합니다:

**Windows:**
```bash
winget install yt-dlp
```

**macOS:**
```bash
brew install yt-dlp
```

**Linux:**
```bash
pip install yt-dlp
```

서버가 실행 중이어야 YouTube 음악을 사용할 수 있습니다.

## 🚢 배포

### GitHub Pages

이 프로젝트는 GitHub Pages에 배포할 수 있습니다.

자세한 배포 방법은 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참고하세요.

**주의**: GitHub Pages는 정적 사이트만 호스팅하므로 서버 기능(YouTube 다운로드)은 별도 호스팅이 필요합니다.

## 🛠️ 기술 스택 (요약)

### 프론트엔드
- **React 18**: UI 프레임워크
- **TypeScript**: 타입 안정성
- **Vite**: 빌드 도구
- **Supabase**: 인증/프로필/저장소(선택)

### 백엔드
- **Next.js (app router)** in `backend/`
- **Prisma** + DB (Railway/Postgres 등)
- **(선택) yt-dlp**: YouTube 다운로드/오디오 처리용

### 주요 라이브러리
- **@supabase/supabase-js**: Supabase 클라이언트
- **web-audio-beat-detector**: BPM 분석

## 📁 프로젝트 구조

```
userhythm/
├── src/
│   ├── components/      # React 컴포넌트
│   │   ├── Game.tsx     # 메인 게임 컴포넌트
│   │   ├── ChartEditor.tsx  # 채보 에디터
│   │   ├── ChartSelect.tsx   # 채보 선택 화면
│   │   └── ChartAdmin.tsx    # 관리자 화면
│   ├── utils/          # 유틸리티 함수
│   │   ├── bpmAnalyzer.ts    # BPM 분석
│   │   └── judge.ts          # 판정 로직
│   └── lib/            # 라이브러리 설정
│       └── supabaseClient.ts # Supabase 클라이언트
├── backend/            # Next.js 백엔드 (API, Prisma)
├── supabase-schema.sql # 데이터베이스 스키마
└── vite.config.ts      # Vite 설정
```

## 📚 추가 문서

- [채보 공유 기능 설정 가이드](./CHART_SHARING_SETUP.md)
- [GitHub Pages 배포 가이드](./DEPLOYMENT.md)
- [문제 해결 가이드](./TROUBLESHOOTING.md)

## 🤝 기여하기

ISSUE나 PULL REQUEST를 하면 개발자가 아주 기뻐하면서
폴짝 뛰어오르고, 다음 번 고백을 준비 할 수도 있습니다.

## 📄 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.
