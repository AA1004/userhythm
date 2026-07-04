# UseRhythm

UseRhythm은 브라우저에서 바로 플레이하고, 직접 채보를 만들고, 다른 유저와 공유할 수 있는 4키 웹 리듬게임입니다.

서비스는 [userhythm.kr](https://userhythm.kr)에서 운영 중입니다. 프론트엔드는 GitHub Pages에 배포되고, 백엔드는 Railway에서 구동됩니다.

## 프로젝트 개요

UseRhythm은 단순한 리듬게임 프로토타입이 아니라, 실제 유저가 곡을 선택하고 플레이하며 채보를 제작, 테스트, 업로드, 승인, 공유할 수 있는 웹 기반 리듬게임 플랫폼을 목표로 만든 프로젝트입니다.

핵심 목표는 세 가지입니다.

- 설치 없이 브라우저에서 리듬게임을 플레이할 수 있을 것
- 유저가 직접 채보를 만들고 즉시 테스트할 수 있을 것
- 고밀도 채보, YouTube BGA, 자막 연출, 롱노트, 설정 커스터마이징이 함께 돌아가도 플레이 경험을 유지할 것

## 주요 기능

**리듬게임 플레이**

- 4키 기반 낙하형 리듬게임
- 단노트와 롱노트 판정
- `PERFECT`, `GREAT`, `GOOD`, `MISS` 판정 체계
- `FAST` / `SLOW` 타이밍 피드백
- 콤보, 정확도, 진행률, 결과 화면
- 레인, 키, 판정선, 슬롯 HUD, 노트 색상 커스터마이징
- 노트 속도, 타이밍 보정, 키 설정 지원
- YouTube 오디오 및 BGA 동기화
- BGA 표시/숨김 구간과 페이드 연출
- 자막 오버레이와 폰트/위치/스타일 설정
- 플레이 횟수와 리더보드 기록

**채보 에디터**

- 타임라인 기반 비주얼 채보 편집
- 마우스 기반 노트 배치, 선택, 이동, 삭제
- 단노트/롱노트 제작
- 그리드 분할 기반 박자 편집
- BPM 변경, 변속, 타임라인 보정
- YouTube URL 연결 및 미리보기
- 에디터 내부 테스트 플레이
- 현재 위치부터 테스트 시작
- BGA Hide/Show 이벤트 편집
- 자막 편집 및 인게임 자막 미리보기
- 기존 업로드 채보 불러오기 및 관리자 수정
- JSON 내보내기/가져오기
- 자동 저장

**온라인 공유와 관리**

- Google 로그인
- 공개 채보 목록
- 채보 검색, 정렬, 썸네일 표시
- 채보별 플레이 횟수
- 채보별/전체 리더보드
- 관리자 승인/삭제 플로우
- ADMIN/MOD 역할 표시
- 기존 채보 수정 기능

**성능과 플레이 안정성**

- Canvas 2D 기반 노트 렌더링
- Pixi/WebGL 렌더러 실험 경로
- React state 개입을 줄인 runtime ref 기반 게임 루프
- 고밀도 노트 처리를 위한 hit/miss Set 관리
- 과거 노트 반복 탐색을 줄이는 scan cursor
- HUD/키/판정 표시 최적화
- New Lite / New Full / Legacy HUD 모드
- YouTube 첫 재생 비용을 줄이기 위한 프리워밍 처리
- Electron Player 기반 GPU 가속 검증 환경

## 기술적 특징

**1. 웹에서 리듬게임 타이밍을 다루기 위한 구조**

게임 시간의 기준은 `currentTimeRef`로 통일했습니다. React state는 UI 스냅샷에 가깝게 사용하고, 실제 판정과 렌더링은 ref 기반 runtime 상태를 우선합니다. 이 구조는 고밀도 구간에서 React 렌더가 판정 루프에 끼어드는 일을 줄이기 위한 선택입니다.

**2. 판정과 시각 표현의 분리**

노트 판정 로직과 노트 렌더 좌표 계산을 분리했습니다. 특히 롱노트는 실제 판정 타이밍과 화면에서 보이는 head/body/tail 계산이 섞이면 버그가 쉽게 발생하므로, 렌더 전용 geometry helper를 별도로 관리합니다.

**3. YouTube 기반 오디오/BGA 동기화**

UseRhythm은 유저가 YouTube URL을 기반으로 채보를 만들 수 있게 설계되어 있습니다. YouTube iframe은 브라우저 정책과 성능 이슈가 많기 때문에, 시작 전 seek/cue, 재생 프리워밍, 큰 오차 중심의 resync, 종료 시 destroy 처리를 분리해서 관리합니다.

**4. 에디터 중심 개발**

플레이만 가능한 게임이 아니라, 채보 제작 자체가 핵심 기능입니다. 그래서 에디터는 배치, 선택, 이동, 테스트, 보정, 자막, BGA 이벤트까지 하나의 흐름에서 다룰 수 있게 구성했습니다.

**5. 실제 운영을 고려한 백엔드**

초기 파일명이나 일부 legacy 코드에는 Supabase 흔적이 남아 있지만, 현재 실제 백엔드는 Railway에서 동작하는 Next.js + Prisma API입니다. 채보, 유저, 점수, 승인 상태, 리더보드 등 서비스 데이터는 Railway/PostgreSQL 기반으로 관리됩니다.

## 기술 스택

**Frontend**

- React 18
- TypeScript
- Vite
- Canvas 2D
- Pixi.js / WebGL 실험 렌더러
- YouTube IFrame API

**Backend**

- Next.js App Router
- Prisma
- PostgreSQL
- Railway
- JWT / cookie 기반 인증
- Google OAuth

**Desktop Player**

- Electron
- Electron Builder
- Windows NSIS / zip 배포
- GPU diagnostics panel

**Deployment**

- GitHub Pages: 프론트엔드 정적 배포
- Railway: 백엔드 API와 DB 연결
- GitHub Actions: 프론트 배포 및 Electron Player 릴리즈 워크플로

## 프로젝트 구조

```text
userhythm/
├── src/
│   ├── components/              # React UI와 게임 화면
│   ├── hooks/                   # 게임 루프, 판정, YouTube, 에디터 훅
│   ├── constants/               # 게임 좌표계, 판정선, 비주얼 설정
│   ├── utils/                   # 판정, 노트 상태, YouTube, profiler 유틸
│   ├── lib/                     # API 클라이언트
│   └── types/                   # 게임/채보 타입
├── backend/
│   ├── src/app/api/             # Next.js API routes
│   ├── prisma/                  # Prisma schema
│   └── env.example              # Railway/backend 환경 변수 예시
├── apps/player/                 # Electron Player
├── public/                      # 정적 리소스
├── .github/workflows/           # GitHub Pages / Player release workflow
└── REGRESSION_TEST_CHECKLIST.md # 플레이 회귀 테스트 체크리스트
```

## 실행 방법

### 요구 사항

- Node.js 20.19.0 이상
- npm
- 백엔드까지 실행할 경우 PostgreSQL 데이터베이스

프론트엔드만 실행:

```bash
npm install
npm run dev:client
```

전체 개발 서버 실행:

```bash
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
```

빌드 결과 미리보기:

```bash
npm run preview
```

## 백엔드 실행

백엔드는 `backend/` 디렉터리에 있습니다.

```bash
cd backend
npm install
npm run prisma:generate
npm run dev
```

환경 변수 예시는 [backend/env.example](backend/env.example)에 있습니다.

주요 환경 변수:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname"
SESSION_SECRET="change-me"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="https://api.userhythm.kr/api/auth/google/callback"
ADMIN_TOKEN="your-admin-token"
COOKIE_DOMAIN=".userhythm.kr"
```

프론트엔드에서 Railway API를 바라보려면 다음 환경 변수를 설정합니다.

```env
VITE_API_BASE="https://api.userhythm.kr"
VITE_ADMIN_TOKEN="your-admin-token"
```

루트의 `npm run dev`는 Vite 프론트엔드와 `backend/`의 Next.js API를 함께 실행합니다. `server/`는 로컬 진단용 legacy 서버이며, 필요한 경우에만 `npm run dev:legacy-server`로 별도 실행합니다.

## Electron Player

UseRhythm Player는 `userhythm.kr`을 Electron 환경에서 실행해 GPU 가속과 BGA 성능을 검증하기 위한 Windows용 플레이어입니다.

개발 실행:

```bash
npm run player:dev
```

설정 검증:

```bash
npm run player:build
```

Windows 배포 패키지 생성:

```bash
npm run player:dist
```

기본 대상 URL은 `https://userhythm.kr`입니다. 필요하면 `PLAYER_TARGET_URL`로 변경할 수 있습니다.

## 게임 조작

기본 키:

- 1번 레인: `D`
- 2번 레인: `F`
- 3번 레인: `J`
- 4번 레인: `K`

설정에서 키 바인딩을 변경할 수 있습니다. 넘패드 키도 일부 지원합니다.

## 에디터 조작

대표 조작:

- 타임라인 클릭: 노트 배치 또는 선택
- 드래그: 영역 선택 또는 노트 이동
- `Shift + 드래그`: 추가 영역 선택
- `Space`: 재생/일시정지
- `Ctrl + Z`: 실행 취소
- `Ctrl + Y`: 다시 실행
- `C`: 에디터 재생/일시정지 단축키

에디터는 마우스 기반 작업이 많기 때문에, 버튼 클릭 후 포커스가 타임라인 입력을 방해하지 않도록 별도 focus 정책을 적용하고 있습니다.

## 판정 기준

판정값은 [judgeConfig.ts](src/config/judgeConfig.ts)에서 관리합니다.

기본 개념:

- `PERFECT`: 가장 정확한 입력
- `GREAT`: 약간의 오차 허용
- `GOOD`: 큰 오차 허용
- `MISS`: 입력 실패 또는 판정 범위 이탈

롱노트는 head 입력, hold 유지, release 판정을 분리해서 처리합니다.

## 배포

프론트엔드는 GitHub Actions를 통해 GitHub Pages에 배포됩니다.

배포 조건:

- `main` 브랜치 push
- GitHub Actions secret `VITE_API_BASE` 필요
- 관리자 기능을 빌드에 포함하려면 `VITE_ADMIN_TOKEN` 필요

백엔드는 Railway에 별도로 배포합니다. Railway 쪽에는 `DATABASE_URL`, `SESSION_SECRET`, Google OAuth 관련 환경 변수, `ADMIN_TOKEN`이 필요합니다.

## 운영 중 주의 사항

- 파일명에 Supabase가 남아 있는 일부 legacy 코드가 있지만, 현재 운영 백엔드는 Railway입니다.
- YouTube iframe은 브라우저 정책의 영향을 크게 받습니다. playerVars나 iframe 생성 방식을 변경할 때는 광고, 자동재생, 시작 지연, BGA 동기화 회귀를 함께 확인해야 합니다.
- 리듬게임 특성상 FPS 숫자보다 frame pacing이 중요합니다. 큰 기능 변경 후에는 고밀도 채보와 롱노트가 많은 채보를 반드시 같이 테스트해야 합니다.
- 결과 화면, YouTube 종료, 에디터 포커스, 롱노트 판정은 과거 회귀가 많았던 영역입니다.

## 회귀 테스트

주요 변경 후 최소한 다음을 확인합니다.

```bash
npm run build
git diff --check
```

수동 테스트는 [REGRESSION_TEST_CHECKLIST.md](REGRESSION_TEST_CHECKLIST.md)를 기준으로 진행합니다.

권장 스모크 테스트:

- `Frums - Credits`
- `Mili - What the Ripple Sees`
- 롱노트가 많은 채보
- 3000개 이상 노트가 있는 고밀도 채보
- BGA ON/OFF
- 자막 ON/OFF
- Legacy / New Lite / New Full HUD
- FHD / UHD
- 창 모드 / 전체화면

## 개발 과정에서 해결한 문제들

- FHD/UHD와 전체화면 여부에 따라 판정선과 키 박스 위치가 달라지는 문제
- 롱노트가 일정 길이 이상에서 사라지거나 release 판정이 불안정한 문제
- 고밀도 노트에서 hit/miss 처리 비용이 곡 후반으로 갈수록 누적되는 문제
- 자막 fade와 BGA 이벤트가 플레이 중 입력 안정성을 해치는 문제
- YouTube iframe 로딩과 첫 `playVideo()` 호출이 첫 박자와 겹치는 문제
- 에디터 버튼 포커스가 단축키와 노트 배치를 막는 문제
- 채보 승인/삭제/수정 플로우와 리더보드/플레이 카운트 동작 정리
- Electron Player를 통한 GPU 가속 검증 환경 구축

## 라이선스

이 프로젝트는 MIT License를 따릅니다.
