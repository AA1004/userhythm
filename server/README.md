# UserRhythm 서버

YouTube 영상 다운로드 및 BPM 분석을 위한 백엔드 서버입니다.

## 설치 방법

```bash
cd server
npm install
```

## yt-dlp 설치

YouTube 다운로드를 위해 yt-dlp가 필요합니다:

**Windows (권장):**
```bash
# 방법 1: winget 사용 (Windows 10/11)
winget install yt-dlp

# 방법 2: pip 사용 (Python 필요)
pip install yt-dlp

# 방법 3: 직접 다운로드
# https://github.com/yt-dlp/yt-dlp/releases 에서 다운로드
# yt-dlp.exe를 PATH에 추가하거나 프로젝트 폴더에 배치
```

**확인:**
```bash
yt-dlp --version
```

**참고:** 서버는 자동으로 여러 경로에서 yt-dlp를 찾으려고 시도합니다.

## 실행 방법

```bash
npm start
# 또는 개발 모드 (자동 재시작)
npm run dev
```

서버가 포트 3001에서 실행됩니다.

## API 엔드포인트

### GET /api/health
서버 상태 확인

### POST /api/youtube/download
YouTube 영상 오디오 다운로드

**요청:**
```json
{
  "videoId": "VIDEO_ID"
}
```

**응답:**
- 성공: MP4 비디오 파일 스트림
- 실패: JSON 에러 메시지

## Spotify API 설정 (선택사항)

BPM 정보를 Spotify에서 가져오려면 Spotify API 키가 필요합니다:

### 1. Spotify Developer Dashboard에서 앱 생성

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)에 접속
2. "Create app" 클릭
3. 앱 이름과 설명 입력
4. Redirect URI는 필요 없음 (Client Credentials Flow 사용)
5. "Save" 클릭
6. Client ID와 Client Secret 복사

### 2. .env 파일 설정 (권장)

**자동 생성 (처음 한 번만):**
```bash
cd server
copy .env.example .env
```

**또는 수동 생성:**
`server` 폴더에 `.env` 파일을 생성하고 다음 내용 추가:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
```

`your_spotify_client_id_here`와 `your_spotify_client_secret_here`를 실제 값으로 변경하세요.

**주의:** `.env` 파일은 절대 git에 커밋하지 마세요! 이미 `.gitignore`에 추가되어 있습니다.

### 3. 환경 변수로 설정 (대안)

`.env` 파일 대신 환경 변수로 설정할 수도 있습니다:

**Windows (PowerShell):**
```powershell
$env:SPOTIFY_CLIENT_ID="your_client_id"
$env:SPOTIFY_CLIENT_SECRET="your_client_secret"
```

**Windows (CMD):**
```cmd
set SPOTIFY_CLIENT_ID=your_client_id
set SPOTIFY_CLIENT_SECRET=your_client_secret
```

### 4. 확인

서버를 시작하면 Spotify API 키가 설정되었는지 로그에서 확인할 수 있습니다:
- 설정됨: Spotify BPM 조회가 작동합니다
- 설정 안 됨: "Spotify API가 설정되지 않았습니다" 메시지가 나타나지만 다른 BPM 소스는 계속 작동합니다

## 주의사항

- YouTube 서비스 약관을 준수하세요
- 다운로드된 파일은 분석 후 자동으로 삭제됩니다
- 서버는 개발/테스트 목적으로만 사용하세요
- Spotify API는 무료 등급에서 분당 300 요청 제한이 있습니다

