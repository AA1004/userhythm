# 하이라이트 미리듣기 + 플레이어 재사용 플랜

## 목표
1. 하이라이트 구간을 "n번째 마디 ~ m번째 마디"로 설정하고 공유 데이터에 저장
2. 채보 선택 화면에서 채보 클릭 시 해당 하이라이트 구간을 YouTube 오디오로 반복 재생
3. 공유 모달 드래그로 닫히는 버그 수정
4. 선택 화면에서 미리 로드한 YouTube 플레이어를 Game에서 재사용

## 파일 변경 목록
- `src/components/ChartEditor.tsx`
- `src/components/ChartEditor/ChartShareModal.tsx`
- `src/components/ChartSelect.tsx`
- `src/hooks/useTestYoutubePlayer.ts`
- `src/components/Game.tsx`
- `src/utils/bpmUtils.ts` (수정 없음, import만 사용)

## 구현 단계

### 1단계: ChartEditor.tsx - 하이라이트 상태 추가 및 저장

#### 1-1. 상태 추가
```typescript
const [sharePreviewStartMeasure, setSharePreviewStartMeasure] = useState<number>(1);
const [sharePreviewEndMeasure, setSharePreviewEndMeasure] = useState<number>(5);
```

#### 1-2. 공유 모달 열 때 자막 기준 기본값 설정
`setIsShareModalOpen(true)` 호출 직전 또는 직후에:
```typescript
const subtitles = localSubtitleStorage.get(subtitleSessionId);
if (subtitles.length > 0) {
  const firstCue = subtitles[0];
  const startMeasure = timeToMeasure(firstCue.startTimeMs, bpm, bpmChanges, beatsPerMeasure);
  setSharePreviewStartMeasure(startMeasure);
  setSharePreviewEndMeasure(startMeasure + 4);
}
```

#### 1-3. handleShare에서 chartData에 저장
`chartData` 객체에 추가:
```typescript
previewStartMeasure: sharePreviewStartMeasure,
previewEndMeasure: sharePreviewEndMeasure,
```

#### 1-4. handleExportJson에서도 포함
`chart` 객체에 동일 필드 추가

#### 1-5. ChartShareModal props 전달
```typescript
previewStartMeasure={sharePreviewStartMeasure}
previewEndMeasure={sharePreviewEndMeasure}
onPreviewStartMeasureChange={setSharePreviewStartMeasure}
onPreviewEndMeasureChange={setSharePreviewEndMeasure}
beatsPerMeasure={beatsPerMeasure}
```

### 2단계: ChartShareModal.tsx - 드래그 버그 수정

#### 2-1. onClick 제거 및 pointer 이벤트로 교체
- overlay div에서 `onClick={onClose}` 제거
- `const shouldCloseRef = useRef(false);` 추가
- overlay에:
  ```typescript
  onPointerDown={(e) => { shouldCloseRef.current = (e.target === e.currentTarget); }}
  onPointerUp={(e) => { if (shouldCloseRef.current && e.target === e.currentTarget) onClose(); }}
  ```
- 내부 패널 div에:
  ```typescript
  onPointerDown={(e) => e.stopPropagation()}
  onClick={(e) => e.stopPropagation()} // 안전장치
  ```

### 3단계: ChartSelect.tsx - 하이라이트 파싱 및 미리듣기

#### 3-1. handleSelectChart에서 하이라이트 읽기
```typescript
const beatsPerMeasure = Number(chartData.beatsPerMeasure ?? chartData.timeSignatures?.[0]?.beatsPerMeasure ?? 4);
const bpmChanges = Array.isArray(chartData.bpmChanges) ? chartData.bpmChanges : [];
const previewStartMeasure = Math.max(1, Number(chartData.previewStartMeasure ?? 1));
const previewEndMeasure = Math.max(previewStartMeasure + 1, Number(chartData.previewEndMeasure ?? (previewStartMeasure + 4)));
```

#### 3-2. measureToTime으로 ms 변환
```typescript
import { measureToTime } from '../utils/bpmUtils';

const previewStartMs = measureToTime(previewStartMeasure, chart.bpm, bpmChanges, beatsPerMeasure);
const previewEndMs = measureToTime(previewEndMeasure, chart.bpm, bpmChanges, beatsPerMeasure);
if (previewEndMs <= previewStartMs) {
  previewEndMs = previewStartMs + 15000;
}
```

#### 3-3. YouTube Preview Player 구현
- refs 추가:
  ```typescript
  const previewPlayerHostRef = useRef<HTMLDivElement|null>(null);
  const previewPlayerRef = useRef<any>(null);
  const previewLoopTimerRef = useRef<number|NodeJS.Timeout|null>(null);
  ```
- 숨김 host div 추가 (렌더 트리 어딘가)
- selectedChart 변경 시 effect:
  - `waitForYouTubeAPI()` 대기
  - player 없으면 생성, 있으면 `loadVideoById`
  - `seekTo(previewStartMs/1000, true)`
  - `setVolume(30)`
  - `playVideo()`
- 루프 타이머:
  ```typescript
  previewLoopTimerRef.current = setInterval(() => {
    const t = previewPlayerRef.current?.getCurrentTime();
    if (t >= previewEndMs/1000 - 0.05) {
      previewPlayerRef.current?.seekTo(previewStartMs/1000, true);
    }
  }, 200);
  ```
- cleanup: interval clear, pauseVideo

#### 3-4. 블러 배경 추가
우측 상세 패널에 background layer:
```typescript
backgroundImage: `url(${selectedChart.preview_image})`,
filter: 'blur(18px)',
transform: 'scale(1.12)',
```

### 4단계: useTestYoutubePlayer.ts - externalPlayer 옵션 추가

#### 4-1. 옵션에 externalPlayer 추가
```typescript
export interface UseTestYoutubePlayerOptions {
  // ... 기존 필드들
  externalPlayer?: any | null;
}
```

#### 4-2. externalPlayer가 있으면 재사용
```typescript
if (options.externalPlayer) {
  setPlayer(options.externalPlayer);
  playerReadyRef.current = true;
  return; // 내부 생성 skip
}
```

#### 4-3. destroy 시 externalPlayer는 pause만
```typescript
if (externalPlayer && player === externalPlayer) {
  pauseVideo();
  return; // destroy 안 함
}
```

### 5단계: Game.tsx - 플레이어 전달 파이프

#### 5-1. ref 추가
```typescript
const chartSelectYoutubePlayerRef = useRef<any>(null);
```

#### 5-2. ChartSelect에 onPreviewPlayerReady 추가
```typescript
onPreviewPlayerReady={(player) => { chartSelectYoutubePlayerRef.current = player; }}
```

#### 5-3. useTestYoutubePlayer에 전달
```typescript
externalPlayer: chartSelectYoutubePlayerRef.current
```

## 검증 체크리스트
- [ ] 공유 모달에서 드래그해도 닫히지 않음
- [ ] 공유 시 previewStartMeasure/previewEndMeasure가 data_json에 저장됨
- [ ] 채보 선택 시 하이라이트 구간 오디오 루프 재생
- [ ] 플레이 시작 시 YouTube 로딩이 빠름 (플레이어 재사용)
