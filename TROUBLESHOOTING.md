# GitHub Pages 배포 문제 해결

## 흰 화면 문제

### 1. 브라우저 콘솔 확인

1. 사이트에 접속: https://aa1004.github.io/userhythm/
2. F12를 눌러 개발자 도구 열기
3. **Console** 탭에서 에러 메시지 확인
4. **Network** 탭에서 실패한 요청 확인 (빨간색으로 표시)

### 2. 일반적인 원인과 해결

#### JavaScript 파일 404 에러

**증상**: Network 탭에서 `.js` 파일들이 404로 실패

**원인**: base 경로가 잘못 설정됨

**해결**:
- `vite.config.ts`의 `base` 경로 확인
- 저장소 이름과 일치하는지 확인 (`/userhythm/`)
- 빌드 후 `dist/index.html`에서 경로가 올바른지 확인

#### 환경 변수 오류

**증상**: 콘솔에 "Supabase credentials not configured" 경고

**원인**: GitHub Secrets에 환경 변수가 설정되지 않음

**해결**:
- GitHub 저장소 → Settings → Secrets and variables → Actions
- 다음 secrets 추가:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ADMIN_TOKEN` (선택사항)

#### 빌드 실패

**증상**: GitHub Actions에서 빌드가 실패

**원인**: TypeScript 오류, 의존성 문제 등

**해결**:
- GitHub 저장소 → Actions 탭에서 빌드 로그 확인
- 로컬에서 `npm run build` 실행하여 오류 확인
- 오류 수정 후 다시 push

### 3. 디버깅 단계

#### 1단계: 로컬 빌드 테스트

```bash
npm run build
npm run preview
```

로컬에서 빌드가 성공하고 `http://localhost:4173/userhythm/`에서 정상 작동하는지 확인

#### 2단계: 빌드된 파일 확인

```bash
cat dist/index.html
```

`index.html`에서 JavaScript 파일 경로가 `/userhythm/assets/...`로 시작하는지 확인

#### 3단계: GitHub Actions 로그 확인

1. GitHub 저장소 → Actions 탭
2. 최근 워크플로우 실행 클릭
3. Build 단계의 로그 확인
4. 에러 메시지 확인

### 4. 빠른 수정 방법

#### base 경로 재확인

`vite.config.ts`:
```typescript
const base = '/userhythm/'
```

#### 빌드 캐시 클리어

GitHub Actions에서:
1. Actions → 최근 워크플로우
2. "..." 메뉴 → "Delete workflow run"
3. 다시 push하여 재빌드

#### 수동 재배포

1. 로컬에서 빌드:
   ```bash
   npm run build
   ```

2. `dist` 폴더의 내용을 `gh-pages` 브랜치에 push:
   ```bash
   git subtree push --prefix dist origin gh-pages
   ```

   또는 GitHub Pages 설정에서 Source를 `gh-pages` 브랜치로 변경

### 5. 확인 체크리스트

- [ ] `vite.config.ts`의 `base`가 `/userhythm/`로 설정됨
- [ ] GitHub Pages 설정에서 Source가 "GitHub Actions"로 설정됨
- [ ] GitHub Secrets에 환경 변수가 설정됨
- [ ] GitHub Actions에서 빌드가 성공함
- [ ] 브라우저 콘솔에 에러가 없음
- [ ] Network 탭에서 모든 파일이 200으로 로드됨

### 6. 여전히 문제가 있다면

1. 브라우저 콘솔의 전체 에러 메시지 복사
2. GitHub Actions 빌드 로그 확인
3. `dist/index.html` 파일 내용 확인
4. Network 탭에서 실패한 파일 목록 확인

이 정보들을 함께 제공해주시면 더 정확한 진단이 가능합니다.


