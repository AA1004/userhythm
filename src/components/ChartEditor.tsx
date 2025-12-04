import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Note, BPMChange, TimeSignatureEvent, ChartTestPayload, SubtitleEditorChartData, Lane, SpeedChange } from '../types/game';
import { ChartEditorHeader } from './ChartEditor/ChartEditorHeader';
import { ChartEditorSidebar } from './ChartEditor/ChartEditorSidebar';
import { ChartEditorTimeline } from './ChartEditor/ChartEditorTimeline';
import { ChartShareModal } from './ChartEditor/ChartShareModal';
import { useChartYoutubePlayer } from '../hooks/useChartYoutubePlayer';
import { useChartTimeline } from '../hooks/useChartTimeline';
import { useChartAutosave } from '../hooks/useChartAutosave';
import { TapBPMCalculator, isValidBPM } from '../utils/bpmAnalyzer';
import { calculateTotalBeatsWithChanges, formatSongLength } from '../utils/bpmUtils';
import { chartAPI, supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import {
  AUTO_SAVE_KEY,
  PIXELS_PER_SECOND,
  TIMELINE_TOP_PADDING,
  TIMELINE_BOTTOM_PADDING,
  MIN_TIMELINE_DURATION_MS,
  PLAYBACK_SPEED_OPTIONS,
  CHART_EDITOR_THEME,
} from './ChartEditor/constants';
import { extractYouTubeVideoId } from '../utils/youtube';

const KEY_TO_LANE: Record<string, Lane> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
};

const MIN_LONG_NOTE_DURATION = 50;

interface ChartEditorProps {
  onCancel: () => void;
  onTest?: (payload: ChartTestPayload) => void;
  onOpenSubtitleEditor?: (chartData: SubtitleEditorChartData) => void;
}

export const ChartEditor: React.FC<ChartEditorProps> = ({
  onCancel,
  onTest,
  onOpenSubtitleEditor,
}) => {
  // --- 기본 상태 ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1);
  const [volume, setVolume] = useState<number>(100);
  const [subtitleSessionId, setSubtitleSessionId] = useState(() => {
    if (typeof window === 'undefined') {
      return `local-${Date.now()}`;
    }
    const existing = localStorage.getItem('subtitle-session-id');
    if (existing) return existing;
    const generated = `local-${Date.now()}`;
    try {
      localStorage.setItem('subtitle-session-id', generated);
    } catch (error) {
      console.warn('Failed to persist subtitle session id:', error);
    }
    return generated;
  });
  useEffect(() => {
    const handler = (event: Event) => {
      try {
        const custom = event as CustomEvent<string>;
        if (typeof custom.detail === 'string' && custom.detail.length > 0) {
          setSubtitleSessionId(custom.detail);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('subtitle-chart-id-update', handler as EventListener);
    return () => {
      window.removeEventListener('subtitle-chart-id-update', handler as EventListener);
    };
  }, []);
  
  // --- BPM & Grid 상태 ---
  const [bpm, setBpm] = useState<number>(120);
  const [bpmChanges, setBpmChanges] = useState<BPMChange[]>([]);
  const [timeSignatures, setTimeSignatures] = useState<TimeSignatureEvent[]>([
    { id: 0, beatIndex: 0, beatsPerMeasure: 4 },
  ]);
  const [timeSignatureOffset, setTimeSignatureOffset] = useState<number>(0);
  const [timelineExtraMs, setTimelineExtraMs] = useState<number>(0);
  const [gridDivision, setGridDivision] = useState<number>(1);
  const [speedChanges, setSpeedChanges] = useState<SpeedChange[]>([]);
  
  // --- UI 상태 ---
  const [isBpmInputOpen, setIsBpmInputOpen] = useState<boolean>(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(true);
  const [isLongNoteMode, setIsLongNoteMode] = useState<boolean>(false);
  const [testStartInput, setTestStartInput] = useState<string>('0');
  
  // --- Refs & 기타 ---
  const noteIdRef = useRef(0);
  const speedChangeIdRef = useRef(0);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const tapBpmCalculatorRef = useRef(new TapBPMCalculator());
  const [tapBpmResult, setTapBpmResult] = useState<{ bpm: number; confidence: number } | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const isDraggingPlayheadRef = useRef(false); // 훅으로 전달하기 위해 ref 사용
  const lastPointerClientYRef = useRef<number | null>(null); // 재생선 드래그 중 마지막 마우스 Y 좌표
  const [pendingLongNote, setPendingLongNote] = useState<{ lane: Lane; startTime: number } | null>(null);
  const playheadRafIdRef = useRef<number | null>(null);
  const lastTickTimestampRef = useRef<number | null>(null);

  // --- 공유 모달 상태 ---
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareTitle, setShareTitle] = useState<string>('');
  const [shareAuthor, setShareAuthor] = useState<string>('');
  const [shareDifficulty, setShareDifficulty] = useState<string>('Normal');
  const [shareDescription, setShareDescription] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [user, setUser] = useState<any>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // --- Hooks 호출 ---
  const {
    youtubeUrl,
    setYoutubeUrl,
    youtubeVideoId,
    youtubeVideoTitle,
    videoDurationSeconds,
    isLoadingDuration,
    handleYouTubeUrlSubmit,
    seekTo,
    youtubePlayerRef,
  } = useChartYoutubePlayer({
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    volume,
  });

  const youtubeThumbnailUrl = useMemo(() => {
    if (youtubeVideoId) {
      return `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
    }
    if (youtubeUrl) {
      const fallbackId = extractYouTubeVideoId(youtubeUrl);
      if (fallbackId) {
        return `https://img.youtube.com/vi/${fallbackId}/hqdefault.jpg`;
      }
    }
    return null;
  }, [youtubeVideoId, youtubeUrl]);

  // --- 에디터 전용 타이머(재생선 시간 소스) ---
  useEffect(() => {
    if (!isPlaying) {
      if (playheadRafIdRef.current !== null) {
        cancelAnimationFrame(playheadRafIdRef.current);
        playheadRafIdRef.current = null;
      }
      lastTickTimestampRef.current = null;
      return;
    }

    const tick = (timestamp: number) => {
      if (!isPlaying) return;

      if (lastTickTimestampRef.current === null) {
        lastTickTimestampRef.current = timestamp;
      }
      const deltaMs = (timestamp - lastTickTimestampRef.current) * playbackSpeed;
      lastTickTimestampRef.current = timestamp;

      setCurrentTime((prev) => Math.max(0, prev + deltaMs));
      playheadRafIdRef.current = requestAnimationFrame(tick);
    };

    playheadRafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (playheadRafIdRef.current !== null) {
        cancelAnimationFrame(playheadRafIdRef.current);
        playheadRafIdRef.current = null;
      }
      lastTickTimestampRef.current = null;
    };
  }, [isPlaying, playbackSpeed, setCurrentTime]);

  // --- 계산된 값들 ---
  const beatDuration = useMemo(() => (60000 / bpm), [bpm]);
  
  const sortedBpmChanges = useMemo(() => {
    return [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);
  }, [bpmChanges]);

  const sortedTimeSignatures = useMemo(() => {
    return [...timeSignatures].sort((a, b) => a.beatIndex - b.beatIndex);
  }, [timeSignatures]);

  const timelineDurationMs = useMemo(() => {
    const lastNoteTime = notes.length > 0 
      ? Math.max(...notes.map(n => n.endTime || n.time)) 
      : 0;
    const videoDurationMs = (videoDurationSeconds || 0) * 1000;
    const validVideoDuration = (videoDurationSeconds && videoDurationSeconds > 0) 
      ? videoDurationMs 
      : MIN_TIMELINE_DURATION_MS;
    const baseDuration = Math.max(lastNoteTime + 5000, validVideoDuration, MIN_TIMELINE_DURATION_MS);
    return Math.max(MIN_TIMELINE_DURATION_MS, baseDuration + timelineExtraMs);
  }, [notes, videoDurationSeconds, timelineExtraMs]);

  const timelineContentHeight = useMemo(() => {
    return TIMELINE_TOP_PADDING + TIMELINE_BOTTOM_PADDING + (timelineDurationMs / 1000) * PIXELS_PER_SECOND * zoom;
  }, [timelineDurationMs, zoom]);

  const {
    timeToY,
    yToTime,
    getNoteY,
    playheadY,
  } = useChartTimeline({
    zoom,
    currentTime,
    TIMELINE_BOTTOM_PADDING,
    PIXELS_PER_SECOND,
    timelineContentHeight,
  });

  const beatsPerMeasure = timeSignatures[0]?.beatsPerMeasure || 4;

  const songInfo = useMemo(() => {
    const durationSeconds = timelineDurationMs / 1000;
    const totalBeats = calculateTotalBeatsWithChanges(
      durationSeconds,
      bpm,
      sortedBpmChanges
    );
    
    return {
      durationFormatted: formatSongLength(durationSeconds, bpm, sortedBpmChanges, beatsPerMeasure),
      totalBeats,
      formattedLength: formatSongLength(durationSeconds, bpm, sortedBpmChanges, beatsPerMeasure),
      hasBpmChanges: sortedBpmChanges.length > 0,
      durationSeconds,
      baseBpm: bpm,
      bpmChanges: sortedBpmChanges
    };
  }, [timelineDurationMs, bpm, sortedBpmChanges, beatsPerMeasure]);

  const clampTime = useCallback(
    (time: number) => Math.max(0, Math.min(time, timelineDurationMs)),
    [timelineDurationMs]
  );

  // 시간을 가장 가까운 그리드 라인에 스냅
  const snapToGrid = useCallback(
    (timeMs: number) => {
      const gridInterval = beatDuration / gridDivision;
      // timeSignatureOffset을 고려해서 가장 가까운 그리드 위치로 스냅
      const adjustedTime = timeMs - timeSignatureOffset;
      const snappedAdjusted = Math.round(adjustedTime / gridInterval) * gridInterval;
      return clampTime(snappedAdjusted + timeSignatureOffset);
    },
    [beatDuration, gridDivision, timeSignatureOffset, clampTime]
  );

  // --- 자동 저장 ---
  const autoSaveData = useMemo(
    () => ({
      notes,
      bpm,
      youtubeUrl,
      youtubeVideoId,
      timeSignatures,
      timeSignatureOffset,
      timelineExtraMs,
      bpmChanges,
      speedChanges,
      chartTitle: shareTitle,
      chartAuthor: shareAuthor,
      gridDivision,
      isLongNoteMode,
      testStartInput,
      playbackSpeed,
      volume,
      currentTime,
      isAutoScrollEnabled,
      zoom,
    }),
    [
    notes,
    bpm,
    youtubeUrl,
    youtubeVideoId,
    timeSignatures,
    timeSignatureOffset,
    bpmChanges,
      speedChanges,
      shareTitle,
      shareAuthor,
      gridDivision,
      isLongNoteMode,
      testStartInput,
      playbackSpeed,
      volume,
      currentTime,
      isAutoScrollEnabled,
      zoom,
      timelineExtraMs,
    ]
  );

  const handleRestore = useCallback((data: any) => {
    if (!data || typeof data !== 'object') {
      console.warn('Invalid chart data provided to restore:', data);
      return;
    }

    if (Array.isArray(data.notes)) {
      setNotes(data.notes);
      const maxId = data.notes.reduce((max: number, note: Note) => {
        const noteId = typeof note.id === 'number' ? note.id : 0;
        return Math.max(max, noteId);
      }, 0);
      noteIdRef.current = maxId + 1;
    }

    if (typeof data.bpm === 'number') setBpm(data.bpm);
    if (typeof data.youtubeUrl === 'string') setYoutubeUrl(data.youtubeUrl);
    if (Array.isArray(data.timeSignatures)) setTimeSignatures(data.timeSignatures);
    if (data.timeSignatureOffset !== undefined) setTimeSignatureOffset(data.timeSignatureOffset);
    if (typeof data.timelineExtraMs === 'number') setTimelineExtraMs(data.timelineExtraMs);
    if (Array.isArray(data.bpmChanges)) setBpmChanges(data.bpmChanges);
    if (Array.isArray(data.speedChanges)) {
      setSpeedChanges(data.speedChanges);
      const maxId =
        data.speedChanges.length > 0
          ? Math.max(
              0,
              ...data.speedChanges.map((s: SpeedChange) =>
                typeof s.id === 'number' ? s.id : 0
              )
            )
          : 0;
      speedChangeIdRef.current = maxId + 1;
    }
    if (typeof data.chartTitle === 'string') setShareTitle(data.chartTitle);
    if (typeof data.chartAuthor === 'string') setShareAuthor(data.chartAuthor);
    if (typeof data.gridDivision === 'number') setGridDivision(data.gridDivision);
    if (typeof data.isLongNoteMode === 'boolean') setIsLongNoteMode(data.isLongNoteMode);
    if (data.testStartInput !== undefined) setTestStartInput(String(data.testStartInput));
    if (typeof data.playbackSpeed === 'number') setPlaybackSpeed(data.playbackSpeed);
    if (typeof data.volume === 'number') setVolume(data.volume);
    if (typeof data.zoom === 'number') setZoom(data.zoom);
    if (typeof data.isAutoScrollEnabled === 'boolean') {
      setIsAutoScrollEnabled(data.isAutoScrollEnabled);
    }
    if (typeof data.currentTime === 'number') {
      setCurrentTime(Math.max(0, data.currentTime));
    } else {
      setCurrentTime(0);
    }

    setIsPlaying(false);
    setPendingLongNote(null);
    isDraggingPlayheadRef.current = false;
    // 스크롤을 맨 아래로 이동 (렌더링 후 실행)
    setTimeout(() => {
      if (timelineScrollRef.current) {
        const container = timelineScrollRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
      }
    }, 0);
  }, []);

  useChartAutosave(AUTO_SAVE_KEY, autoSaveData, handleRestore);

  // 초기화 핸들러
  const handleReset = useCallback(() => {
    if (!confirm('모든 채보 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    setNotes([]);
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackSpeed(1);
    setZoom(1);
    setVolume(100);
    setBpm(120);
    setBpmChanges([]);
    setTimeSignatures([{ id: 0, beatIndex: 0, beatsPerMeasure: 4 }]);
    setTimeSignatureOffset(0);
    setTimelineExtraMs(0);
    setGridDivision(1);
    setSpeedChanges([]);
    setIsBpmInputOpen(false);
    setIsAutoScrollEnabled(true);
    setIsLongNoteMode(false);
    setTestStartInput('0');
    setShareTitle('');
    setShareAuthor('');
    setShareDifficulty('Normal');
    setShareDescription('');
    setYoutubeUrl('');
    noteIdRef.current = 0;
    speedChangeIdRef.current = 0;
    isDraggingPlayheadRef.current = false;
    setPendingLongNote(null);

    // 스크롤을 맨 위로 이동
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollTop = 0;
    }

    // localStorage도 초기화
    try {
      localStorage.removeItem(AUTO_SAVE_KEY);
      localStorage.removeItem(`subtitle-editor-${subtitleSessionId}`);
      localStorage.removeItem(`subtitles_${subtitleSessionId}`);
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
  }, [subtitleSessionId]);

  // --- 변속(SpeedChange) 핸들러 ---
  const handleAddSpeedChangeAtCurrent = useCallback(() => {
    const start = clampTime(currentTime);
    const newChange: SpeedChange = {
      id: speedChangeIdRef.current++,
      startTimeMs: start,
      endTimeMs: null,
      bpm,
    };
    setSpeedChanges((prev) =>
      [...prev, newChange].sort((a, b) => a.startTimeMs - b.startTimeMs)
    );
  }, [bpm, clampTime, currentTime]);

  const handleUpdateSpeedChange = useCallback(
    (id: number, patch: Partial<SpeedChange>) => {
      setSpeedChanges((prev) =>
        prev
          .map((c) => (c.id === id ? { ...c, ...patch } : c))
          .sort((a, b) => a.startTimeMs - b.startTimeMs)
      );
    },
    []
  );

  const handleDeleteSpeedChange = useCallback((id: number) => {
    if (!confirm('이 변속 구간을 삭제할까요?')) return;
    setSpeedChanges((prev) => prev.filter((c) => c.id !== id));
  }, []);


  // --- 핸들러들 ---

  // 노트 추가/삭제
  const addNote = useCallback((lane: Lane, time: number, type: 'tap' | 'hold' = 'tap', duration: number = 0) => {
    const newNote: Note = {
      id: noteIdRef.current++,
      lane,
      time,
      type,
      duration,
      endTime: time + duration,
      y: 0, // 렌더링 시 계산
      hit: false,
    };
    setNotes((prev) => [...prev, newNote]);
  }, []);

  const deleteNote = useCallback((id: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // 타임라인 클릭 (재생선 이동)
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineScrollRef.current) return;
    if (isDraggingPlayheadRef.current) return;

    const scrollRect = timelineScrollRef.current.getBoundingClientRect();
    const clickY = e.clientY - scrollRect.top + timelineScrollRef.current.scrollTop;

    const time = clampTime(yToTime(clickY));
    setIsPlaying(false);
    setCurrentTime(time);
    seekTo(time, { shouldPause: true }); // shouldPause: true로 전달하여 재생 방지
  }, [clampTime, yToTime, seekTo]);

  const handleLaneInput = useCallback((lane: Lane) => {
    // 현재 시간을 그리드에 스냅해서 노트가 가로선에 맞게 설치되도록 함
    const time = snapToGrid(currentTime);
    
    // 같은 레인과 같은 시간에 노트가 이미 있는지 확인
    const hasDuplicate = notes.some((note) => {
      if (note.lane !== lane) return false;
      // 스냅된 시간과 비교 (같은 그리드 셀 내면 중복으로 간주)
      const noteSnappedTime = snapToGrid(note.time);
      return Math.abs(noteSnappedTime - time) < 1; // 1ms 이내면 같은 위치로 간주
    });
    
    if (hasDuplicate) {
      return; // 중복이면 추가하지 않음
    }
    
      if (isLongNoteMode) {
      if (pendingLongNote && pendingLongNote.lane === lane) {
        const startTime = snapToGrid(Math.min(pendingLongNote.startTime, time));
        const endTime = snapToGrid(Math.max(pendingLongNote.startTime, time));
            const duration = endTime - startTime;
        if (duration > MIN_LONG_NOTE_DURATION) {
          // 롱노트도 중복 체크 (같은 레인에서 시간이 겹치는 노트가 있는지)
          const hasHoldDuplicate = notes.some((note) => {
            if (note.lane !== lane) return false;
            const noteStart = snapToGrid(note.time);
            const noteEnd = note.endTime ? snapToGrid(note.endTime) : noteStart;
            // 시간 범위가 겹치는지 확인
            return (
              (startTime >= noteStart && startTime <= noteEnd) ||
              (endTime >= noteStart && endTime <= noteEnd) ||
              (startTime <= noteStart && endTime >= noteEnd)
            );
          });
          if (!hasHoldDuplicate) {
            addNote(lane, startTime, 'hold', duration);
          }
            }
            setPendingLongNote(null);
          } else {
        setPendingLongNote({ lane, startTime: time });
          }
        } else {
      addNote(lane, time);
    }
  }, [addNote, snapToGrid, currentTime, isLongNoteMode, pendingLongNote, setPendingLongNote, notes]);

  const handleYoutubePasteButton = useCallback(async () => {
    let clipboardText = '';

    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (error) {
        console.warn('클립보드 접근 실패:', error);
      }
    }

    if (!clipboardText) {
      clipboardText =
        (typeof window !== 'undefined'
          ? window.prompt('YouTube URL을 입력하거나 붙여넣어 주세요.', youtubeUrl || '')
          : '') || '';
    }

    const trimmed = clipboardText.trim();
    if (!trimmed) return;

    handleYouTubeUrlSubmit(trimmed);
  }, [handleYouTubeUrlSubmit, youtubeUrl]);

  // 재생선 드래그
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 기본 드래그 동작 방지 (텍스트 선택 등)
    e.stopPropagation();
    isDraggingPlayheadRef.current = true;
    lastPointerClientYRef.current = e.clientY;
    setIsPlaying(false); // 드래그 시 일시정지

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!timelineScrollRef.current) return;
      const rect = timelineScrollRef.current.getBoundingClientRect();
      // 스크롤된 상태를 고려하여 Y 좌표 계산
      const relativeY =
        moveEvent.clientY - rect.top + timelineScrollRef.current.scrollTop;
      const newTime = clampTime(yToTime(relativeY));
      setCurrentTime(newTime);
      lastPointerClientYRef.current = moveEvent.clientY;

      // YouTube seek (드래그 중에는 부하 줄이기 위해 throttle 고려 가능하나 여기선 직접 호출)
      // seekTo(newTime); // 너무 잦은 호출 방지 위해 mouseUp에서만 하거나, throttle 필요
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault(); // 클릭 이벤트 전파 방지
      upEvent.stopPropagation();
      
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      // 최종 위치로 이동
      if (timelineScrollRef.current) {
        const rect = timelineScrollRef.current.getBoundingClientRect();
        const relativeY = upEvent.clientY - rect.top + timelineScrollRef.current.scrollTop;
        const newTime = clampTime(yToTime(relativeY));
        seekTo(newTime, { shouldPause: true }); // shouldPause: true로 전달하여 재생 방지
        setIsPlaying(false);
      }

      // 클릭 이벤트가 발생하여 노트가 잘못 생성되는 것을 방지하기 위해
      // 플래그 해제를 다음 틱으로 지연
      setTimeout(() => {
        isDraggingPlayheadRef.current = false;
        lastPointerClientYRef.current = null;
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [yToTime, seekTo, clampTime]);

  // BPM Tap
  const handleTapBpm = useCallback(() => {
    const result = tapBpmCalculatorRef.current.tap();
    setTapCount(tapBpmCalculatorRef.current.getTapCount());
    if (result) {
      setTapBpmResult({ bpm: result.bpm, confidence: result.confidence ?? 0 });
      // 신뢰도가 높으면 자동 적용? 아니면 사용자 선택? 
      // 여기선 결과만 보여주고 사용자가 직접 입력하도록 유도 (또는 별도 적용 버튼)
      if (result.confidence && result.confidence > 0.8) {
        setBpm(Math.round(result.bpm));
      }
    }
  }, []);

  // BPM 변속 추가/수정/삭제
  const handleAddBpmChange = useCallback(() => {
    const bpmInput = prompt('새로운 BPM을 입력하세요:', Math.round(bpm).toString());
    if (bpmInput === null) return;
    const newBpm = parseFloat(bpmInput);
    if (isNaN(newBpm) || !isValidBPM(newBpm)) {
      alert('유효한 BPM을 입력해주세요. (30-300)');
      return;
    }
    
    const beatInput = prompt('시작 비트(Beat Index)를 입력하세요:', '0');
    if (beatInput === null) return;
    const beatIndex = parseFloat(beatInput);
    
    setBpmChanges(prev => [...prev, { id: Date.now(), beatIndex, bpm: newBpm }]);
  }, [bpm]);

  const handleAddBpmChangeAtCurrentPosition = useCallback(() => {
    // 현재 시간을 비트로 변환하는 로직 필요 (대략적으로)
    // 정확한 비트 매핑은 복잡하므로, 단순 계산 혹은 가장 가까운 그리드 스냅
    // 여기서는 단순 입력을 유도하거나, 현재 currentTime 기반으로 계산
    const currentBeat = (currentTime / 1000) * (bpm / 60);
    
    const bpmInput = prompt('새로운 BPM을 입력하세요:', Math.round(bpm).toString());
    if (bpmInput === null) return;
    const newBpm = parseFloat(bpmInput);
    if (isNaN(newBpm) || !isValidBPM(newBpm)) return;

    setBpmChanges(prev => [...prev, { id: Date.now(), beatIndex: Math.round(currentBeat), bpm: newBpm }]);
  }, [currentTime, bpm]);

  const handleEditBpmChange = useCallback((change: BPMChange) => {
    const newBpmStr = prompt('새 BPM:', change.bpm.toString());
    if (newBpmStr === null) return;
    const newBpm = parseFloat(newBpmStr);
    
    const newBeatStr = prompt('새 비트 인덱스:', change.beatIndex.toString());
    if (newBeatStr === null) return;
    const newBeat = parseFloat(newBeatStr);

    setBpmChanges(prev => prev.map(c => c.id === change.id ? { ...c, bpm: newBpm, beatIndex: newBeat } : c));
  }, []);

  const handleDeleteBpmChange = useCallback((id: number) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      setBpmChanges(prev => prev.filter(c => c.id !== id));
    }
  }, []);

  // 공유/업로드
  const handleShare = useCallback(async () => {
    if (!user) {
      alert('채보를 업로드하려면 먼저 Google 계정으로 로그인해주세요.');
      return;
    }

    if (!shareTitle || !shareAuthor) {
      alert('제목과 제작자를 입력해주세요.');
      return;
    }
    
    setIsUploading(true);
    setUploadStatus('업로드 중...');
    
    try {
      await chartAPI.uploadChart({
        title: shareTitle,
        author: shareAuthor,
        bpm,
        difficulty: shareDifficulty,
        description: shareDescription,
        data_json: JSON.stringify(autoSaveData),
        youtube_url: youtubeUrl,
        preview_image: youtubeThumbnailUrl || undefined,
      });
      
      setUploadStatus('업로드 완료! 관리자 승인 후 공개됩니다.');
      setTimeout(() => {
        setIsShareModalOpen(false);
        setUploadStatus('');
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setUploadStatus(`실패: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [shareTitle, shareAuthor, shareDifficulty, shareDescription, bpm, youtubeUrl, youtubeThumbnailUrl, autoSaveData, user]);

  const handleExportJson = useCallback(() => {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        chart: autoSaveData,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const safeTitle = (shareTitle || 'userhythm-chart').replace(/[\\/:*?"<>|]/g, '_');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeTitle}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('JSON 내보내기 실패:', error);
      alert('JSON 내보내기 중 오류가 발생했습니다.');
    }
  }, [autoSaveData, shareTitle]);

  const handleImportJsonClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportJsonFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const chartData = parsed.chart ?? parsed;
        if (!chartData || typeof chartData !== 'object') {
          throw new Error('올바르지 않은 JSON 구조입니다.');
        }
        if (!Array.isArray(chartData.notes)) {
          throw new Error('notes 배열이 포함되지 않은 JSON 파일입니다.');
        }
        handleRestore(chartData);
        alert(`JSON 파일을 불러왔습니다. (노트 ${chartData.notes.length}개)`);
      } catch (error) {
        console.error('JSON 불러오기 실패:', error);
        alert('JSON 파일을 불러오지 못했습니다. 파일 형식을 확인해 주세요.');
      } finally {
        event.target.value = '';
      }
    },
    [handleRestore]
  );

  // Supabase Auth 상태 구독
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    const syncSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error && isMounted) {
        setUser(data.session?.user ?? null);
      }
    };

    syncSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const handleLoginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      alert('Supabase 환경 변수가 설정되지 않았습니다. Google 로그인을 사용할 수 없습니다.');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) {
        throw error;
      }
    } catch (error: any) {
      console.error('Google 로그인 실패:', error);
      alert(error?.message || 'Google 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, []);

  // 자동 스크롤
  useEffect(() => {
    if (!isPlaying || !isAutoScrollEnabled || isDraggingPlayheadRef.current) return;
    if (!timelineScrollRef.current) return;

    const container = timelineScrollRef.current;
    const centerOffset = container.clientHeight / 2;
    const targetScrollTop = playheadY - centerOffset;
    
    // 재생 중에는 항상 재생선을 화면 중앙 근처로 유지
    container.scrollTop = targetScrollTop;
  }, [isPlaying, isAutoScrollEnabled, playheadY]);

  // 줌 변경 시 (자동 스크롤이 켜져 있다면) 재생선을 화면 중앙에 고정
  const lastZoomRef = useRef(zoom);
  useEffect(() => {
    if (!isAutoScrollEnabled) {
      lastZoomRef.current = zoom;
      return;
    }
    if (!timelineScrollRef.current) {
      lastZoomRef.current = zoom;
      return;
    }
    if (zoom === lastZoomRef.current) return;

    const container = timelineScrollRef.current;
    const centerOffset = container.clientHeight / 2;
    const targetScrollTop = playheadY - centerOffset;
    container.scrollTop = targetScrollTop;

    lastZoomRef.current = zoom;
  }, [zoom, isAutoScrollEnabled, playheadY]);

  // 재생선 드래그 중 스크롤(마우스 휠 등) 시, 재생선을 마우스 위치에 맞춰 부드럽게 따라가게 함
  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!isDraggingPlayheadRef.current) return;
      if (lastPointerClientYRef.current == null) return;

      const rect = container.getBoundingClientRect();
      const relativeY =
        lastPointerClientYRef.current - rect.top + container.scrollTop;
      const newTime = clampTime(yToTime(relativeY));
      setCurrentTime(newTime);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [clampTime, yToTime]);

  // 키보드 핸들러 (스페이스바 재생 등)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드나 버튼에 포커스가 있을 때는 스페이스바 동작 방지 (중복 실행 방지)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLButtonElement
      ) {
        return;
      }
      
      const key = e.key.toLowerCase();
      if (KEY_TO_LANE[key as keyof typeof KEY_TO_LANE] !== undefined) {
        e.preventDefault();
        const lane = KEY_TO_LANE[key as keyof typeof KEY_TO_LANE];
        handleLaneInput(lane);
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleLaneInput]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: `radial-gradient(circle at top left, ${CHART_EDITOR_THEME.accentSoft}, ${CHART_EDITOR_THEME.rootBackground})`,
        color: CHART_EDITOR_THEME.textPrimary,
        padding: '12px 16px',
        boxSizing: 'border-box',
        gap: '10px',
      }}
    >
      {/* Header */}
      <ChartEditorHeader
        bpm={bpm}
        isPlaying={isPlaying}
        isAutoScrollEnabled={isAutoScrollEnabled}
        isBpmInputOpen={isBpmInputOpen}
        isLoadingYoutubeMeta={isLoadingDuration}
        youtubeVideoTitle={youtubeVideoTitle}
        tapCount={tapCount}
        tapConfidence={tapBpmResult?.confidence}
        bpmChanges={sortedBpmChanges}
        beatsPerMeasure={beatsPerMeasure}
        songInfo={songInfo}
        onRewind={() => {
          setIsPlaying(false);
          seekTo(0, { shouldPause: true });
        }}
        onTogglePlayback={() => {
          setIsPlaying(prev => !prev);
        }}
        onStop={() => {
          setIsPlaying(false);
          seekTo(0, { shouldPause: true });
        }}
        onToggleAutoScroll={() => setIsAutoScrollEnabled(prev => !prev)}
        onReset={handleReset}
        onSubtitleClick={
          onOpenSubtitleEditor
            ? () =>
                onOpenSubtitleEditor({
                  chartId: subtitleSessionId,
            notes,
            bpm,
            youtubeVideoId,
            youtubeUrl,
                  title: shareTitle || 'Untitled',
                })
            : undefined
        }
        onExit={onCancel}
        onYoutubePasteButton={handleYoutubePasteButton}
        onToggleBpmInput={() => setIsBpmInputOpen(prev => !prev)}
        onBpmInput={(val) => { setBpm(parseFloat(val)); setIsBpmInputOpen(false); }}
        onTapBpm={handleTapBpm}
        onAddBpmChange={handleAddBpmChange}
        onAddBpmChangeAtCurrent={handleAddBpmChangeAtCurrentPosition}
        onEditBpmChange={handleEditBpmChange}
        onDeleteBpmChange={handleDeleteBpmChange}
        onExportJson={handleExportJson}
        onImportJson={handleImportJsonClick}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          background: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          boxShadow: CHART_EDITOR_THEME.shadowSoft,
        }}
      >
        {/* Sidebar */}
        <ChartEditorSidebar
          zoom={zoom}
          onZoomChange={setZoom}
          playbackSpeed={playbackSpeed}
          playbackSpeedOptions={PLAYBACK_SPEED_OPTIONS}
          onPlaybackSpeedChange={setPlaybackSpeed}
          volume={volume}
          onVolumeChange={setVolume}
          beatsPerMeasure={beatsPerMeasure}
          onTimeSignatureChange={(beats) => setTimeSignatures([{ id: 0, beatIndex: 0, beatsPerMeasure: beats }])}
          gridDivision={gridDivision}
          onGridDivisionChange={setGridDivision}
          timeSignatureOffset={timeSignatureOffset}
          timelineExtraMs={timelineExtraMs}
          onTimeSignatureOffsetChange={setTimeSignatureOffset}
          onTimelineExtraChange={(updater) => setTimelineExtraMs((prev) => updater(prev))}
          beatDuration={beatDuration}
          isLongNoteMode={isLongNoteMode}
          onToggleLongNoteMode={() => setIsLongNoteMode(prev => !prev)}
          testStartInput={testStartInput}
          onTestStartInputChange={setTestStartInput}
          onSetTestStartToCurrent={() => setTestStartInput(Math.floor(currentTime).toString())}
          onSetTestStartToZero={() => setTestStartInput('0')}
          onTestChart={() => {
            if (onTest) {
                onTest({
                    notes,
                    startTimeMs: parseInt(testStartInput) || 0,
                    youtubeVideoId,
                    youtubeUrl,
                    playbackSpeed,
                audioOffsetMs: 0,
                bpm,
                speedChanges,
                chartId: subtitleSessionId,
                });
            }
          }}
          onShareClick={() => setIsShareModalOpen(true)}
          currentTimeMs={currentTime}
          speedChanges={speedChanges}
          onAddSpeedChangeAtCurrent={handleAddSpeedChangeAtCurrent}
          onUpdateSpeedChange={handleUpdateSpeedChange}
          onDeleteSpeedChange={handleDeleteSpeedChange}
          bpm={bpm}
          bpmChanges={sortedBpmChanges}
        />

        {/* Main Timeline Canvas */}
        <div style={{ flex: 1, position: 'relative', backgroundColor: '#1f1f1f', overflow: 'hidden' }}>
            <ChartEditorTimeline
                notes={notes}
                sortedTimeSignatures={sortedTimeSignatures}
                beatDuration={beatDuration}
                timelineDurationMs={timelineDurationMs}
                gridDivision={gridDivision}
                timeSignatureOffset={timeSignatureOffset}
                speedChanges={speedChanges}
                playheadY={playheadY}
                isAutoScrollEnabled={isAutoScrollEnabled}
                timelineContentHeight={timelineContentHeight}
                timelineScrollRef={timelineScrollRef}
                timelineContentRef={timelineContentRef}
                zoom={zoom}
                onTimelineClick={handleTimelineClick}
                onPlayheadMouseDown={handlePlayheadMouseDown}
                onNoteClick={deleteNote}
                timeToY={timeToY}
                getNoteY={getNoteY}
                currentTime={currentTime}
                bpm={bpm}
                bpmChanges={sortedBpmChanges}
                beatsPerMeasure={beatsPerMeasure}
            />
            
            {/* Hidden Youtube Player */}
            <div
                ref={youtubePlayerRef}
                style={{
                    position: 'absolute',
                    width: '1px', 
                    height: '1px', 
                    opacity: 0, 
                    pointerEvents: 'none', 
                    zIndex: -1 
                }}
            />
        </div>
      </div>

      {/* Share Modal */}
      <ChartShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={shareTitle}
        onTitleChange={setShareTitle}
        author={shareAuthor}
        onAuthorChange={setShareAuthor}
        difficulty={shareDifficulty}
        onDifficultyChange={setShareDifficulty}
        description={shareDescription}
        onDescriptionChange={setShareDescription}
        thumbnailUrl={youtubeThumbnailUrl}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
        onUpload={handleShare}
        user={user}
        onLogin={handleLoginWithGoogle}
      />
      <input
        type="file"
        accept="application/json,.json"
        ref={importInputRef}
        style={{ display: 'none' }}
        onChange={handleImportJsonFile}
      />
    </div>
  );
};
