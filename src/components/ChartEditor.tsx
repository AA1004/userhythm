import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Note, Lane } from '../types/game';
import { extractYouTubeVideoId, waitForYouTubeAPI } from '../utils/youtube';
import { TapBPMCalculator, bpmToBeatDuration, isValidBPM } from '../utils/bpmAnalyzer';
import { chartAPI, isSupabaseConfigured, supabase } from '../lib/supabaseClient';

// Subtitle editor chart data type
interface SubtitleEditorChartData {
  chartId: string;
  notes: Note[];
  bpm: number;
  youtubeVideoId?: string | null;
  youtubeUrl?: string;
  title?: string;
}

interface ChartEditorProps {
  onSave: (notes: Note[]) => void;
  onCancel: () => void;
  onTest?: (payload: ChartTestPayload) => void;
  onOpenSubtitleEditor?: (chartData: SubtitleEditorChartData) => void;
}

interface ChartTestPayload {
  notes: Note[];
  startTimeMs: number;
  youtubeVideoId: string | null;
  youtubeUrl: string;
  playbackSpeed: number;
  audioOffsetMs?: number;
}

interface TimeSignatureEvent {
  id: number;
  beatIndex: number; // 곡 전체 기준 비트 인덱스
  beatsPerMeasure: number; // 예: 4(4/4), 3(3/4)
}

const LANE_POSITIONS = [100, 200, 300, 400];
const LANE_KEY_LABELS = ['D', 'F', 'J', 'K'];
const TAP_NOTE_HEIGHT = 60;
const JUDGE_LINE_Y = 640;
const PIXELS_PER_SECOND = 200; // 타임라인 확대 비율
const TIMELINE_TOP_PADDING = 600;
const TIMELINE_BOTTOM_PADDING = JUDGE_LINE_Y;
const MIN_TIMELINE_DURATION_MS = 120000;
const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MIN_PLAYBACK_SPEED = 0.5;
const MAX_PLAYBACK_SPEED = 2;
const AUTO_SAVE_KEY = 'chartEditorLastChart';

export const ChartEditor: React.FC<ChartEditorProps> = ({ onSave, onCancel, onTest, onOpenSubtitleEditor }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeedState, setPlaybackSpeedState] = useState<number>(1);
  const playbackSpeed = playbackSpeedState;
  const [zoom, setZoom] = useState<number>(1);
  const noteIdRef = useRef(0);
  const timeSignatureIdRef = useRef(1);
  const playbackIntervalRef = useRef<number | null>(null);
  const playbackSpeedRef = useRef(1);
  const manualPlaybackStartTimeRef = useRef(0);
  const manualPlaybackStartTimestampRef = useRef(0);
  const isManualPlaybackRef = useRef(false);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledToBottomRef = useRef(false);
  const lastDraggedPlayheadTimeRef = useRef<number | null>(null);
  const playheadDragCleanupRef = useRef<(() => void) | null>(null);
  const isDraggingPlayheadRef = useRef(false);
  
  // YouTube 관련 상태
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubePlayer, setYoutubePlayer] = useState<any>(null);
  const youtubePlayerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerReadyRef = useRef(false);
  
  // BPM 관련 상태
  const [bpm, setBpm] = useState<number>(120);
  const [isBpmInputOpen, setIsBpmInputOpen] = useState<boolean>(false);
  const tapBpmCalculatorRef = useRef(new TapBPMCalculator());
  const [tapBpmResult, setTapBpmResult] = useState<{ bpm: number; confidence: number } | null>(null);

  // 메뉴 열림/닫힘 상태
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [gridDivision, setGridDivision] = useState<number>(1); // 1=기본, 2=2분할, 3=셋잇단 등
  const [timeSignatures, setTimeSignatures] = useState<TimeSignatureEvent[]>([
    { id: 0, beatIndex: 0, beatsPerMeasure: 4 },
  ]);
  // 마디 오프셋 (박자 단위): 늦게 시작하는 곡을 위해 마디 시작선을 앞/뒤로 이동
  const [timeSignatureOffset, setTimeSignatureOffset] = useState<number>(0);
  // true일 때: 재생선에 맞춰 자동 스크롤 + 사용자가 스크롤로 위치를 바꾸지 못하도록 고정
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(true);
  const [isLongNoteMode, setIsLongNoteMode] = useState<boolean>(false);
  const [pendingLongNote, setPendingLongNote] = useState<{ lane: Lane; startTime: number } | null>(null);
  const [testStartInput, setTestStartInput] = useState<string>('0');
  const [volume, setVolume] = useState<number>(100); // 0~100 편집기 음량
  
  // 공유 관련 상태
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareTitle, setShareTitle] = useState<string>('');
  const [shareAuthor, setShareAuthor] = useState<string>('');
  const [shareDifficulty, setShareDifficulty] = useState<string>('Normal');
  const [shareDescription, setShareDescription] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [user, setUser] = useState<any>(null);
  const [previewImageFile, setPreviewImageFile] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  
  // 초기 로드 완료 플래그 (복원이 완료되기 전에는 자동 저장을 스킵)
  const hasRestoredRef = useRef(false);
  
  // 마지막 작업 채보 자동 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTO_SAVE_KEY);
      if (!raw) {
        hasRestoredRef.current = true;
        return;
      }

      const chartData = JSON.parse(raw);
      if (!chartData || typeof chartData !== 'object') {
        hasRestoredRef.current = true;
        return;
      }

      // 노트 데이터 로드 (handleLoad와 거의 동일)
      if (chartData.notes && Array.isArray(chartData.notes)) {
        noteIdRef.current = 0;

        const loadedNotes: Note[] = chartData.notes
          .map((noteData: any) => {
            if (typeof noteData.lane !== 'number' || typeof noteData.time !== 'number') {
              console.warn('유효하지 않은 자동 복원 노트 데이터:', noteData);
              return null;
            }

            const startTime = Number(noteData.time) || 0;
            const rawDuration =
              typeof noteData.duration === 'number'
                ? Number(noteData.duration)
                : typeof noteData.endTime === 'number'
                ? Number(noteData.endTime) - startTime
                : 0;
            const duration =
              Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
            const endTime =
              typeof noteData.endTime === 'number'
                ? Number(noteData.endTime)
                : startTime + duration;

            return {
              id: noteIdRef.current++,
              lane: noteData.lane as Lane,
              time: startTime,
              duration,
              endTime,
              type: duration > 0 ? 'hold' : 'tap',
              y: 0,
              hit: false,
            };
          })
          .filter((note: Note | null): note is Note => note !== null);

        setNotes(loadedNotes);
      } else {
        setNotes([]);
      }

      // 재생 상태 초기화
      setIsPlaying(false);
      setCurrentTime(0);

      // BPM, 박자, 오프셋 복원
      if (chartData.bpm && typeof chartData.bpm === 'number') {
        setBpm(chartData.bpm);
      }
      if (chartData.timeSignatures && Array.isArray(chartData.timeSignatures)) {
        setTimeSignatures(chartData.timeSignatures);
      }
      if (typeof chartData.timeSignatureOffset === 'number') {
        setTimeSignatureOffset(chartData.timeSignatureOffset);
      } else {
        setTimeSignatureOffset(0);
      }

      // YouTube 정보 복원
      if (chartData.youtubeVideoId) {
        setYoutubeVideoId(chartData.youtubeVideoId);
        if (chartData.youtubeUrl) {
          setYoutubeUrl(chartData.youtubeUrl);
        } else {
          setYoutubeUrl('');
        }
      } else {
        setYoutubeVideoId(null);
        setYoutubeUrl('');
      }

      // 음량 복원
      if (typeof chartData.volume === 'number') {
        setVolume(Math.max(0, Math.min(100, chartData.volume)));
      } else {
        setVolume(100);
      }
      
      // 복원 완료 표시
      hasRestoredRef.current = true;
      console.log('✅ 자동 채보 복원 완료');
    } catch (error) {
      console.warn('자동 채보 복원 실패:', error);
      hasRestoredRef.current = true;
    }
  }, []);

  // 편집 중 채보 자동 저장
  useEffect(() => {
    // 복원이 완료되기 전에는 자동 저장을 스킵 (복원 중 빈 상태가 저장되는 것을 방지)
    if (!hasRestoredRef.current) return;
    
    try {
      // 완전히 빈 상태면 자동 저장 제거
      if (!notes.length && !youtubeUrl) {
        localStorage.removeItem(AUTO_SAVE_KEY);
        return;
      }

      const autoSaveData = {
        notes: notes.map(({ id, lane, time, duration, endTime, type }) => ({
          id,
          lane,
          time,
          duration,
          endTime,
          type,
        })),
        bpm,
        timeSignatures,
        timeSignatureOffset,
        youtubeVideoId,
        youtubeUrl,
        volume,
      };

      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(autoSaveData));
    } catch (e) {
      console.warn('자동 저장 실패:', e);
    }
  }, [notes, bpm, timeSignatures, timeSignatureOffset, youtubeVideoId, youtubeUrl, volume]);
  
  // 사용자 인증 상태 확인
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    
    // 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    
    // 인증 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  // Google 로그인 함수
  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      alert('Supabase 환경 변수가 설정되지 않아 로그인 기능을 사용할 수 없습니다.');
      return;
    }
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('로그인 오류:', error);
      alert('로그인에 실패했습니다: ' + (error.message || '알 수 없는 오류'));
    }
  }, []);
  
  const maxNoteTime = useMemo(() => {
    if (!notes.length) return 0;
    return Math.max(
      ...notes.map((note) => Math.max(note.time, note.endTime ?? note.time))
    );
  }, [notes]);

  // BPM 기반 기본 비트 길이(ms)
  const beatDuration = useMemo(() => bpmToBeatDuration(bpm), [bpm]);

  const pixelsPerMs = useMemo(
    () => (PIXELS_PER_SECOND * zoom) / 1000,
    [zoom]
  );

  const timelineDurationMs = useMemo(
    () =>
      Math.max(
        maxNoteTime + 4000,
        currentTime + 4000,
        MIN_TIMELINE_DURATION_MS
      ),
    [maxNoteTime, currentTime]
  );

  const timelineContentHeight = useMemo(
    () =>
      timelineDurationMs * pixelsPerMs +
      TIMELINE_TOP_PADDING +
      TIMELINE_BOTTOM_PADDING,
    [timelineDurationMs, pixelsPerMs]
  );

  const originY = useMemo(
    () => timelineContentHeight - TIMELINE_BOTTOM_PADDING,
    [timelineContentHeight]
  );

  const sortedTimeSignatures = useMemo(
    () =>
      [...timeSignatures].sort((a, b) => a.beatIndex - b.beatIndex),
    [timeSignatures]
  );

  const currentBeatIndex = useMemo(
    () => (beatDuration > 0 ? Math.round(currentTime / beatDuration) : 0),
    [currentTime, beatDuration]
  );

  const activeTimeSignature = useMemo(() => {
    if (!sortedTimeSignatures.length) {
      return { beatsPerMeasure: 4, beatIndex: 0, id: -1 };
    }
    let result = sortedTimeSignatures[0];
    for (let i = 0; i < sortedTimeSignatures.length; i++) {
      const ts = sortedTimeSignatures[i];
      if (ts.beatIndex <= currentBeatIndex) {
        result = ts;
      } else {
        break;
      }
    }
    return result;
  }, [sortedTimeSignatures, currentBeatIndex]);

  const timeToY = useCallback(
    (timeMs: number) => {
      if (!originY || !pixelsPerMs) return 0;
      return originY - timeMs * pixelsPerMs;
    },
    [originY, pixelsPerMs]
  );

  const yToTime = useCallback(
    (y: number) => {
      if (!originY || !pixelsPerMs || !timelineDurationMs) return 0;
      const normalizedY = Math.min(originY, Math.max(0, y));
      const rawTime = (originY - normalizedY) / (pixelsPerMs || 0.0001);
      return Math.max(0, Math.min(timelineDurationMs, rawTime));
    },
    [originY, pixelsPerMs, timelineDurationMs]
  );

  const playheadY = useMemo(
    () => {
      const y = timeToY(currentTime);
      return Math.max(0, Math.min(timelineContentHeight, y));
    },
    [timeToY, currentTime, timelineContentHeight]
  );

  const playbackSpeedIndex = useMemo(() => {
    const idx = PLAYBACK_SPEED_OPTIONS.indexOf(playbackSpeed);
    return idx === -1 ? 0 : idx;
  }, [playbackSpeed]);

  const handleAddTimeSignatureChange = useCallback(
    (beatsPerMeasure: number) => {
      if (beatDuration <= 0) return;
      const beatIndex = Math.max(
        0,
        Math.round(currentTime / beatDuration)
      );

      setTimeSignatures((prev) => {
        // 동일 위치 이벤트가 있으면 업데이트
        const existingIndex = prev.findIndex(
          (ts) => ts.beatIndex === beatIndex
        );
        if (existingIndex !== -1) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            beatsPerMeasure,
          };
          return next;
        }
        return [
          ...prev,
          {
            id: timeSignatureIdRef.current++,
            beatIndex,
            beatsPerMeasure,
          },
        ];
      });
    },
    [beatDuration, currentTime]
  );
  const normalizePlaybackSpeed = useCallback((speed: number) => {
    const clamped = Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, speed));
    if (PLAYBACK_SPEED_OPTIONS.includes(clamped)) {
      return clamped;
    }
    return PLAYBACK_SPEED_OPTIONS.reduce((prev, curr) =>
      Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev
    , PLAYBACK_SPEED_OPTIONS[0]);
  }, []);

  const setPlaybackSpeed = useCallback(
    (speed: number) => {
      const normalized = normalizePlaybackSpeed(speed);
      setPlaybackSpeedState(normalized);
    },
    [normalizePlaybackSpeed]
  );

  const getClampedTestStart = useCallback(() => {
    const parsed = parseFloat(testStartInput);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(timelineDurationMs, parsed));
  }, [testStartInput, timelineDurationMs]);

  const handleTestStartFromCurrent = useCallback(() => {
    setTestStartInput(Math.max(0, Math.round(currentTime)).toString());
  }, [currentTime]);

  const handleResetTestStart = useCallback(() => {
    setTestStartInput('0');
  }, []);

  // 초기 스크롤 위치 설정: 재생선을 화면 중앙에 맞춤
  useEffect(() => {
    if (hasScrolledToBottomRef.current) return;
    const container = timelineScrollRef.current;
    // originY가 준비되었는지 확인 (초기 currentTime = 0일 때 재생선 위치)
    if (!container || !originY || originY === 0) return;
    hasScrolledToBottomRef.current = true;
    
    // 재생선이 타임라인 뷰의 세로 중앙에 오도록 스크롤 위치 계산
    requestAnimationFrame(() => {
      const centerOffset = container.clientHeight / 2;
      const rawTarget = originY - centerOffset;
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const targetScrollTop = Math.max(0, Math.min(maxScrollTop, rawTarget));
      container.scrollTop = targetScrollTop;
    });
  }, [originY]);

  // 롱노트 모드 해제 시 진행 중이던 시작 지점 초기화
  useEffect(() => {
    if (!isLongNoteMode && pendingLongNote) {
      setPendingLongNote(null);
    }
  }, [isLongNoteMode, pendingLongNote]);

  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current !== null) {
        clearInterval(playbackIntervalRef.current);
      }
      if (playheadDragCleanupRef.current) {
        playheadDragCleanupRef.current();
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  // 기존 데이터에 duration/endTime/type 필드가 없을 때 보정
  useEffect(() => {
    setNotes((prev) => {
      if (!prev.length) return prev;
      let mutated = false;
      const normalized = prev.map((note) => {
        const durationCandidate =
          typeof note.duration === 'number'
            ? note.duration
            : Math.max(0, (note as any).endTime ? (note as any).endTime - note.time : 0);
        const duration = Number.isFinite(durationCandidate) ? Math.max(0, durationCandidate) : 0;
        const endTimeCandidate =
          typeof note.endTime === 'number' ? note.endTime : note.time + duration;
        const endTime = Number.isFinite(endTimeCandidate) ? endTimeCandidate : note.time + duration;
        const type = (note as any).type ?? (duration > 0 ? 'hold' : 'tap');
        if (
          note.duration !== duration ||
          note.endTime !== endTime ||
          (note as any).type !== type
        ) {
          mutated = true;
          return { ...note, duration, endTime, type };
        }
        return note;
      });
      return mutated ? normalized : prev;
    });
  }, []);

  // 시간을 가장 가까운 그리드 위치로 스냅
  const snapToGrid = useCallback(
    (timeMs: number): number => {
      if (!beatDuration || beatDuration <= 0) {
        return Math.max(0, Math.round(timeMs));
      }
      const safeDivision = Math.max(1, gridDivision);
      const gridUnit = beatDuration / safeDivision;
      if (!gridUnit || !isFinite(gridUnit)) {
        return Math.max(0, Math.round(timeMs));
      }
      const snappedTime = Math.round(timeMs / gridUnit) * gridUnit;
      return Math.max(0, snappedTime);
    },
    [beatDuration, gridDivision]
  );

  // 노트 추가
  const addNote = useCallback(
    (lane: Lane, time: number, endTime?: number) => {
      const snappedStart = snapToGrid(time);
      let resolvedEnd = typeof endTime === 'number' ? snapToGrid(endTime) : snappedStart;
      if (typeof endTime === 'number') {
        const minInterval =
          beatDuration && beatDuration > 0 ? beatDuration / Math.max(1, gridDivision) : 0;
        if (!isFinite(resolvedEnd)) {
          resolvedEnd = snappedStart;
        }
        if (resolvedEnd <= snappedStart) {
          resolvedEnd = snappedStart + (minInterval || 1);
        }
      }
      const duration = Math.max(0, resolvedEnd - snappedStart);

      setNotes((prev) => {
        // 같은 위치에 노트가 있는지 확인 (중복 방지)
        const hasNote = prev.some(
          (note) => note.lane === lane && Math.abs(note.time - snappedStart) < 1
        );
        if (hasNote) return prev;

        const newNote: Note = {
          id: noteIdRef.current++,
          lane,
          time: snappedStart,
          duration,
          endTime: snappedStart + duration,
          type: duration > 0 ? 'hold' : 'tap',
          y: 0,
          hit: false,
        };
        return [...prev, newNote].sort((a, b) => a.time - b.time);
      });
    },
    [snapToGrid, beatDuration, gridDivision]
  );

  // 노트 삭제
  const deleteNote = useCallback((noteId: number) => {
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
  }, []);

  // 레인 클릭 핸들러 (키보드 이벤트에서도 사용)
  const handleLaneClick = useCallback(
    (lane: Lane) => {
      if (!isLongNoteMode) {
        addNote(lane, currentTime);
        return;
      }

      const snappedTime = snapToGrid(currentTime);
      setPendingLongNote((prev) => {
        if (!prev || prev.lane !== lane) {
          return { lane, startTime: snappedTime };
        }

        const startTime = prev.startTime;
        const endTime = snappedTime;
        addNote(lane, startTime, endTime);
        return null;
      });
    },
    [addNote, currentTime, isLongNoteMode, snapToGrid]
  );

  // YouTube 플레이어 볼륨 동기화
  useEffect(() => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.setVolume?.(volume);
      } catch (error) {
        console.warn('볼륨 설정 실패:', error);
      }
    }
  }, [volume, youtubePlayer]);

  // 키보드 이벤트 핸들러
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // 입력 필드에 포커스가 있으면 무시
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // D, F, J, K 키로 각 레인에 노트 추가
      switch (event.key.toUpperCase()) {
        case 'D':
          event.preventDefault();
          handleLaneClick(0);
          break;
        case 'F':
          event.preventDefault();
          handleLaneClick(1);
          break;
        case 'J':
          event.preventDefault();
          handleLaneClick(2);
          break;
        case 'K':
          event.preventDefault();
          handleLaneClick(3);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleLaneClick]);

  const applySeek = useCallback(
    (timeMs: number, options?: { skipPlayerSync?: boolean }) => {
      const clampedTime = Math.max(0, Math.min(timelineDurationMs, timeMs));
      setCurrentTime(clampedTime);
      if (!options?.skipPlayerSync && youtubePlayer && youtubePlayerReadyRef.current) {
        try {
          youtubePlayer.seekTo(clampedTime / 1000, true);
        } catch (error) {
          console.error('YouTube 플레이어 위치 이동 실패:', error);
        }
      }
      return clampedTime;
    },
    [timelineDurationMs, youtubePlayer]
  );

  const updateCurrentTimeFromPointer = useCallback(
    (clientY: number, options?: { skipPlayerSync?: boolean }) => {
      const container = timelineScrollRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const contentY = clientY - rect.top + container.scrollTop;
      const newTime = yToTime(contentY);
      return applySeek(newTime, options);
    },
    [applySeek, yToTime]
  );

  const pausePlayback = useCallback(() => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.pauseVideo();
      } catch (error) {
        console.error('YouTube 플레이어 일시정지 실패:', error);
      }
    }

    if (playbackIntervalRef.current !== null) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    isManualPlaybackRef.current = false;

    setIsPlaying(false);
  }, [youtubePlayer]);

  const startPlayback = useCallback(
    (startFromTime?: number) => {
      const targetTime =
        typeof startFromTime === 'number' ? Math.max(0, startFromTime) : currentTime;

      if (youtubePlayer && youtubePlayerReadyRef.current) {
        try {
          youtubePlayer.setPlaybackRate?.(playbackSpeed);
          youtubePlayer.seekTo(targetTime / 1000, true);
          youtubePlayer.playVideo();
          setCurrentTime(targetTime);
          setIsPlaying(true);
        } catch (error) {
          console.error('YouTube 플레이어 재생 실패:', error);
        }
        return;
      }

      if (playbackIntervalRef.current !== null) {
        clearInterval(playbackIntervalRef.current);
      }

      setIsPlaying(true);
      isManualPlaybackRef.current = true;
      manualPlaybackStartTimeRef.current = targetTime;
      manualPlaybackStartTimestampRef.current = Date.now();
      setCurrentTime(targetTime);

      playbackIntervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - manualPlaybackStartTimestampRef.current;
        const newTime =
          manualPlaybackStartTimeRef.current + elapsed * playbackSpeedRef.current;
        setCurrentTime(newTime);
      }, 16);
    },
    [currentTime, playbackSpeed, youtubePlayer]
  );

  // 타임라인 클릭 핸들러
  const handleTimelineClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const wasPlaying = isPlaying;
      pausePlayback();
      const newTime = updateCurrentTimeFromPointer(event.clientY);
      if (wasPlaying && newTime !== null) {
        startPlayback(newTime);
      }
    },
    [isPlaying, pausePlayback, startPlayback, updateCurrentTimeFromPointer]
  );

  const handlePlayheadMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const wasPlaying = isPlaying;
      pausePlayback();

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';
      isDraggingPlayheadRef.current = true;

      const initialTime = updateCurrentTimeFromPointer(event.clientY, {
        skipPlayerSync: true,
      });
      lastDraggedPlayheadTimeRef.current =
        initialTime !== null ? initialTime : currentTime;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        const draggedTime = updateCurrentTimeFromPointer(moveEvent.clientY, {
          skipPlayerSync: true,
        });
        if (draggedTime !== null) {
          lastDraggedPlayheadTimeRef.current = draggedTime;
          // applySeek가 이미 호출되어 currentTime이 업데이트됨
        }
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        upEvent.preventDefault();
        const resumeTime = lastDraggedPlayheadTimeRef.current ?? currentTime;
        
        // cleanup 먼저 실행 (드래그 상태 해제는 나중에)
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        playheadDragCleanupRef.current = null;
        
        // YouTube 플레이어를 seek하고 currentTime 업데이트
        if (resumeTime !== null) {
          applySeek(resumeTime);
          
          // 약간의 지연 후에 드래그 플래그를 해제하여 YouTube 동기화가 다시 시작되도록 함
          // 이렇게 하면 YouTube 플레이어 seek가 먼저 완료됩니다
          setTimeout(() => {
            isDraggingPlayheadRef.current = false;
            if (wasPlaying) {
              startPlayback(resumeTime);
            }
          }, 100);
        } else {
          isDraggingPlayheadRef.current = false;
        }
      };

      const cleanupDrag = () => {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        playheadDragCleanupRef.current = null;
        isDraggingPlayheadRef.current = false;
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      playheadDragCleanupRef.current = cleanupDrag;
    },
    [applySeek, currentTime, isPlaying, pausePlayback, startPlayback, updateCurrentTimeFromPointer]
  );

  // YouTube 플레이어 초기화
  useEffect(() => {
    if (!youtubeVideoId || !youtubePlayerRef.current) return;

    let playerInstance: any = null;
    let isCancelled = false;

    // 기존 플레이어 정리 (안전한 버전)
    const cleanup = (player: any) => {
      if (player) {
        try {
          console.log('🧹 플레이어 정리 중...');
          // 플레이어가 유효한지 확인
          if (typeof player.destroy === 'function') {
            player.destroy();
          }
        } catch (e) {
          console.warn('플레이어 제거 실패 (무시):', e);
        }
      }
      setYoutubePlayer(null);
      youtubePlayerReadyRef.current = false;
    };

    // 현재 플레이어 정리
    setYoutubePlayer((currentPlayer: any) => {
      if (currentPlayer) {
        cleanup(currentPlayer);
      }
      return null;
    });
    youtubePlayerReadyRef.current = false;

    waitForYouTubeAPI().then(() => {
      // cleanup이 실행되었는지 확인
      if (isCancelled) return;
      
      if (!window.YT || !window.YT.Player) {
        console.error('YouTube IFrame API를 로드할 수 없습니다.');
        return;
      }

      const playerElement = youtubePlayerRef.current;
      if (!playerElement || isCancelled) return;
      
      // div 요소에 id 추가 (YouTube API가 필요로 함)
      const playerId = `youtube-player-${youtubeVideoId}`;
      
      // 기존 요소가 있으면 안전하게 제거
      const existingPlayer = document.getElementById(playerId);
      if (existingPlayer && existingPlayer !== playerElement) {
        try {
          // 부모 노드가 있는지 확인
          if (existingPlayer.parentNode) {
            existingPlayer.parentNode.removeChild(existingPlayer);
          }
        } catch (e) {
          console.warn('기존 플레이어 요소 제거 실패 (무시):', e);
        }
      }
      
      // 플레이어 요소 초기화
      if (playerElement.id !== playerId) {
        playerElement.id = playerId;
      }
      
      // 기존 iframe이 있으면 제거
      const existingIframe = playerElement.querySelector('iframe');
      if (existingIframe) {
        try {
          if (existingIframe.parentNode) {
            existingIframe.parentNode.removeChild(existingIframe);
          }
        } catch (e) {
          console.warn('기존 iframe 제거 실패 (무시):', e);
        }
      }
      
      if (isCancelled) return;
      
      console.log(`🎬 새 플레이어 초기화 시작: ${youtubeVideoId}`);
      
      try {
        playerInstance = new window.YT.Player(playerElement.id, {
          videoId: youtubeVideoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            enablejsapi: 1,
          } as any,
          events: {
            onReady: async (event: any) => {
              if (isCancelled) return;
              
              console.log('✅ YouTube 플레이어 준비 시작:', youtubeVideoId);
              
              // 플레이어가 이 비디오 ID와 일치하는지 확인
              const player = event.target;
              try {
                const currentVideoId = player.getVideoData?.()?.video_id;
                
                if (currentVideoId !== youtubeVideoId) {
                  console.warn('⚠️ 플레이어 비디오 ID 불일치:', currentVideoId, 'vs', youtubeVideoId);
                  return; // 다른 비디오의 플레이어이면 무시
                }
              } catch (e) {
                console.warn('비디오 ID 확인 실패:', e);
              }
              
              if (isCancelled) return;
              
              youtubePlayerReadyRef.current = true;
              setYoutubePlayer(player);
              playerInstance = player;
              console.log('✅ YouTube 플레이어 준비 완료');
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;
              
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false);
                setCurrentTime(0);
              }
            },
          },
        });
      } catch (e) {
        console.error('플레이어 생성 실패:', e);
      }
    });

    // cleanup 함수 반환 (컴포넌트 언마운트 또는 youtubeVideoId 변경 시)
    return () => {
      console.log('🧹 useEffect cleanup: 플레이어 정리');
      isCancelled = true;
      if (playerInstance) {
        cleanup(playerInstance);
      }
    };
  }, [youtubeVideoId]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        const availableRates = youtubePlayer.getAvailablePlaybackRates?.();
        const canUseRate = Array.isArray(availableRates)
          ? availableRates.includes(playbackSpeed)
          : true;
        if (canUseRate) {
          youtubePlayer.setPlaybackRate?.(playbackSpeed);
        } else if (availableRates && availableRates.length > 0) {
          youtubePlayer.setPlaybackRate?.(availableRates[0]);
        }
      } catch (error) {
        console.warn('재생 속도 설정 실패:', error);
      }
    }
  }, [playbackSpeed, youtubePlayer]);

  // YouTube 플레이어 볼륨 설정
  useEffect(() => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.setVolume?.(volume);
      } catch (error) {
        console.warn('볼륨 설정 실패:', error);
      }
    }
  }, [volume, youtubePlayer]);

  // YouTube 재생 시간 동기화 (좀 더 부드럽게 업데이트)
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;
    // 재생 중이 아닐 때는 동기화하지 않음
    if (!isPlaying) return;

    const syncInterval = setInterval(() => {
      // 드래그 중일 때는 YouTube 동기화를 건너뜀
      if (isDraggingPlayheadRef.current) return;
      
      try {
        const currentTime = youtubePlayer.getCurrentTime() * 1000;
        setCurrentTime(currentTime);
      } catch (e) {
        console.error('YouTube 플레이어 시간 동기화 실패:', e);
      }
    }, 33); // 약 30fps

    return () => clearInterval(syncInterval);
  }, [youtubePlayer, isPlaying]);

  // 재생선 자동 스크롤: 재생 중 재생선을 화면 중앙에 고정
  useEffect(() => {
    if (!isPlaying || !isAutoScrollEnabled || isDraggingPlayheadRef.current) return;

    const container = timelineScrollRef.current;
    if (!container || !playheadY || playheadY === 0) return;

    // 재생선을 화면 중앙에 맞추기
    const centerOffset = container.clientHeight / 2;
    const targetScrollTop = playheadY - centerOffset;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));

    // requestAnimationFrame으로 부드럽게 업데이트
    requestAnimationFrame(() => {
      if (!isDraggingPlayheadRef.current && container) {
        container.scrollTop = clampedScrollTop;
      }
    });
  }, [isPlaying, isAutoScrollEnabled, playheadY, currentTime]);

  // YouTube URL 처리
  const handleYouTubeUrlSubmit = useCallback(() => {
    if (!youtubeUrl.trim()) {
      alert('YouTube URL을 입력해주세요.');
      return;
    }

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      alert('유효한 YouTube URL이 아닙니다.');
      return;
    }

    console.log('📺 YouTube URL 로드 요청:', videoId);

    // 기존 플레이어 제거
    if (youtubePlayer) {
      try {
        console.log('🧹 기존 플레이어 제거 중...');
        youtubePlayer.destroy();
      } catch (e) {
        console.warn('기존 플레이어 제거 실패 (무시):', e);
      }
    }

    // 상태 초기화
    setYoutubePlayer(null);
    youtubePlayerReadyRef.current = false;
    
    // 같은 비디오를 다시 로드하는 경우를 위해, 먼저 null로 설정한 다음 videoId 설정
    // 이렇게 하면 useEffect가 항상 트리거됨
    if (youtubeVideoId === videoId) {
      console.log('🔄 같은 비디오 재로드, 강제로 플레이어 초기화');
      setYoutubeVideoId(null);
      // 다음 틱에서 videoId 설정
      setTimeout(() => {
        setYoutubeVideoId(videoId);
      }, 0);
    } else {
      // 새 비디오 ID 설정 (이렇게 하면 useEffect가 트리거되어 새 플레이어 초기화)
      setYoutubeVideoId(videoId);
    }
  }, [youtubeUrl, youtubePlayer, youtubeVideoId]);

  // 클립보드에서 YouTube URL 붙여넣기 및 자동 로드
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        const trimmedText = text.trim();
        setYoutubeUrl(trimmedText);
        
        // 유효한 YouTube URL이면 자동으로 로드
        const videoId = extractYouTubeVideoId(trimmedText);
        if (videoId) {
          // 기존 플레이어 제거
          if (youtubePlayer) {
            try {
              youtubePlayer.destroy();
            } catch (e) {
              console.error('기존 플레이어 제거 실패:', e);
            }
          }

          setYoutubeVideoId(videoId);
          setYoutubePlayer(null);
          youtubePlayerReadyRef.current = false;
        } else {
          // 유효하지 않은 URL인 경우 알림
          alert('유효한 YouTube URL이 아닙니다. URL을 확인해주세요.');
        }
      } else {
        alert('클립보드가 비어있습니다.');
      }
    } catch (error) {
      console.error('클립보드 읽기 실패:', error);
      alert('클립보드를 읽을 수 없습니다. 수동으로 붙여넣어주세요.');
    }
  }, [youtubePlayer, youtubeVideoId]);

  // BPM 탭 계산
  const handleBpmTap = useCallback(() => {
    const result = tapBpmCalculatorRef.current.tap();
    if (result && result.confidence !== undefined) {
      setTapBpmResult({
        bpm: result.bpm,
        confidence: result.confidence,
      });
      if (result.confidence > 0.7) {
        setBpm(Math.round(result.bpm));
      }
    }
  }, []);

  // BPM 수동 입력
  const handleBpmInput = useCallback((value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && isValidBPM(numValue)) {
      setBpm(numValue);
      setIsBpmInputOpen(false);
    } else {
      alert('유효한 BPM을 입력해주세요. (30-300)');
    }
  }, []);

  // 재생/일시정지
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, pausePlayback, startPlayback]);

  // 처음으로 돌아가기
  const handleRewind = useCallback(() => {
    pausePlayback();
    applySeek(0);
  }, [applySeek, pausePlayback]);

  // 재생 중지
  const stopPlayback = useCallback(() => {
    pausePlayback();
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.stopVideo();
      } catch (error) {
        console.error('YouTube 플레이어 중지 실패:', error);
      }
    }
    applySeek(0);
  }, [applySeek, pausePlayback, youtubePlayer]);

  const handleTestRun = useCallback(() => {
    if (!onTest) {
      alert('테스트 기능을 사용할 수 없습니다.');
      return;
    }
    if (!notes.length) {
      alert('노트가 없습니다. 노트를 추가한 뒤 테스트하세요.');
      return;
    }

    const startMs = getClampedTestStart();
    const hasAvailableNotes = notes.some((note) => {
      const duration = typeof note.duration === 'number' ? note.duration : 0;
      const endTime = typeof note.endTime === 'number' ? note.endTime : note.time + duration;
      return endTime >= startMs;
    });

    if (!hasAvailableNotes) {
      alert('선택한 시작 위치 이후에 노트가 없습니다.');
      return;
    }

    pausePlayback();

    onTest({
      notes: notes.map((note) => ({ ...note })),
      startTimeMs: startMs,
      youtubeVideoId,
      youtubeUrl,
      playbackSpeed,
    });
  }, [getClampedTestStart, notes, onTest, pausePlayback, playbackSpeed, youtubeUrl, youtubeVideoId]);

  // 저장
  const handleSave = useCallback(() => {
    if (notes.length === 0) {
      alert('노트가 없습니다. 노트를 추가한 후 저장해주세요.');
      return;
    }
    
    // 채보 데이터 준비
    const chartData = {
      notes: notes.map(({ id, lane, time, duration, endTime, type }) => ({
        id,
        lane,
        time,
        duration,
        endTime,
        type,
      })),
      bpm: bpm,
      timeSignatures: timeSignatures,
      timeSignatureOffset: timeSignatureOffset,
      youtubeVideoId: youtubeVideoId,
      youtubeUrl: youtubeUrl,
      volume: volume,
      createdAt: new Date().toISOString(),
    };
    
    // localStorage에 저장
    const chartName = prompt('채보 이름을 입력하세요:', `Chart_${Date.now()}`);
    if (chartName) {
      const savedCharts = JSON.parse(localStorage.getItem('savedCharts') || '{}');
      savedCharts[chartName] = chartData;
      localStorage.setItem('savedCharts', JSON.stringify(savedCharts));
      
      alert(`채보 "${chartName}"이(가) 저장되었습니다!`);
      onSave(notes);
    }
  }, [notes, bpm, timeSignatures, timeSignatureOffset, youtubeVideoId, youtubeUrl, volume, onSave]);

  // 온라인 공유
  const handleShareChart = useCallback(async () => {
    if (!isSupabaseConfigured) {
      alert('Supabase ?섍꼍 蹂?섍? ?ㅼ젙?섏? ?딆븘 怨듭쑀 湲곕뒫???ъ슜?????놁뒿?덈떎. 猷⑦듃 ?붾젆?곕━??CHART_SHARING_SETUP.md瑜?李멸퀬???섍꼍 蹂?섎? ?ㅼ젙?????ㅼ떆 ?쒕룄?댁＜?몄슂.');
      setUploadStatus('Supabase ?섍꼍 蹂?섍? ?놁뼱 怨듭쑀?????놁뒿?덈떎.');
      return;
    }
    if (notes.length === 0) {
      alert('노트가 없습니다. 노트를 추가한 후 공유해주세요.');
      return;
    }
    
    if (!shareTitle.trim() || !shareAuthor.trim()) {
      alert('제목과 작성자를 입력해주세요.');
      return;
    }
    
    setIsUploading(true);
    setUploadStatus('업로드 중...');
    
    try {
      const chartData = {
        notes: notes.map(({ id, lane, time, duration, endTime, type }) => ({
          id,
          lane,
          time,
          duration,
          endTime,
          type,
        })),
        bpm,
        timeSignatures,
        timeSignatureOffset,
        youtubeVideoId,
        youtubeUrl,
        playbackSpeed,
      };
      
      // 이미지가 있으면 먼저 업로드
      let previewImageUrl: string | undefined = undefined;
      console.log('업로드 시작, previewImageFile:', previewImageFile);
      if (previewImageFile) {
        try {
          setUploadStatus('이미지 업로드 중...');
          console.log('이미지 업로드 시작:', previewImageFile.name, previewImageFile.size);
          // 임시 ID로 이미지 업로드 (실제 채보 ID는 나중에 업데이트)
          const tempId = `temp-${Date.now()}`;
          previewImageUrl = await chartAPI.uploadPreviewImage(tempId, previewImageFile);
          console.log('이미지 업로드 성공, URL:', previewImageUrl);
        } catch (imageError: any) {
          console.error('이미지 업로드 실패:', imageError);
          console.error('에러 상세:', {
            message: imageError.message,
            statusCode: imageError.statusCode,
            error: imageError.error,
            fullError: imageError
          });
          const errorMsg = imageError?.message || '알 수 없는 오류';
          const continueWithoutImage = confirm(`이미지 업로드에 실패했습니다.\n\n에러: ${errorMsg}\n\n이미지 없이 계속하시겠습니까?`);
          if (!continueWithoutImage) {
            setIsUploading(false);
            setUploadStatus('');
            return;
          }
        }
      } else {
        console.log('previewImageFile이 없어서 이미지 업로드 건너뜀');
      }
      
      // 채보 업로드 (이미지 URL 포함)
      await chartAPI.uploadChart({
        title: shareTitle.trim(),
        author: shareAuthor.trim(),
        bpm,
        difficulty: shareDifficulty,
        description: shareDescription.trim() || undefined,
        data_json: JSON.stringify(chartData),
        youtube_url: youtubeUrl || undefined,
        preview_image: previewImageUrl,
      });
      
      console.log('채보 업로드 성공, preview_image:', previewImageUrl);
      setUploadStatus('업로드 완료! 관리자 승인 후 공개됩니다.');
      setIsShareModalOpen(false);
      
      // 폼 초기화
      setShareTitle('');
      setShareAuthor('');
      setShareDescription('');
      setShareDifficulty('Normal');
      setPreviewImageFile(null);
      setPreviewImageUrl(null);
      
      setTimeout(() => {
        setUploadStatus('');
      }, 3000);
    } catch (error: any) {
      console.error('채보 업로드 실패:', error);
      setUploadStatus(`업로드 실패: ${error.message || '알 수 없는 오류'}`);
    } finally {
      setIsUploading(false);
    }
  }, [notes, bpm, timeSignatures, timeSignatureOffset, youtubeVideoId, youtubeUrl, playbackSpeed, shareTitle, shareAuthor, shareDifficulty, shareDescription, previewImageFile]);

  // 채보 로드
  const handleLoad = useCallback(() => {
    try {
      const savedCharts = JSON.parse(localStorage.getItem('savedCharts') || '{}');
      const chartNames = Object.keys(savedCharts);
      
      if (chartNames.length === 0) {
        alert('저장된 채보가 없습니다.');
        return;
      }
      
      const chartName = prompt(
        `로드할 채보를 선택하세요:\n${chartNames.join(', ')}`,
        chartNames[0]
      );
      
      if (!chartName || !savedCharts[chartName]) {
        return;
      }
      
      const chartData = savedCharts[chartName];
      
      // 노트 데이터 검증 및 로드
      if (chartData.notes && Array.isArray(chartData.notes)) {
        // noteIdRef 초기화
        noteIdRef.current = 0;
        
        const loadedNotes: Note[] = chartData.notes
          .map((noteData: any) => {
            // 필수 필드 검증
            if (typeof noteData.lane !== 'number' || typeof noteData.time !== 'number') {
              console.warn('유효하지 않은 노트 데이터:', noteData);
              return null;
            }

            const startTime = Number(noteData.time) || 0;
            const rawDuration =
              typeof noteData.duration === 'number'
                ? Number(noteData.duration)
                : typeof noteData.endTime === 'number'
                ? Number(noteData.endTime) - startTime
                : 0;
            const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;
            const endTime =
              typeof noteData.endTime === 'number'
                ? Number(noteData.endTime)
                : startTime + duration;

            return {
              id: noteIdRef.current++,
              lane: noteData.lane as Lane,
              time: startTime,
              duration,
              endTime,
              type: duration > 0 ? 'hold' : 'tap',
              y: 0,
              hit: false,
            };
          })
          .filter((note: Note | null): note is Note => note !== null);
        
        setNotes(loadedNotes);
      } else {
        setNotes([]);
      }
      
      // 재생 상태 초기화
      setIsPlaying(false);
      setCurrentTime(0);
      
      // 기존 플레이어 정리
      if (youtubePlayer) {
        try {
          youtubePlayer.destroy();
        } catch (e) {
          console.warn('기존 플레이어 제거 실패:', e);
        }
      }
      setYoutubePlayer(null);
      youtubePlayerReadyRef.current = false;
      
      // BPM 복원
      if (chartData.bpm && typeof chartData.bpm === 'number') {
        setBpm(chartData.bpm);
      }

      // 박자 전환 정보 복원
      if (chartData.timeSignatures && Array.isArray(chartData.timeSignatures)) {
        setTimeSignatures(chartData.timeSignatures);
      }

      // 마디 오프셋 복원
      if (
        typeof chartData.timeSignatureOffset === 'number'
      ) {
        setTimeSignatureOffset(chartData.timeSignatureOffset);
      } else {
        setTimeSignatureOffset(0); // 기본값
      }
      
      // YouTube 정보 복원 (플레이어는 useEffect에서 자동 초기화됨)
      if (chartData.youtubeVideoId) {
        setYoutubeVideoId(chartData.youtubeVideoId);
        if (chartData.youtubeUrl) {
          setYoutubeUrl(chartData.youtubeUrl);
        } else {
          setYoutubeUrl('');
        }
      } else {
        setYoutubeVideoId(null);
        setYoutubeUrl('');
      }
      
      // 음량 복원
      if (typeof chartData.volume === 'number') {
        setVolume(Math.max(0, Math.min(100, chartData.volume)));
      } else {
        setVolume(100); // 기본값
      }
      
      alert(`채보 "${chartName}"이(가) 로드되었습니다!`);
    } catch (error) {
      console.error('채보 로드 오류:', error);
      alert('채보를 로드하는 중 오류가 발생했습니다. 콘솔을 확인하세요.');
    }
  }, [youtubePlayer]);

  // 노트의 y 좌표 계산
  const getNoteY = useCallback((note: Note) => timeToY(note.time), [timeToY]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2000,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          backgroundColor: '#2a2a2a',
          borderBottom: '2px solid #444',
        }}
      >
        {/* 메뉴 토글 버튼 */}
        <div
          style={{
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: isMenuOpen ? '1px solid #444' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 
              style={{ 
                color: '#fff', 
                margin: 0, 
                fontSize: '20px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              채보 에디터
            </h2>
            <span 
              style={{ 
                color: '#aaa', 
                fontSize: '18px', 
                transition: 'transform 0.3s', 
                transform: isMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              ▼
            </span>
            {/* 플레이어 컨트롤 버튼들 */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: '20px' }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={handleRewind}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#607D8B',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#546E7A';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#607D8B';
                }}
                title="처음으로 돌아가기 (0초)"
              >
                ⏮ 처음으로
              </button>
              <button
                onClick={togglePlayback}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: isPlaying ? '#f44336' : '#4CAF50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                {isPlaying ? '⏸ 일시정지' : '▶ 재생'}
              </button>
              <button
                onClick={stopPlayback}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#757575',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                ⏹ 중지
              </button>
              <button
                onClick={() => setIsAutoScrollEnabled((prev) => !prev)}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: isAutoScrollEnabled ? '#4CAF50' : '#757575',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                {isAutoScrollEnabled ? '📌 고정' : '📌 해제'}
              </button>
              <button
                onClick={handleLoad}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#9C27B0',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                📂 로드
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#2196F3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                💾 저장
              </button>
              {onOpenSubtitleEditor && (
                <button
                  onClick={() => {
                    const chartId = `local-${Date.now()}`;
                    onOpenSubtitleEditor({
                      chartId,
                      notes,
                      bpm,
                      youtubeVideoId: extractYouTubeVideoId(youtubeUrl),
                      youtubeUrl,
                      title: 'Untitled',
                    });
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    backgroundColor: '#E91E63',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                  title="Subtitle Editor"
                >
                  Subtitle
                </button>
              )}
              <button
                onClick={onCancel}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                ✖ 나가기
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ color: '#FFD700', fontSize: '16px', fontWeight: 'bold' }}>
              BPM: {Math.round(bpm)}
            </span>
          </div>
        </div>

        {/* 접을 수 있는 메뉴 내용 */}
        {isMenuOpen && (
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
            }}
          >
            {/* YouTube URL 입력 */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="YouTube URL 입력..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleYouTubeUrlSubmit();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  backgroundColor: '#1f1f1f',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  width: '300px',
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePasteFromClipboard();
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#757575',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#616161';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#757575';
                }}
                title="클립보드에서 붙여넣기"
              >
                📋 붙여넣기
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleYouTubeUrlSubmit();
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#FF0000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                ▶ 로드
              </button>
            </div>
            
            {/* BPM 설정 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#fff', fontSize: '14px' }}>BPM:</span>
                <span style={{ color: '#FFD700', fontSize: '16px', fontWeight: 'bold' }}>{Math.round(bpm)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBpmInputOpen(!isBpmInputOpen);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#2196F3',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  입력
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBpmTap();
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#4CAF50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  탭 ({tapBpmCalculatorRef.current.getTapCount()})
                </button>
                {tapBpmResult && (
                  <span style={{ color: '#aaa', fontSize: '12px' }}>
                    (신뢰도: {(tapBpmResult.confidence * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            
            {isBpmInputOpen && (
              <input
                type="number"
                min="30"
                max="300"
                placeholder="BPM 입력"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleBpmInput(e.currentTarget.value);
                  }
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  backgroundColor: '#1f1f1f',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  width: '200px',
                }}
              />
            )}
            
            </div>
          </div>
        )}
      </div>

      {/* 메인 에디터 영역 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 왼쪽 사이드바 - 기본 정보 */}
        <div
          style={{
            width: '150px',
            backgroundColor: '#1f1f1f',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              현재 시간
            </div>
            <div style={{ color: '#aaa', fontSize: '14px' }}>
              {currentTime.toFixed(0)}ms
            </div>
            <div style={{ color: '#aaa', fontSize: '14px' }}>
              {(currentTime / 1000).toFixed(2)}s
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              노트 개수
            </div>
            <div style={{ color: '#aaa', fontSize: '14px' }}>{notes.length}개</div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              줌
            </div>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const slider = e.currentTarget;
                const rect = slider.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                
                // 클릭한 위치의 줌 값 계산 및 즉시 적용
                const clickZoom = 0.5 + ratio * (3 - 0.5);
                setZoom(clickZoom);
                
                // 드래그 시작 설정
                slider.style.cursor = 'grabbing';
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
                
                const startX = e.clientX;
                const startZoom = clickZoom; // 클릭한 위치의 줌 값에서 시작
                
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  moveEvent.preventDefault();
                  moveEvent.stopPropagation();
                  const deltaX = moveEvent.clientX - startX;
                  const zoomChange = (deltaX / rect.width) * 2.5;
                  const newZoom = Math.max(0.5, Math.min(3, startZoom + zoomChange));
                  setZoom(newZoom);
                };
                
                const handleMouseUp = (upEvent: MouseEvent) => {
                  upEvent.preventDefault();
                  upEvent.stopPropagation();
                  slider.style.cursor = 'pointer';
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp, { once: true });
              }}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ color: '#aaa', fontSize: '12px', marginTop: '5px' }}>
              {zoom.toFixed(1)}x
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              재생 속도
            </div>
            <input
              type="range"
              min={0}
              max={PLAYBACK_SPEED_OPTIONS.length - 1}
              step={1}
              value={playbackSpeedIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                const nextSpeed = PLAYBACK_SPEED_OPTIONS[idx] ?? playbackSpeed;
                setPlaybackSpeed(nextSpeed);
              }}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
            />
            <div style={{ color: '#aaa', fontSize: '12px', marginTop: '4px' }}>
              현재: {playbackSpeed}x
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '10px', marginTop: '2px' }}>
              {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                <span key={`speed-label-${speed}`}>{speed}x</span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              음량 
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => {
                setVolume(parseInt(e.target.value, 10));
              }}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
            />
            <div style={{ color: '#aaa', fontSize: '12px', marginTop: '4px' }}>
              현재: {volume}%
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              박자 / 격자
            </div>
            <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '6px' }}>
              현재 박자: {activeTimeSignature.beatsPerMeasure}/4
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleAddTimeSignatureChange(4)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor:
                      activeTimeSignature.beatsPerMeasure === 4 ? '#FFC107' : '#424242',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  4/4로 설정
                </button>
                <button
                  onClick={() => handleAddTimeSignatureChange(3)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor:
                      activeTimeSignature.beatsPerMeasure === 3 ? '#FFC107' : '#424242',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  3/4로 설정
                </button>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ color: '#aaa', fontSize: '12px' }}>세분화:</span>
                <button
                  onClick={() => setGridDivision(1)}
                  style={{
                    padding: '2px 6px',
                    fontSize: '11px',
                    backgroundColor: gridDivision === 1 ? '#4CAF50' : '#424242',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  기본
                </button>
                <button
                  onClick={() => setGridDivision(2)}
                  style={{
                    padding: '2px 6px',
                    fontSize: '11px',
                    backgroundColor: gridDivision === 2 ? '#4CAF50' : '#424242',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  2분할
                </button>
                <button
                  onClick={() => setGridDivision(3)}
                  style={{
                    padding: '2px 6px',
                    fontSize: '11px',
                    backgroundColor: gridDivision === 3 ? '#4CAF50' : '#424242',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  셋잇단
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '4px',
                }}
              >
                <span
                  style={{
                    color: '#aaa',
                    fontSize: '12px',
                  }}
                >
                  마디 오프셋
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <button
                    onClick={() => setTimeSignatureOffset((prev) => prev - 1)}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: '#424242',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                    title="마디 시작선을 한 칸 앞으로 이동"
                  >
                    ◀
                  </button>
                  <span
                    style={{
                      color: '#fff',
                      fontSize: '12px',
                      minWidth: '30px',
                      textAlign: 'center',
                    }}
                  >
                    {timeSignatureOffset > 0
                      ? `+${timeSignatureOffset}`
                      : timeSignatureOffset}
                  </span>
                  <button
                    onClick={() => setTimeSignatureOffset((prev) => prev + 1)}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: '#424242',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                    title="마디 시작선을 한 칸 뒤로 이동"
                  >
                    ▶
                  </button>
                </div>
                {timeSignatureOffset !== 0 && (
                  <button
                    onClick={() => setTimeSignatureOffset(0)}
                    style={{
                      marginTop: '2px',
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: '#757575',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                    title="마디 오프셋 초기화"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* 에디터 캔버스 */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              width: '500px',
              height: '100%',
              margin: '0 auto',
              position: 'relative',
              backgroundColor: '#1f1f1f',
            }}
          >
            {/* 키 레인 영역 배경 */}
            <div
              style={{
                position: 'absolute',
                left: '50px',
                top: 0,
                width: '400px',
                height: '100%',
                backgroundColor: '#2a2a2a',
              }}
            />

            {/* 레인 구분선 */}
            {[50, 150, 250, 350, 450].map((x) => (
              <div
                key={x}
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: 0,
                  width: '2px',
                  height: '100%',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  transform: 'translateX(-50%)',
                }}
              />
            ))}

            {/* 타임라인 스크롤 영역 */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                // 고정 모드일 때는 사용자가 스크롤로 위치를 바꾸지 못하도록 overflow를 숨김
                overflowY: isAutoScrollEnabled ? 'hidden' : 'auto',
                cursor: 'default',
              }}
              onClick={handleTimelineClick}
              ref={timelineScrollRef}
            >
              {/* 시간 격자 */}
              <div
                style={{
                  position: 'relative',
                  height: `${timelineContentHeight}px`,
                }}
              >
                {/* BPM + 박자 기반 비트 / 마디 격자 */}
                {(() => {
                  if (!beatDuration || beatDuration <= 0) return null;
                  const totalBeats = Math.ceil(timelineDurationMs / beatDuration) + 16;
                  let tsIndex = 0;
                  let currentTS =
                    sortedTimeSignatures.length > 0
                      ? sortedTimeSignatures[0]
                      : { id: -1, beatIndex: 0, beatsPerMeasure: 4 };

                  return Array.from({ length: totalBeats }).map((_, i) => {
                    // 현재 비트에 해당하는 박자 정보 찾기
                    while (
                      tsIndex + 1 < sortedTimeSignatures.length &&
                      sortedTimeSignatures[tsIndex + 1].beatIndex <= i
                    ) {
                      tsIndex += 1;
                      currentTS = sortedTimeSignatures[tsIndex];
                    }

                    const beatsPerMeasure = currentTS.beatsPerMeasure || 4;
                    const timeMs = i * beatDuration;
                    const y = timeToY(timeMs);
                    if (y < 0) {
                      return null;
                    }
                    // 마디 오프셋 적용: 늦게 시작하는 곡을 위해 마디 시작선 조정
                    const adjustedBeatIndex = i - currentTS.beatIndex - timeSignatureOffset;
                    const isMeasureStart =
                      adjustedBeatIndex % beatsPerMeasure === 0;

                    return (
                      <React.Fragment key={`beat-${i}`}>
                        <div
                          style={{
                            position: 'absolute',
                            left: '50px',
                            right: '50px',
                            top: `${y}px`,
                            height: isMeasureStart ? '3px' : '1px',
                            backgroundColor: isMeasureStart
                              ? 'rgba(255, 215, 0, 0.9)'
                              : 'rgba(255, 255, 255, 0.25)',
                            pointerEvents: 'none',
                          }}
                        />
                        {/* 셋잇단 등 세분화 격자 */}
                        {gridDivision > 1 &&
                          Array.from({ length: gridDivision - 1 }).map((__, subIdx) => {
                            const subTimeMs =
                              timeMs + (beatDuration * (subIdx + 1)) / gridDivision;
                            const subY = timeToY(subTimeMs);
                            if (subY < 0) return null;
                            return (
                              <div
                                key={`beat-${i}-sub-${subIdx}`}
                                style={{
                                  position: 'absolute',
                                  left: '50px',
                                  right: '50px',
                                  top: `${subY}px`,
                                  height: '1px',
                                  backgroundColor:
                                    gridDivision === 3
                                      ? 'rgba(0, 200, 255, 0.35)'
                                      : 'rgba(200, 200, 255, 0.25)',
                                  pointerEvents: 'none',
                                }}
                              />
                            );
                          })}
                      </React.Fragment>
                    );
                  });
                })()}
                
                {/* 기본 시간 격자 (1초 간격) */}
                {(() => {
                  const totalSeconds = Math.ceil(timelineDurationMs / 1000);
                  return Array.from({ length: totalSeconds + 8 }).map((_, i) => {
                    const timeMs = i * 1000;
                    const y = timeToY(timeMs);
                    if (y < 0) {
                      return null;
                    }
                    return (
                      <div
                        key={`second-${i}`}
                        style={{
                          position: 'absolute',
                          left: '50px',
                          right: '50px',
                          top: `${y}px`,
                          height: '1px',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  });
                })()}

                {/* 재생선 (Playhead) */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50px',
                    width: '400px',
                    top: `${playheadY}px`,
                    height: '4px',
                    backgroundColor: '#4CAF50',
                    boxShadow: '0 0 12px rgba(76, 175, 80, 0.8)',
                    pointerEvents: 'none',
                    zIndex: 4,
                  }}
                >
                  <div
                    onMouseDown={handlePlayheadMouseDown}
                    title="재생선 드래그"
                    style={{
                      position: 'absolute',
                      right: '-32px',
                      top: '-10px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#4CAF50',
                      border: '2px solid #2E7D32',
                      boxShadow: '0 0 8px rgba(76, 175, 80, 0.6)',
                      cursor: 'ns-resize',
                      pointerEvents: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      userSelect: 'none',
                    }}
                  >
                    ≡
                  </div>
                </div>

                {/* 노트 렌더링 */}
                {notes.map((note) => {
                  const startY = getNoteY(note);
                  const isHold = note.duration > 0;
                  const endY = isHold ? timeToY(note.endTime) : startY;
                  const noteHeight = isHold
                    ? Math.max(30, Math.abs(endY - startY))
                    : TAP_NOTE_HEIGHT;
                  const topPosition = isHold ? Math.min(startY, endY) : startY;
                  const isOddLane = note.lane === 0 || note.lane === 2;
                  const baseColor = isOddLane ? '#FF6B6B' : '#4ECDC4';
                  const borderColor = isOddLane ? '#EE5A52' : '#45B7B8';
                  const holdGradient = isOddLane
                    ? 'linear-gradient(180deg, rgba(255,107,107,0.95) 0%, rgba(255,138,128,0.65) 100%)'
                    : 'linear-gradient(180deg, rgba(78,205,196,0.95) 0%, rgba(94,234,212,0.65) 100%)';
                  return (
                    <div
                      key={note.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${LANE_POSITIONS[note.lane]}px`,
                        top: `${topPosition}px`,
                        width: '100px',
                        height: `${noteHeight}px`,
                        background: isHold ? holdGradient : baseColor,
                        border: `3px solid ${borderColor}`,
                        borderRadius: isHold ? '14px' : '8px',
                        transform: isHold ? 'translateX(-50%)' : 'translate(-50%, -50%)',
                        cursor: 'pointer',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={
                        isHold
                          ? `롱노트: ${note.time.toFixed(0)}ms ~ ${note.endTime.toFixed(0)}ms`
                          : `클릭하여 삭제 (${note.time.toFixed(0)}ms)`
                      }
                    >
                      {isHold && (
                        <>
                          <div
                            style={{
                              position: 'absolute',
                              top: '6px',
                              left: '50%',
                              width: '70%',
                              height: '8px',
                              backgroundColor: 'rgba(255,255,255,0.5)',
                              borderRadius: '999px',
                              transform: 'translateX(-50%)',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '6px',
                              left: '50%',
                              width: '70%',
                              height: '8px',
                              backgroundColor: 'rgba(255,255,255,0.35)',
                              borderRadius: '999px',
                              transform: 'translateX(-50%)',
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* YouTube 플레이어 (숨김 - 오디오만 재생) */}
            {youtubeVideoId && (
              <div
                ref={youtubePlayerRef}
                style={{
                  position: 'absolute',
                  bottom: '-1000px',
                  left: '-1000px',
                  width: '1px',
                  height: '1px',
                  opacity: 0,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                  zIndex: -1,
                }}
              />
            )}
          </div>
        </div>

        {/* 오른쪽 사이드바 - 롱노트 & 테스트 */}
        <div
          style={{
            width: '180px',
            backgroundColor: '#1f1f1f',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
              롱노트
            </div>
            <button
              onClick={() => setIsLongNoteMode((prev) => !prev)}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                backgroundColor: isLongNoteMode ? '#FF7043' : '#424242',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              {isLongNoteMode ? '롱노트 해제' : '롱노트 활성화'}
            </button>
            {isLongNoteMode && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '6px',
                  color: '#ddd',
                  fontSize: '11px',
                  lineHeight: 1.4,
                }}
              >
                {pendingLongNote
                  ? `${LANE_KEY_LABELS[pendingLongNote.lane]} 시작됨. 종료 위치에서 동일 키 재입력.`
                  : '키를 두 번 눌러 시작/종료 지정'}
                {pendingLongNote && (
                  <button
                    onClick={() => setPendingLongNote(null)}
                    style={{
                      marginTop: '6px',
                      padding: '4px 8px',
                      fontSize: '10px',
                      backgroundColor: '#616161',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    취소
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
              테스트
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                backgroundColor: '#2a2a2a',
                padding: '12px',
                borderRadius: '6px',
              }}
            >
              <label
                style={{
                  color: '#ddd',
                  fontSize: '11px',
                }}
              >
                시작 위치 (ms)
              </label>
              <input
                type="number"
                min="0"
                value={testStartInput}
                onChange={(e) => setTestStartInput(e.target.value)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid #555',
                  backgroundColor: '#1f1f1f',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={handleTestStartFromCurrent}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    fontSize: '10px',
                    backgroundColor: '#424242',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  현재
                </button>
                <button
                  onClick={handleResetTestStart}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    fontSize: '10px',
                    backgroundColor: '#555',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  처음
                </button>
              </div>
              <button
                onClick={handleTestRun}
                disabled={!onTest}
                style={{
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  backgroundColor: onTest ? '#4CAF50' : '#616161',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: onTest ? 'pointer' : 'not-allowed',
                }}
              >
                🎮 테스트 실행
              </button>
            </div>
          </div>

          {/* 온라인 공유 */}
          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
              온라인 공유
            </div>
            <button
              onClick={() => setIsShareModalOpen(true)}
              style={{
                padding: '10px 12px',
                fontSize: '13px',
                fontWeight: 'bold',
                backgroundColor: '#2196F3',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              🌐 채보 공유하기
            </button>
          </div>
        </div>
      </div>

      {/* 공유 모달 */}
      {isShareModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => !isUploading && setIsShareModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#2a2a2a',
              padding: '30px',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#fff', marginBottom: '20px', fontSize: '20px' }}>
              채보 공유하기
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ color: '#ddd', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  제목 *
                </label>
                <input
                  type="text"
                  value={shareTitle}
                  onChange={(e) => setShareTitle(e.target.value)}
                  placeholder="채보 제목을 입력하세요"
                  disabled={isUploading}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: '#1f1f1f',
                    color: '#fff',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#ddd', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  작성자 *
                </label>
                <input
                  type="text"
                  value={shareAuthor}
                  onChange={(e) => setShareAuthor(e.target.value)}
                  placeholder="작성자 이름을 입력하세요"
                  disabled={isUploading}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: '#1f1f1f',
                    color: '#fff',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#ddd', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  난이도
                </label>
                <select
                  value={shareDifficulty}
                  onChange={(e) => setShareDifficulty(e.target.value)}
                  disabled={isUploading}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: '#1f1f1f',
                    color: '#fff',
                    fontSize: '14px',
                  }}
                >
                  <option value="Easy">Easy</option>
                  <option value="Normal">Normal</option>
                  <option value="Hard">Hard</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>

              <div>
                <label style={{ color: '#ddd', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  설명
                </label>
                <textarea
                  value={shareDescription}
                  onChange={(e) => setShareDescription(e.target.value)}
                  placeholder="채보에 대한 설명을 입력하세요 (선택사항)"
                  disabled={isUploading}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: '#1f1f1f',
                    color: '#fff',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#ddd', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  미리보기 이미지 (선택사항)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    console.log('파일 선택됨:', file);
                    if (file) {
                      // 파일 크기 제한 (5MB)
                      if (file.size > 5 * 1024 * 1024) {
                        alert('이미지 크기는 5MB 이하여야 합니다.');
                        e.target.value = '';
                        return;
                      }
                      setPreviewImageFile(file);
                      console.log('previewImageFile 상태 설정됨:', file.name);
                      // 미리보기 URL 생성
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        setPreviewImageUrl(event.target?.result as string);
                        console.log('미리보기 URL 생성됨');
                      };
                      reader.readAsDataURL(file);
                    } else {
                      setPreviewImageFile(null);
                      setPreviewImageUrl(null);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #555',
                    backgroundColor: '#1f1f1f',
                    color: '#fff',
                    fontSize: '14px',
                  }}
                />
                {previewImageUrl && (
                  <div
                    style={{
                      marginTop: '10px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      backgroundColor: '#1f1f1f',
                      maxHeight: '200px',
                    }}
                  >
                    <img
                      src={previewImageUrl}
                      alt="미리보기"
                      style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        maxHeight: '200px',
                        objectFit: 'contain',
                      }}
                    />
                  </div>
                )}
                <div style={{ color: '#999', fontSize: '11px', marginTop: '5px' }}>
                  권장 크기: 16:9 비율, 최대 5MB
                </div>
              </div>

              <div style={{ color: '#aaa', fontSize: '12px', padding: '10px', backgroundColor: '#1f1f1f', borderRadius: '6px' }}>
                <strong>채보 정보:</strong><br />
                노트 수: {notes.length}개<br />
                BPM: {bpm}<br />
                {youtubeUrl && `YouTube: ${youtubeUrl}`}
              </div>

              {uploadStatus && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: uploadStatus.includes('완료') ? '#4CAF50' : uploadStatus.includes('실패') ? '#f44336' : '#2196F3',
                    color: '#fff',
                    fontSize: '13px',
                    textAlign: 'center',
                  }}
                >
                  {uploadStatus}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  disabled={isUploading}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontSize: '14px',
                    backgroundColor: '#616161',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  취소
                </button>
                {!user ? (
                  <button
                    onClick={signInWithGoogle}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      backgroundColor: '#4285f4',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" style={{ display: 'block' }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      <path fill="none" d="M0 0h48v48H0z"/>
                    </svg>
                    로그인 후 공유
                  </button>
                ) : (
                  <button
                    onClick={handleShareChart}
                    disabled={isUploading || !shareTitle.trim() || !shareAuthor.trim()}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      backgroundColor: (isUploading || !shareTitle.trim() || !shareAuthor.trim()) ? '#424242' : '#2196F3',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (isUploading || !shareTitle.trim() || !shareAuthor.trim()) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isUploading ? '업로드 중...' : '공유하기'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
