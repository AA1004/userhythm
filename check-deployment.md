# 배포 확인 가이드

## 즉시 확인할 사항

### 1. 실제 배포된 index.html 확인

1. https://aa1004.github.io/userhythm/index.html 접속
2. 우클릭 → "페이지 소스 보기" (또는 Ctrl+U)
3. `index.html` 내용 확인:
   - script 태그가 `/userhythm/assets/index-XXXXX.js`로 시작하는지 확인
   - `/src/main.tsx`가 여전히 참조되는지 확인

### 2. Network 탭에서 실제 요청 확인

1. F12 → Network 탭
2. 페이지 새로고침 (F5)
3. 실패한 요청 (빨간색) 확인:
   - 어떤 파일이 404인지
   - 요청 URL이 무엇인지
   - 예: `/userhythm/src/main.tsx` 또는 `/src/main.tsx`

### 3. JavaScript 파일 로드 확인

Network 탭에서:
- `index-XXXXX.js` 파일이 로드되는지 확인
- 404인 파일의 정확한 URL 확인

## 가능한 문제들

### 문제 1: base 경로 불일치
- 배포된 파일은 `/userhythm/assets/...`를 참조
- 하지만 실제 파일은 다른 경로에 있을 수 있음

### 문제 2: 캐시 문제
- 브라우저가 이전 빌드의 index.html을 캐시
- 해결: 시크릿 모드 또는 캐시 삭제

### 문제 3: 배포된 파일이 잘못됨
- GitHub Pages가 빌드된 파일 대신 원본을 서빙
- 해결: GitHub Pages 설정 확인

## 디버깅 정보 수집

다음 정보를 알려주세요:

1. **페이지 소스의 script 태그**:
   ```
   <script src="???" />
   ```

2. **Network 탭의 404 파일 URL**:
   - 어떤 파일이 404인지
   - 요청 URL이 무엇인지

3. **브라우저 콘솔의 전체 에러 메시지**

