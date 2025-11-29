# GitHub Pages 배포 가이드

## 사전 준비

1. **GitHub 저장소 생성**
   - GitHub에 새 저장소를 생성하거나 기존 저장소를 사용하세요
   - 저장소 이름을 기억해두세요 (예: `userhythm`)

2. **vite.config.ts 수정**
   - `vite.config.ts` 파일의 `base` 경로를 저장소 이름에 맞게 수정하세요
   - 예: 저장소 이름이 `userhythm`이면 `/userhythm/`로 설정

## GitHub Pages 설정

### 1. GitHub Actions 활성화

1. GitHub 저장소로 이동
2. **Settings** → **Pages** 메뉴로 이동
3. **Source**에서 **GitHub Actions** 선택
4. 저장

### 2. 환경 변수 설정 (Secrets)

Supabase를 사용하는 경우 환경 변수를 설정해야 합니다:

1. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** 클릭
3. 다음 secrets 추가:
   - `VITE_SUPABASE_URL`: Supabase 프로젝트 URL
   - `VITE_SUPABASE_ANON_KEY`: Supabase anon key
   - `VITE_ADMIN_TOKEN`: 관리자 토큰 (선택사항)

### 3. 배포

1. 코드를 GitHub에 push:
   ```bash
   git add .
   git commit -m "Add GitHub Pages deployment"
   git push origin main
   ```

2. GitHub Actions에서 배포 진행 상황 확인:
   - 저장소 → **Actions** 탭
   - 배포가 완료되면 **Settings** → **Pages**에서 URL 확인

## 주의사항

### 서버 기능

GitHub Pages는 정적 사이트만 호스팅하므로:
- **서버 기능** (`server/` 폴더)은 GitHub Pages에서 작동하지 않습니다
- YouTube 다운로드 등 서버 기능이 필요한 경우:
  - 별도의 서버 호스팅 필요 (Heroku, Railway, Render 등)
  - 또는 클라이언트에서 직접 처리하도록 수정

### 환경 변수

- GitHub Pages는 빌드 시점에 환경 변수를 사용합니다
- 런타임에 환경 변수를 변경할 수 없습니다
- 민감한 정보는 절대 클라이언트 코드에 포함하지 마세요

### Base 경로

- `vite.config.ts`의 `base` 경로가 저장소 이름과 일치해야 합니다
- 저장소 이름이 `my-rhythm-game`이면 `/my-rhythm-game/`로 설정

## 로컬에서 빌드 테스트

배포 전에 로컬에서 빌드가 제대로 되는지 확인:

```bash
npm run build
npm run preview
```

빌드된 파일이 `dist/` 폴더에 생성됩니다.

## 문제 해결

### 404 에러

- `vite.config.ts`의 `base` 경로 확인
- GitHub Pages 설정에서 Source가 **GitHub Actions**인지 확인

### 환경 변수 오류

- GitHub Secrets에 환경 변수가 제대로 설정되었는지 확인
- 빌드 로그에서 환경 변수 사용 여부 확인

### 이미지/리소스 로드 실패

- 모든 경로가 상대 경로인지 확인
- `base` 경로가 올바르게 설정되었는지 확인

