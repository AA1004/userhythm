# Game.tsx 리팩터링 가이드

## 변경 사항 요약

Game.tsx에서 YouTube 테스트 제어 로직을 `useTestAudioController` 훅으로 분리했습니다.

## 수정 필요 사항

### 1. Import 문 추가 (11-12번째 줄 사이)

```typescript
import { useTestAudioController } from '../hooks/useTestAudioController';
```

그리고 다음 import 제거:
```typescript
import { waitForYouTubeAPI } from '../utils/youtube'; // 제거
```

### 2. 상태 선언 수정 (51-61번째 줄)

**기존:**
```typescript
  // 테스트 모드 YouTube 플레이어 상태
  const [testYoutubePlayer, setTestYoutubePlayer] = useState<any>(null);
  const testYoutubePlayerRef = useRef<HTMLDivElement>(null);
  const testYoutubePlayerReadyRef = useRef(false);
  const [testYoutubeVideoId, setTestYoutubeVideoId] = useState<string | null>(null);
  const testAudioSettingsRef = useRef<{
    youtubeVideoId: string | null;
    youtubeUrl: string;
    startTimeMs: number;
    playbackSpeed: number;
  } | null>(null);
```

**수정 후:**
```typescript
  // 테스트 모드 YouTube 플레이어 훅
  const {
    youtubePlayerRef: testYoutubePlayerRef,
    setAudioSettings,
    pausePlayer,
    destroyPlayer,
  } = useTestAudioController({
    isTestMode,
    gameStarted: gameState.gameStarted,
    currentTime: gameState.currentTime,
  });
```

### 3. YouTube 플레이어 초기화 useEffect 제거 (580-682번째 줄)

전체 useEffect 블록을 삭제:
```typescript
// 테스트 모드 YouTube 플레이어 초기화
useEffect(() => {
  // ... 전체 블록 삭제
}, [isTestMode, testYoutubeVideoId]);
```

### 4. YouTube 오디오 동기화 useEffect 제거 (684-755번째 줄)

전체 useEffect 블록을 삭제:
```typescript
// 테스트 모드 YouTube 오디오 동기화
useEffect(() => {
  // ... 전체 블록 삭제
}, [isTestMode, gameState.gameStarted, gameState.currentTime, testYoutubePlayer]);
```

### 5. 게임 종료 시 YouTube 플레이어 정지 (411-428번째 줄)

**기존:**
```typescript
      // 게임 종료 시 YouTube 플레이어 정지/해제
      if (isTestMode && testYoutubePlayer && testYoutubePlayerReadyRef.current) {
        try {
          testYoutubePlayer.pauseVideo?.();
        } catch (e) {
          console.warn('YouTube 일시정지 실패:', e);
        }
      }
```

**수정 후:**
```typescript
      // 게임 종료 시 YouTube 플레이어 정지/해제
      if (isTestMode) {
        pausePlayer();
      }
```

그리고 dependency에서 `testYoutubePlayer` 제거:
```typescript
}, [gameState.currentTime, gameState.gameStarted, gameState.gameEnded, isTestMode]); // testYoutubePlayer 제거
```

### 6. handleEditorTest 수정 (509-527번째 줄)

**기존:**
```typescript
      // YouTube 오디오 설정 전달
      testAudioSettingsRef.current = {
        youtubeVideoId: payload.youtubeVideoId,
        youtubeUrl: payload.youtubeUrl,
        startTimeMs: startMs,
        playbackSpeed: payload.playbackSpeed || 1,
      };

      testPreparedNotesRef.current = preparedNotes.map((note) => ({ ...note }));
      setIsTestMode(true);
      setIsEditorOpen(false);
      
      // YouTube 플레이어 초기화를 위해 videoId 설정
      if (payload.youtubeVideoId) {
        setTestYoutubeVideoId(payload.youtubeVideoId);
      } else {
        setTestYoutubeVideoId(null);
      }
```

**수정 후:**
```typescript
      // YouTube 오디오 설정 전달
      setAudioSettings({
        youtubeVideoId: payload.youtubeVideoId,
        youtubeUrl: payload.youtubeUrl,
        startTimeMs: startMs,
        playbackSpeed: payload.playbackSpeed || 1,
      });

      testPreparedNotesRef.current = preparedNotes.map((note) => ({ ...note }));
      setIsTestMode(true);
      setIsEditorOpen(false);
```

### 7. handleReturnToEditor 수정 (540-564번째 줄)

**기존:**
```typescript
  const handleReturnToEditor = useCallback(() => {
    setIsEditorOpen(true);
    setIsTestMode(false);
    testPreparedNotesRef.current = [];
    testAudioSettingsRef.current = null;
    setTestYoutubeVideoId(null);
    
    // YouTube 플레이어 정리
    if (testYoutubePlayer) {
      try {
        testYoutubePlayer.destroy();
      } catch (e) {
        console.warn('테스트 플레이어 정리 실패:', e);
      }
    }
    setTestYoutubePlayer(null);
    testYoutubePlayerReadyRef.current = false;
    
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
    }));
  }, [testYoutubePlayer]);
```

**수정 후:**
```typescript
  const handleReturnToEditor = useCallback(() => {
    setIsEditorOpen(true);
    setIsTestMode(false);
    testPreparedNotesRef.current = [];
    
    // YouTube 플레이어 정리
    destroyPlayer();
    
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
    }));
  }, [destroyPlayer]);
```

### 8. handleChartSelect 수정 (803-828번째 줄)

**기존:**
```typescript
      // 기존 테스트 모드 플레이어 정리
      if (testYoutubePlayer) {
        try {
          testYoutubePlayer.destroy?.();
        } catch (e) {
          console.warn('기존 플레이어 정리 실패:', e);
        }
      }
      setTestYoutubePlayer(null);
      testYoutubePlayerReadyRef.current = false;
      
      // YouTube 플레이어 설정 (필요시) - 먼저 설정해야 useEffect가 올바르게 작동함
      if (chartData.youtubeVideoId) {
        testAudioSettingsRef.current = {
          youtubeVideoId: chartData.youtubeVideoId,
          youtubeUrl: chartData.youtubeUrl || '',
          startTimeMs: 0,
          playbackSpeed: 1,
        };
        setTestYoutubeVideoId(chartData.youtubeVideoId); // state로 설정하여 useEffect가 감지하도록
        setIsTestMode(true);
      } else {
        setIsTestMode(false);
        setTestYoutubeVideoId(null);
        testAudioSettingsRef.current = null;
      }
```

**수정 후:**
```typescript
      // 기존 테스트 모드 플레이어 정리
      destroyPlayer();
      
      // YouTube 플레이어 설정 (필요시)
      if (chartData.youtubeVideoId) {
        setAudioSettings({
          youtubeVideoId: chartData.youtubeVideoId,
          youtubeUrl: chartData.youtubeUrl || '',
          startTimeMs: 0,
          playbackSpeed: 1,
        });
        setIsTestMode(true);
      } else {
        setIsTestMode(false);
        setAudioSettings(null);
      }
```

### 9. JSX에서 YouTube 플레이어 렌더링 수정 (1427번째 줄)

**기존:**
```typescript
        {/* 테스트 모드 YouTube 플레이어 (숨김 - 오디오만 재생) */}
        {isTestMode && testYoutubeVideoId && (
          <div
            ref={testYoutubePlayerRef}
```

**수정 후:**
```typescript
        {/* 테스트 모드 YouTube 플레이어 (숨김 - 오디오만 재생) */}
        {isTestMode && (
          <div
            ref={testYoutubePlayerRef}
```

## 완료 후 확인 사항

1. YouTube 플레이어가 테스트 모드에서 정상적으로 작동하는지 확인
2. 에디터에서 테스트 실행 시 음악이 정상적으로 재생되는지 확인
3. 채보 선택 후 플레이 시 음악이 정상적으로 재생되는지 확인
4. 테스트 종료 후 에디터로 돌아갈 때 플레이어가 정상적으로 정리되는지 확인




