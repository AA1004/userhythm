import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Note, BPMChange, TimeSignatureEvent, ChartTestPayload, SubtitleEditorChartData, Lane, SpeedChange, BgaVisibilityInterval, BgaVisibilityMode } from '../types/game';
import { ChartEditorHeader } from './ChartEditor/ChartEditorHeader';
import { ChartEditorSidebarLeft } from './ChartEditor/ChartEditorSidebarLeft';
import { ChartEditorTimeline } from './ChartEditor/ChartEditorTimeline';
import { ChartShareModal } from './ChartEditor/ChartShareModal';
import { useChartYoutubePlayer } from '../hooks/useChartYoutubePlayer';
import { useChartTimeline } from '../hooks/useChartTimeline';
import { useChartAutosave } from '../hooks/useChartAutosave';
import { TapBPMCalculator, isValidBPM } from '../utils/bpmAnalyzer';
import { calculateTotalBeatsWithChanges, formatSongLength, timeToMeasure, beatIndexToTime, timeToBeatIndex } from '../utils/bpmUtils';
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
import { localSubtitleStorage } from '../lib/subtitleAPI';

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
  const [hitSoundVolume, setHitSoundVolume] = useState<number>(40);
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
  const [bgaVisibilityIntervals, setBgaVisibilityIntervals] = useState<BgaVisibilityInterval[]>([]);
  
  // --- 선택 영역 상태 (복사/붙여넣기) ---
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [isMoveMode, setIsMoveMode] = useState<boolean>(false);
  const [selectedLane, setSelectedLane] = useState<Lane | null>(null);
  const [selectionStartTime, setSelectionStartTime] = useState<number | null>(null);
  const [selectionEndTime, setSelectionEndTime] = useState<number | null>(null);
  const [copiedNotes, setCopiedNotes] = useState<Note[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(new Set());
  const [dragOffset, setDragOffset] = useState<{ time: number; lane: number } | null>(null);
  const isSelectingRef = useRef(false);
  const dragStartRef = useRef<{ time: number; lane: number } | null>(null);
  const marqueeInitialSelectedIdsRef = useRef<Set<number>>(new Set());
  const marqueeOperationRef = useRef<'replace' | 'add' | 'toggle'>('replace');
  
  // --- 실행 취소/다시 실행 상태 ---
  const notesHistoryRef = useRef<Note[][]>([[]]);
  const historyIndexRef = useRef<number>(0);
  const MAX_HISTORY_SIZE = 50;
  
  // 히스토리에 현재 상태 저장
  const saveToHistory = useCallback((newNotes: Note[]) => {
    const history = notesHistoryRef.current;
    const index = historyIndexRef.current;
    
    // 현재 인덱스 이후의 히스토리 제거 (새로운 변경이 있으면)
    const newHistory = history.slice(0, index + 1);
    
    // 새 상태 추가
    newHistory.push([...newNotes]);
    
    // 최대 크기 제한
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.shift();
      historyIndexRef.current = newHistory.length - 1;
    } else {
      historyIndexRef.current = newHistory.length - 1;
    }
    
    notesHistoryRef.current = newHistory;
  }, []);
  
  // 실행 취소
  const handleUndo = useCallback(() => {
    const history = notesHistoryRef.current;
    const index = historyIndexRef.current;
    
    if (index > 0) {
      historyIndexRef.current = index - 1;
      setNotes([...history[index - 1]]);
    }
  }, []);
  
  // 다시 실행
  const handleRedo = useCallback(() => {
    const history = notesHistoryRef.current;
    const index = historyIndexRef.current;
    
    if (index < history.length - 1) {
      historyIndexRef.current = index + 1;
      setNotes([...history[index + 1]]);
    }
  }, []);
  
  // 초기 상태를 히스토리에 저장
  useEffect(() => {
    if (notesHistoryRef.current.length === 1 && notesHistoryRef.current[0].length === 0 && notes.length > 0) {
      notesHistoryRef.current = [[...notes]];
      historyIndexRef.current = 0;
    }
  }, [notes]);
  
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hitGainRef = useRef<GainNode | null>(null);
  const lastHitCheckTimeRef = useRef<number>(0);
  const playedNoteIdsRef = useRef<Set<number>>(new Set());

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

  const resolvedAuthor = useMemo(() => {
    const profile = user?.profile || {};
    if (profile.nickname) return profile.nickname;
    if (profile.display_name) return profile.display_name;
    if (user?.email) return user.email.split('@')[0];
    return '';
  }, [user]);

  useEffect(() => {
    if (resolvedAuthor) {
      setShareAuthor(resolvedAuthor);
    }
  }, [resolvedAuthor]);

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

  // --- 키음 재생용 오디오 컨텍스트 ---
  const ensureAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioCtxRef.current) {
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, hitSoundVolume / 100));
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      hitGainRef.current = gain;
    }

    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ignore resume errors
      }
    }

    return audioCtxRef.current ?? null;
  }, [hitSoundVolume]);

  // 키음 볼륨 반영
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const gain = hitGainRef.current;
    if (!ctx || !gain) return;
    const value = Math.max(0, Math.min(1, hitSoundVolume / 100));
    gain.gain.setValueAtTime(value, ctx.currentTime);
  }, [hitSoundVolume]);

  const playHitSound = useCallback(async () => {
    const ctx = await ensureAudioContext();
    const masterGain = hitGainRef.current;
    if (!ctx || !masterGain) return;

    const now = ctx.currentTime;
    const duration = 0.1; // 아주 짧은 드럼/클릭 느낌

    // 노이즈 버퍼 생성 (하이햇/스네어 느낌의 어택)
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      // 앞부분은 강하고 뒤로 갈수록 빠르게 줄어드는 노이즈
      const env = Math.exp(-i / (bufferSize * 0.4));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // 대역 통과 필터로 중고역만 살려서 울림 없는 드럼/클릭 느낌
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.Q.setValueAtTime(0.9, now);

    const envGain = ctx.createGain();
    const baseLevel = Math.max(0.0001, masterGain.gain.value * 0.6); // 전체적으로 약간 더 작게
    envGain.gain.setValueAtTime(baseLevel, now);
    envGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, baseLevel * 0.04),
      now + duration
    );

    noiseSource.connect(filter).connect(envGain).connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + duration);

    noiseSource.onended = () => {
      try {
        noiseSource.disconnect();
        filter.disconnect();
        envGain.disconnect();
      } catch {
        // ignore
      }
    };
  }, [ensureAudioContext]);

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
  const sortedNotesByTime = useMemo(() => {
    return [...notes].sort((a, b) => a.time - b.time);
  }, [notes]);

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

  // --- 재생선이 지나간 노트에 키음 재생 (ID 기반 중복 방지) ---
  // 재생이 멈춰 있는 동안 재생선을 옮기면,
  // 해당 시점 이전 노트들은 이미 재생된 것으로 간주하도록 Set을 재구성한다.
  useEffect(() => {
    if (!isPlaying) {
      const rebuilt = new Set<number>();
      if (currentTime > 0) {
        for (const note of sortedNotesByTime) {
          if (note.time < currentTime) {
            rebuilt.add(note.id);
          } else {
            break;
          }
        }
      }
      playedNoteIdsRef.current = rebuilt;
      lastHitCheckTimeRef.current = currentTime;
    }
  }, [isPlaying, currentTime, sortedNotesByTime]);

  // 재생 중에 재생선이 뒤로 크게 이동하면,
  // 해당 시점 이전 노트들을 이미 재생된 것으로 간주하도록 Set을 재구성한다.
  useEffect(() => {
    if (!isPlaying) return;
    const lastTime = lastHitCheckTimeRef.current;
    if (currentTime < lastTime) {
      const rebuilt = new Set<number>();
      if (currentTime > 0) {
        for (const note of sortedNotesByTime) {
          if (note.time < currentTime) {
            rebuilt.add(note.id);
          } else {
            break;
          }
        }
      }
      playedNoteIdsRef.current = rebuilt;
    }
    lastHitCheckTimeRef.current = currentTime;
  }, [isPlaying, currentTime, sortedNotesByTime]);

  // 노트가 currentTime을 지나면 재생 (ID로 중복 방지)
  useEffect(() => {
    if (!isPlaying) return;

    for (const note of sortedNotesByTime) {
      if (note.time > currentTime) break;
      if (!playedNoteIdsRef.current.has(note.id)) {
        playedNoteIdsRef.current.add(note.id);
        playHitSound();
      }
    }
  }, [currentTime, isPlaying, sortedNotesByTime, playHitSound]);

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
      bgaVisibilityIntervals,
      chartTitle: shareTitle,
      chartAuthor: shareAuthor,
      gridDivision,
      isLongNoteMode,
      testStartInput,
      playbackSpeed,
      volume,
      hitSoundVolume,
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
      bgaVisibilityIntervals,
      shareTitle,
      shareAuthor,
      gridDivision,
      isLongNoteMode,
      testStartInput,
      playbackSpeed,
      volume,
      hitSoundVolume,
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
      // 복원 시 잘못된 롱노트 검증 및 수정
      const restoredNotes = data.notes.map((note: Note) => {
        // 롱노트 검증: duration이 0 이하이거나 endTime이 time보다 작거나 같으면 탭 노트로 변환
        if (note.type === 'hold' || note.duration > 0) {
          if (note.duration <= 0 || (note.endTime !== undefined && note.endTime <= note.time)) {
            return {
              ...note,
              type: 'tap' as const,
              duration: 0,
              endTime: note.time,
            };
          }
          // 최소 길이 미만이면 탭 노트로 변환
          if (note.duration < MIN_LONG_NOTE_DURATION) {
            return {
              ...note,
              type: 'tap' as const,
              duration: 0,
              endTime: note.time,
            };
          }
          // endTime이 올바르게 설정되지 않은 경우 수정
          if (!note.endTime || note.endTime <= note.time) {
            return {
              ...note,
              endTime: note.time + note.duration,
            };
          }
        }
        return note;
      });
      setNotes(restoredNotes);
      // 히스토리 초기화
      notesHistoryRef.current = [[...restoredNotes]];
      historyIndexRef.current = 0;
      const maxId = restoredNotes.reduce((max: number, note: Note) => {
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
    if (Array.isArray(data.bgaVisibilityIntervals)) {
      const hydrated = data.bgaVisibilityIntervals.map((interval: any, idx: number) => ({
        id: typeof interval.id === 'string' ? interval.id : `bga-${idx}`,
        startTimeMs: Math.max(0, Number(interval.startTimeMs) || 0),
        endTimeMs: Math.max(0, Number(interval.endTimeMs) || 0),
        mode: (interval.mode as BgaVisibilityMode) ?? 'hidden',
        fadeInMs:
          interval.fadeInMs === undefined
            ? undefined
            : Math.max(0, Number(interval.fadeInMs) || 0),
        fadeOutMs:
          interval.fadeOutMs === undefined
            ? undefined
            : Math.max(0, Number(interval.fadeOutMs) || 0),
        easing: interval.easing === 'linear' ? 'linear' : undefined,
      }));
      setBgaVisibilityIntervals(hydrated);
    }
    if (typeof data.chartTitle === 'string') setShareTitle(data.chartTitle);
    if (typeof data.chartAuthor === 'string') setShareAuthor(data.chartAuthor);
    if (typeof data.gridDivision === 'number') setGridDivision(data.gridDivision);
    if (typeof data.isLongNoteMode === 'boolean') setIsLongNoteMode(data.isLongNoteMode);
    if (data.testStartInput !== undefined) setTestStartInput(String(data.testStartInput));
    if (typeof data.playbackSpeed === 'number') setPlaybackSpeed(data.playbackSpeed);
    if (typeof data.volume === 'number') setVolume(data.volume);
    if (typeof data.hitSoundVolume === 'number') setHitSoundVolume(data.hitSoundVolume);
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

    // 자막 데이터 복원
    if (Array.isArray(data.subtitles) && data.subtitles.length > 0) {
      try {
        localSubtitleStorage.save(subtitleSessionId, data.subtitles);
        // 자막 에디터에 알림
        window.dispatchEvent(new CustomEvent('subtitles-restored', { detail: data.subtitles }));
      } catch (error) {
        console.error('Failed to restore subtitles:', error);
      }
    }
  }, [subtitleSessionId]);

  useChartAutosave(AUTO_SAVE_KEY, autoSaveData, handleRestore);

  // 초기화 핸들러
  const handleReset = useCallback(() => {
    if (!confirm('모든 채보 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    setNotes([]);
    // 히스토리 초기화
    notesHistoryRef.current = [[]];
    historyIndexRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackSpeed(1);
    setZoom(1);
    setVolume(100);
    setHitSoundVolume(60);
    setBpm(120);
    setBpmChanges([]);
    setTimeSignatures([{ id: 0, beatIndex: 0, beatsPerMeasure: 4 }]);
    setTimeSignatureOffset(0);
    setTimelineExtraMs(0);
    setGridDivision(1);
    setSpeedChanges([]);
    setBgaVisibilityIntervals([]);
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

  // --- 간주 구간 (채보 레인 숨김) 핸들러 ---
  const normalizeInterval = useCallback(
    (raw: Partial<BgaVisibilityInterval> & { id: string }) => {
      const start = clampTime(Math.max(0, raw.startTimeMs ?? 0));
      const end = clampTime(Math.max(start + 1, raw.endTimeMs ?? start + 1));
      return {
        id: raw.id,
        startTimeMs: Math.min(start, end),
        endTimeMs: Math.max(start, end),
        mode: (raw.mode as BgaVisibilityMode) ?? 'hidden',
        fadeInMs: raw.fadeInMs !== undefined ? Math.max(0, Number(raw.fadeInMs)) : undefined,
        fadeOutMs: raw.fadeOutMs !== undefined ? Math.max(0, Number(raw.fadeOutMs)) : undefined,
        easing: raw.easing === 'linear' ? 'linear' : undefined,
      } as BgaVisibilityInterval;
    },
    [clampTime]
  );

  const handleAddBgaInterval = useCallback(() => {
    const start = clampTime(currentTime);
    const end = clampTime(start + 5000);
    const next: BgaVisibilityInterval = normalizeInterval({
      id: `bga-${Date.now()}`,
      startTimeMs: start,
      endTimeMs: end,
      mode: 'hidden',
      fadeInMs: 300,
      fadeOutMs: 300,
      easing: 'linear',
    });
    setBgaVisibilityIntervals((prev) => [...prev, next].sort((a, b) => a.startTimeMs - b.startTimeMs));
  }, [clampTime, currentTime, normalizeInterval]);

  const handleUpdateBgaInterval = useCallback(
    (id: string, patch: Partial<BgaVisibilityInterval>) => {
      setBgaVisibilityIntervals((prev) =>
        prev
          .map((interval) => (interval.id === id ? normalizeInterval({ ...interval, ...patch, id }) : interval))
          .sort((a, b) => a.startTimeMs - b.startTimeMs)
      );
    },
    [normalizeInterval]
  );

  const handleDeleteBgaInterval = useCallback((id: string) => {
    if (!confirm('이 간주 구간을 삭제할까요?')) return;
    setBgaVisibilityIntervals((prev) => prev.filter((interval) => interval.id !== id));
  }, []);

  // --- 복사/붙여넣기 핸들러 ---
  const handleCopySelection = useCallback(() => {
    // 마퀴 선택은 selectedNoteIds를 기준으로 동작
    const selectedNotes = notes.filter((note) => selectedNoteIds.has(note.id));
    
    if (selectedNotes.length === 0) {
      return;
    }
    
    // 노트들의 시간을 상대 시간으로 변환 (첫 노트 시간을 0으로)
    const minTime = Math.min(...selectedNotes.map((n) => n.time));
    const copiedNotesWithRelativeTime = selectedNotes.map((note) => ({
      ...note,
      time: note.time - minTime,
    }));
    
    setCopiedNotes(copiedNotesWithRelativeTime);
  }, [notes, selectedNoteIds]);

  const handlePasteNotes = useCallback(() => {
    if (copiedNotes.length === 0) {
      return;
    }
    
    // 현재 시간 위치에 노트들을 붙여넣기
    const newNotes = copiedNotes.map((note) => ({
      ...note,
      id: noteIdRef.current++,
      time: note.time + currentTime,
    }));
    
    setNotes((prev) => {
      const newNotesList = [...prev, ...newNotes].sort((a, b) => a.time - b.time);
      saveToHistory(newNotesList);
      return newNotesList;
    });
  }, [copiedNotes, currentTime, saveToHistory]);
  
  // 선택된 노트들을 이동시키는 핸들러
  const handleMoveStart = useCallback((time: number, lane: Lane | null, noteId?: number) => {
    dragStartRef.current = { time, lane: lane ?? 0 };
    setDragOffset({ time: 0, lane: 0 });
    
    // 선택된 노트가 없고 클릭한 노트가 있으면 클릭 노트만 선택
    if (selectedNoteIds.size === 0 && noteId !== undefined) {
      // 선택 영역이 없고 선택된 노트도 없으면 클릭한 노트만 선택
      setSelectedNoteIds(new Set([noteId]));
    }
    // 선택 영역이 없고 이미 선택된 노트가 있으면 그대로 유지
  }, [selectedNoteIds]);
  
  const handleMoveUpdate = useCallback((timeOffset: number, laneOffset: number) => {
    setDragOffset({ time: timeOffset, lane: laneOffset });
  }, []);
  
  const handleMoveEnd = useCallback(() => {
    if (dragOffset && selectedNoteIds.size > 0) {
      // 이동 전 선택된 노트 ID를 저장 (이동 후에도 유지하기 위해)
      const idsToKeep = new Set(selectedNoteIds);
      const currentDragOffset = dragOffset; // 클로저로 현재 오프셋 저장
      
      setNotes((prev) => {
        const newNotes = prev.map((note) => {
          if (idsToKeep.has(note.id)) {
            // 이동 후 시간을 계산하고 그리드에 스냅
            const movedTime = Math.max(0, note.time + currentDragOffset.time);
            const snappedTime = snapToGrid(movedTime);
            const newLane = Math.max(0, Math.min(3, note.lane + currentDragOffset.lane)) as Lane;
            return {
              ...note,
              time: snappedTime,
              lane: newLane,
            };
          }
          return note;
        });
        const sortedNotes = newNotes.sort((a, b) => a.time - b.time);
        saveToHistory(sortedNotes);
        
        // 노트 업데이트 후 오프셋 초기화 (렌더링이 올바른 위치에 표시되도록)
        setDragOffset(null);
        dragStartRef.current = null;
        
        return sortedNotes;
      });
      
      // 이동 후에도 선택 상태를 유지 (윈도우 방식)
    } else {
      // 드래그 오프셋이 없거나 선택된 노트가 없으면 오프셋만 초기화
      setDragOffset(null);
      dragStartRef.current = null;
    }
  }, [dragOffset, selectedNoteIds, saveToHistory, snapToGrid]);

  const handleClearSelection = useCallback(() => {
    setSelectionStartTime(null);
    setSelectionEndTime(null);
    // 이동 모드가 활성화되어 있으면 선택된 노트 ID는 유지
    if (!isMoveMode) {
      setSelectedNoteIds(new Set());
    }
    isSelectingRef.current = false;
  }, [isMoveMode]);

  // 선대칭 반전: 선택된 노트들을 레인 기준으로 반전 (0↔3, 1↔2)
  const handleMirrorNotes = useCallback(() => {
    if (selectedNoteIds.size === 0) {
      alert('반전할 노트를 먼저 선택해주세요.');
      return;
    }

    setNotes((prev) => {
      const newNotes = prev.map((note) => {
        if (selectedNoteIds.has(note.id)) {
          // 선대칭 반전: 레인 0↔3, 1↔2
          const mirroredLane = (3 - note.lane) as Lane;
          return {
            ...note,
            lane: mirroredLane,
          };
        }
        return note;
      });
      const sortedNotes = newNotes.sort((a, b) => a.time - b.time);
      saveToHistory(sortedNotes);
      return sortedNotes;
    });
  }, [selectedNoteIds, saveToHistory]);
  
  // 마퀴 선택 도입 후: 선택 집합은 드래그 박스(hit-test) 결과(selectedNoteIds)로만 관리합니다.
  // (시간 범위 기반 자동 선택은 마퀴와 충돌하므로 제거)

  // 키보드 단축키 (Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+Y, ESC)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z: 실행 취소
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Ctrl+Y 또는 Ctrl+Shift+Z: 다시 실행
      if ((e.ctrlKey && e.key === 'y' && !e.shiftKey && !e.altKey) ||
          (e.ctrlKey && e.key === 'z' && e.shiftKey && !e.altKey)) {
        e.preventDefault();
        handleRedo();
        return;
      }
      
      // Ctrl+C: 복사
      if (e.ctrlKey && e.key === 'c' && !e.shiftKey && !e.altKey) {
        if (selectedNoteIds.size > 0) {
          e.preventDefault();
          handleCopySelection();
        }
        return;
      }
      
      // Ctrl+V: 붙여넣기
      if (e.ctrlKey && e.key === 'v' && !e.shiftKey && !e.altKey) {
        if (copiedNotes.length > 0) {
          e.preventDefault();
          handlePasteNotes();
        }
        return;
      }
      
      // ESC: 선택 해제
      if (e.key === 'Escape') {
        if (selectedNoteIds.size > 0 || selectionStartTime !== null || selectionEndTime !== null) {
          e.preventDefault();
          handleClearSelection();
        }
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectionStartTime, selectionEndTime, selectedNoteIds, copiedNotes, handleCopySelection, handlePasteNotes, handleClearSelection, handleUndo, handleRedo]);


  // --- 핸들러들 ---

  // 노트 추가/삭제
  const addNote = useCallback((lane: Lane, time: number, type: 'tap' | 'hold' = 'tap', duration: number = 0) => {
    // 롱노트 검증: duration이 0 이하이거나 endTime이 time보다 작거나 같으면 탭 노트로 변환
    if (type === 'hold') {
      if (duration <= 0 || time + duration <= time) {
        // 잘못된 롱노트는 탭 노트로 변환
        type = 'tap';
        duration = 0;
      } else if (duration < MIN_LONG_NOTE_DURATION) {
        // 최소 길이 미만이면 탭 노트로 변환
        type = 'tap';
        duration = 0;
      }
    }
    
    const newNote: Note = {
      id: noteIdRef.current++,
      lane,
      time,
      type,
      duration: type === 'hold' ? duration : 0,
      endTime: type === 'hold' ? time + duration : time,
      y: 0, // 렌더링 시 계산
      hit: false,
    };
    setNotes((prev) => {
      const newNotes = [...prev, newNote];
      saveToHistory(newNotes);
      return newNotes;
    });
  }, [saveToHistory]);

  const deleteNote = useCallback((id: number) => {
    // 이동 모드가 활성화되어 있으면 노트 삭제 불가
    if (isMoveMode) {
      return;
    }
    
    setNotes((prev) => {
      const newNotes = prev.filter((n) => n.id !== id);
      saveToHistory(newNotes);
      return newNotes;
    });
  }, [saveToHistory, isMoveMode]);

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
        // 같은 레인에서 롱노트 완성
        const startTime = snapToGrid(Math.min(pendingLongNote.startTime, time));
        const endTime = snapToGrid(Math.max(pendingLongNote.startTime, time));
            const duration = endTime - startTime;
        if (duration >= MIN_LONG_NOTE_DURATION) {
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
          } else if (pendingLongNote && pendingLongNote.lane !== lane) {
        // 다른 레인을 클릭하면 기존 pendingLongNote 취소하고 새로 시작
        setPendingLongNote({ lane, startTime: time });
          } else {
        // 첫 번째 클릭: 롱노트 시작점 설정
        setPendingLongNote({ lane, startTime: time });
          }
        } else {
      // 롱노트 모드가 아니면 pendingLongNote 초기화하고 탭 노트 추가
      if (pendingLongNote) {
        setPendingLongNote(null);
      }
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

  // 박자 변경 핸들러
  const handleAddTimeSignatureChangeAtCurrent = useCallback(() => {
    const currentBeat = timeToBeatIndex(currentTime, bpm, sortedBpmChanges);
    
    const beatsInput = prompt('새 박자 (마디당 비트 수)를 입력하세요:\n예: 3(3/4), 4(4/4), 6(6/8), 7(7/8)', '4');
    if (beatsInput === null) return;
    const beatsPerMeasure = parseInt(beatsInput);
    if (isNaN(beatsPerMeasure) || beatsPerMeasure < 1) {
      alert('유효한 박자를 입력해주세요.');
      return;
    }

    // 현재 위치에서 적용되는 박자 찾기
    const sortedTS = [...timeSignatures].sort((a, b) => a.beatIndex - b.beatIndex);
    let currentBeatsPerMeasure = sortedTS[0]?.beatsPerMeasure || 4;
    let currentMeasureStartBeat = 0;
    
    for (const ts of sortedTS) {
      if (ts.beatIndex <= currentBeat) {
        currentBeatsPerMeasure = ts.beatsPerMeasure;
        currentMeasureStartBeat = ts.beatIndex;
      } else {
        break;
      }
    }
    
    // 현재 마디의 다음 마디 시작 위치로 정렬 (박자 변경은 마디 경계에서만 발생)
    const beatInCurrentMeasure = currentBeat - currentMeasureStartBeat;
    const beatsUntilNextMeasure = currentBeatsPerMeasure - (beatInCurrentMeasure % currentBeatsPerMeasure);
    const alignedBeatIndex = Math.ceil(currentBeat / currentBeatsPerMeasure) * currentBeatsPerMeasure;

    const newId = Math.max(...timeSignatures.map(ts => ts.id), 0) + 1;
    setTimeSignatures(prev => [...prev, { id: newId, beatIndex: alignedBeatIndex, beatsPerMeasure }]);
  }, [currentTime, bpm, sortedBpmChanges, timeSignatures]);

  const handleEditTimeSignatureChange = useCallback((ts: TimeSignatureEvent) => {
    const beatsInput = prompt('새 박자 (마디당 비트 수)를 입력하세요:\n예: 3(3/4), 4(4/4), 6(6/8), 7(7/8)', ts.beatsPerMeasure.toString());
    if (beatsInput === null) return;
    const beatsPerMeasure = parseInt(beatsInput);
    if (isNaN(beatsPerMeasure) || beatsPerMeasure < 1) {
      alert('유효한 박자를 입력해주세요.');
      return;
    }

    const beatInput = prompt('새 비트 인덱스:', ts.beatIndex.toString());
    if (beatInput === null) return;
    const beatIndex = parseFloat(beatInput);
    if (isNaN(beatIndex) || beatIndex < 0) {
      alert('유효한 비트 인덱스를 입력해주세요.');
      return;
    }

    setTimeSignatures(prev => prev.map(t => t.id === ts.id ? { ...t, beatsPerMeasure, beatIndex } : t));
  }, []);

  const handleDeleteTimeSignatureChange = useCallback((id: number) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      setTimeSignatures(prev => prev.filter(t => t.id !== id));
    }
  }, []);

  // 공유/업로드
  const handleShare = useCallback(async () => {
    if (!user) {
      alert('채보를 업로드하려면 먼저 Google 계정으로 로그인해주세요.');
      return;
    }

    if (!shareTitle) {
      alert('제목을 입력해주세요.');
      return;
    }
    
    setIsUploading(true);
    setUploadStatus('업로드 중...');
    
    try {
      await chartAPI.uploadChart({
        title: shareTitle,
        bpm,
        difficulty: shareDifficulty || undefined,
        description: shareDescription || undefined,
        dataJson: JSON.stringify(autoSaveData),
        youtubeUrl: youtubeUrl || undefined,
        previewImage: youtubeThumbnailUrl || undefined,
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
  }, [shareTitle, shareDifficulty, shareDescription, bpm, youtubeUrl, youtubeThumbnailUrl, autoSaveData, user]);

  const handleExportJson = useCallback(() => {
    try {
      // 자막 데이터 가져오기
      const subtitles = localSubtitleStorage.get(subtitleSessionId);
      
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        chart: {
          ...autoSaveData,
          subtitles: subtitles.length > 0 ? subtitles : undefined,
        },
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
  }, [autoSaveData, shareTitle, subtitleSessionId]);

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
        const subtitleCount = Array.isArray(chartData.subtitles) ? chartData.subtitles.length : 0;
        const subtitleMsg = subtitleCount > 0 ? `, 자막 ${subtitleCount}개` : '';
        alert(`JSON 파일을 불러왔습니다. (노트 ${chartData.notes.length}개${subtitleMsg})`);
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
  const didZoomMountRef = useRef(false);
  const lastZoomRef = useRef(zoom);
  useEffect(() => {
    // 초기 마운트 시에는 건너뛰기 (ChartEditorTimeline에서 초기 스크롤 처리)
    if (!didZoomMountRef.current) {
      didZoomMountRef.current = true;
      lastZoomRef.current = zoom;
      return;
    }

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
      
      // Space: 롱노트 모드 토글
      if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
        setIsLongNoteMode(prev => {
          const newMode = !prev;
          // 롱노트 모드를 끄면 pendingLongNote 초기화
          if (!newMode && pendingLongNote) {
            setPendingLongNote(null);
          }
          return newMode;
        });
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
        onTogglePlayback={async () => {
          if (!isPlaying) {
            try {
              await ensureAudioContext();
            } catch {
              // ignore: fallback to play without pre-warm
            }
          }
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
        {/* Left Sidebar */}
        <ChartEditorSidebarLeft
          zoom={zoom}
          onZoomChange={setZoom}
          playbackSpeed={playbackSpeed}
          playbackSpeedOptions={PLAYBACK_SPEED_OPTIONS}
          onPlaybackSpeedChange={setPlaybackSpeed}
          volume={volume}
          onVolumeChange={setVolume}
          hitSoundVolume={hitSoundVolume}
          onHitSoundVolumeChange={setHitSoundVolume}
          beatsPerMeasure={beatsPerMeasure}
          onTimeSignatureChange={(beats) => setTimeSignatures([{ id: 0, beatIndex: 0, beatsPerMeasure: beats }])}
          gridDivision={gridDivision}
          onGridDivisionChange={setGridDivision}
          timeSignatureOffset={timeSignatureOffset}
          timelineExtraMs={timelineExtraMs}
          onTimeSignatureOffsetChange={setTimeSignatureOffset}
          onTimelineExtraChange={(updater) => setTimelineExtraMs((prev) => updater(prev))}
          beatDuration={beatDuration}
          timeSignatures={timeSignatures}
          bpm={bpm}
          bpmChanges={sortedBpmChanges}
          onAddTimeSignatureChangeAtCurrent={handleAddTimeSignatureChangeAtCurrent}
          onEditTimeSignatureChange={handleEditTimeSignatureChange}
          onDeleteTimeSignatureChange={handleDeleteTimeSignatureChange}
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
                bgaVisibilityIntervals={bgaVisibilityIntervals}
                 isSelectionMode={isSelectionMode}
                 selectedLane={selectedLane}
                 isMoveMode={isMoveMode}
                 selectedNoteIds={selectedNoteIds}
                 dragOffset={dragOffset}
                 selectionStartTime={selectionStartTime}
                 selectionEndTime={selectionEndTime}
                 onMarqueeStart={(operation) => {
                   marqueeOperationRef.current = operation;
                   marqueeInitialSelectedIdsRef.current = new Set(selectedNoteIds);
                 }}
                 onMarqueeUpdate={(rectSelectedIds) => {
                   const op = marqueeOperationRef.current;
                   const initial = marqueeInitialSelectedIdsRef.current;
                   let next = new Set<number>();

                   if (op === 'replace') {
                     next = new Set(rectSelectedIds);
                   } else if (op === 'add') {
                     next = new Set(initial);
                     rectSelectedIds.forEach((id) => next.add(id));
                   } else {
                     // toggle (symmetric difference)
                     next = new Set(initial);
                     rectSelectedIds.forEach((id) => {
                       if (next.has(id)) next.delete(id);
                       else next.add(id);
                     });
                   }

                   setSelectedNoteIds(next);
                 }}
                 onMarqueeEnd={() => {
                   // noop: selection 유지
                 }}
                 onSelectionStart={(time, lane) => {
                   setSelectionStartTime(time);
                   setSelectionEndTime(time);
                   setSelectedLane(lane);
                   isSelectingRef.current = true;
                 }}
                 onSelectionUpdate={(time) => {
                   setSelectionEndTime(time);
                 }}
                 onSelectionEnd={() => {
                   isSelectingRef.current = false;
                 }}
                 onMoveStart={handleMoveStart}
                 onMoveUpdate={handleMoveUpdate}
                 onMoveEnd={handleMoveEnd}
                 yToTime={yToTime}
                 pendingLongNote={pendingLongNote}
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

        {/* Right Sidebar */}
        <div
          style={{
            width: '240px',
            backgroundColor: CHART_EDITOR_THEME.sidebarBackground,
            padding: '10px 8px',
            borderLeft: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            color: CHART_EDITOR_THEME.textPrimary,
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: '8px',
              fontSize: '14px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: CHART_EDITOR_THEME.textSecondary,
            }}
          >
            편집
          </h3>
          
          {/* 롱노트 모드 */}
          <div
            style={{
              marginBottom: '10px',
              padding: '6px 8px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
            <button
              onClick={(e) => {
                setIsLongNoteMode(prev => {
                  const newMode = !prev;
                  // 롱노트 모드를 끄면 pendingLongNote 초기화
                  if (!newMode && pendingLongNote) {
                    setPendingLongNote(null);
                  }
                  return newMode;
                });
                e.currentTarget.blur();
              }}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                border: `1px solid ${
                  isLongNoteMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
                }`,
                background: isLongNoteMode
                  ? 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.05))'
                  : 'transparent',
                color: isLongNoteMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              롱노트 모드
            </button>
          </div>

          {/* 선택 모드 */}
          <div
            style={{
              marginBottom: '10px',
              padding: '6px 8px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
            <button
              onClick={(e) => {
                setIsSelectionMode(prev => {
                  if (prev) {
                    setSelectionStartTime(null);
                    setSelectionEndTime(null);
                  }
                  return !prev;
                });
                e.currentTarget.blur();
              }}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                border: `1px solid ${
                  isSelectionMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
                }`,
                background: isSelectionMode
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.05))'
                  : 'transparent',
                color: isSelectionMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              영역 선택 모드
            </button>
          </div>

          {/* 선택 영역 이동 모드 */}
          <div
            style={{
              marginBottom: '10px',
              padding: '6px 8px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
            <button
              onClick={(e) => {
                setIsMoveMode(prev => !prev);
                e.currentTarget.blur();
              }}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                border: `1px solid ${
                  isMoveMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
                }`,
                background: isMoveMode
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))'
                  : 'transparent',
                color: isMoveMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginBottom: '6px',
              }}
            >
              선택 영역 이동 모드
            </button>
            <button
              onClick={(e) => {
                handleMirrorNotes();
                e.currentTarget.blur();
              }}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                background: 'transparent',
                color: CHART_EDITOR_THEME.textPrimary,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBg;
                e.currentTarget.style.borderColor = CHART_EDITOR_THEME.accentStrong;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = CHART_EDITOR_THEME.borderSubtle;
              }}
            >
              🔄 선대칭 반전
            </button>
          </div>

          {/* 변속 (Speed Changes) */}
          <div
            style={{
              marginBottom: '12px',
              padding: '8px',
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                변속 구간
              </span>
              <button
                onClick={handleAddSpeedChangeAtCurrent}
                style={{
                  padding: '3px 6px',
                  fontSize: '10px',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                  backgroundColor: 'rgba(34,211,238,0.12)',
                  color: CHART_EDITOR_THEME.accentStrong,
                  cursor: 'pointer',
                }}
              >
                + 추가
              </button>
            </div>
            <div
              style={{
                fontSize: '10px',
                color: CHART_EDITOR_THEME.textSecondary,
                marginBottom: '4px',
              }}
            >
              기준 BPM은 상단 BPM 입력값이며, 변속 구간 BPM은 절대값입니다.
            </div>
            {speedChanges.length === 0 ? (
              <div
                style={{
                  fontSize: '11px',
                  color: CHART_EDITOR_THEME.textMuted,
                }}
              >
                아직 변속 구간이 없습니다.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: 140,
                  overflowY: 'auto',
                }}
              >
                {speedChanges.map((sc) => {
                  const startMeasure = timeToMeasure(sc.startTimeMs, bpm, sortedBpmChanges, beatsPerMeasure);
                  const endMeasure = sc.endTimeMs == null ? null : timeToMeasure(sc.endTimeMs, bpm, sortedBpmChanges, beatsPerMeasure);
                  const isCurrent =
                    currentTime >= sc.startTimeMs &&
                    (sc.endTimeMs == null || currentTime < sc.endTimeMs);
                  return (
                    <div
                      key={sc.id}
                      style={{
                        padding: '6px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: `1px solid ${
                          isCurrent
                            ? CHART_EDITOR_THEME.accentStrong
                            : CHART_EDITOR_THEME.borderSubtle
                        }`,
                        backgroundColor: isCurrent
                          ? 'rgba(34,211,238,0.12)'
                          : 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            color: CHART_EDITOR_THEME.textSecondary,
                          }}
                        >
                          시작
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={startMeasure}
                          onChange={(e) => {
                            const measure = Math.max(1, parseInt(e.target.value || '1'));
                            const beatIdx = (measure - 1) * beatsPerMeasure;
                            const timeMs = beatIndexToTime(beatIdx, bpm, sortedBpmChanges);
                            handleUpdateSpeedChange(sc.id, {
                              startTimeMs: timeMs,
                            });
                          }}
                          style={{
                            flex: 1,
                            padding: '2px 4px',
                            fontSize: '11px',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '11px',
                            color: CHART_EDITOR_THEME.textSecondary,
                          }}
                        >
                          마디
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            color: CHART_EDITOR_THEME.textSecondary,
                          }}
                        >
                          끝
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={endMeasure || ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (!raw) {
                              handleUpdateSpeedChange(sc.id, { endTimeMs: null });
                              return;
                            }
                            const measure = Math.max(1, parseInt(raw));
                            const beatIdx = (measure - 1) * beatsPerMeasure;
                            const timeMs = beatIndexToTime(beatIdx, bpm, sortedBpmChanges);
                            handleUpdateSpeedChange(sc.id, { endTimeMs: timeMs });
                          }}
                          placeholder="끝까지"
                          style={{
                            flex: 1,
                            padding: '2px 4px',
                            fontSize: '11px',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '11px',
                            color: CHART_EDITOR_THEME.textSecondary,
                          }}
                        >
                          마디
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            color: CHART_EDITOR_THEME.textSecondary,
                          }}
                        >
                          BPM
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={sc.bpm}
                          onChange={(e) =>
                            handleUpdateSpeedChange(sc.id, {
                              bpm: Math.max(1, parseFloat(e.target.value || '1')),
                            })
                          }
                          style={{
                            flex: 1,
                            padding: '2px 4px',
                            fontSize: '11px',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <button
                          onClick={() => handleDeleteSpeedChange(sc.id)}
                          style={{
                            padding: '2px 6px',
                            fontSize: '10px',
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                            border: 'none',
                            backgroundColor: 'rgba(248,113,113,0.18)',
                            color: '#fecaca',
                            cursor: 'pointer',
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 채보 레인 숨김 구간 */}
          <div
            style={{
              marginBottom: '12px',
              padding: '8px',
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>간주 구간 (채보 레인 숨김)</span>
              <button
                onClick={handleAddBgaInterval}
                style={{
                  padding: '2px 6px',
                  fontSize: '10px',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                  backgroundColor: 'rgba(34,211,238,0.12)',
                  color: CHART_EDITOR_THEME.accentStrong,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
            {bgaVisibilityIntervals.length === 0 ? (
              <div style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>구간 없음</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                {bgaVisibilityIntervals.map((it) => {
                  const startBeatIdx = timeToBeatIndex(it.startTimeMs, bpm, sortedBpmChanges);
                  const endBeatIdx = timeToBeatIndex(it.endTimeMs, bpm, sortedBpmChanges);
                  
                  const startMeasureNum = Math.floor(startBeatIdx / beatsPerMeasure);
                  const startBeat = Math.floor(startBeatIdx % beatsPerMeasure) + 1;
                  const endMeasureNum = Math.floor(endBeatIdx / beatsPerMeasure);
                  const endBeat = Math.floor(endBeatIdx % beatsPerMeasure) + 1;

                  return (
                    <div
                      key={it.id}
                      style={{
                        padding: '6px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: `1px solid ${it.mode === 'hidden' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
                        backgroundColor: 'rgba(15,23,42,0.4)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <input
                          type="text"
                          placeholder="마디"
                          value={startMeasureNum + 1}
                          onChange={(e) => {
                            const m = Math.max(0, (parseInt(e.target.value) || 1) - 1);
                            const beatIdx = m * beatsPerMeasure + (startBeat - 1);
                            const newMs = beatIndexToTime(beatIdx, bpm, sortedBpmChanges);
                            handleUpdateBgaInterval(it.id, { startTimeMs: newMs });
                          }}
                          style={{
                            width: 32,
                            padding: '3px 4px',
                            fontSize: 11,
                            textAlign: 'center',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textSecondary }}>.</span>
                        <input
                          type="text"
                          placeholder="박"
                          value={startBeat}
                          onChange={(e) => {
                            const b = Math.max(1, Math.min(beatsPerMeasure, parseInt(e.target.value) || 1));
                            const beatIdx = startMeasureNum * beatsPerMeasure + (b - 1);
                            const newMs = beatIndexToTime(beatIdx, bpm, sortedBpmChanges);
                            handleUpdateBgaInterval(it.id, { startTimeMs: newMs });
                          }}
                          style={{
                            width: 28,
                            padding: '3px 4px',
                            fontSize: 11,
                            textAlign: 'center',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textMuted, margin: '0 2px' }}>~</span>
                        <input
                          type="text"
                          placeholder="마디"
                          value={endMeasureNum + 1}
                          onChange={(e) => {
                            const m = Math.max(0, (parseInt(e.target.value) || 1) - 1);
                            const beatIdx = m * beatsPerMeasure + (endBeat - 1);
                            const newMs = beatIndexToTime(beatIdx, bpm, sortedBpmChanges);
                            handleUpdateBgaInterval(it.id, { endTimeMs: newMs });
                          }}
                          style={{
                            width: 32,
                            padding: '3px 4px',
                            fontSize: 11,
                            textAlign: 'center',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textSecondary }}>.</span>
                        <input
                          type="text"
                          placeholder="박"
                          value={endBeat}
                          onChange={(e) => {
                            const b = Math.max(1, Math.min(beatsPerMeasure, parseInt(e.target.value) || 1));
                            const beatIdx = endMeasureNum * beatsPerMeasure + (b - 1);
                            const newMs = beatIndexToTime(beatIdx, bpm, sortedBpmChanges);
                            handleUpdateBgaInterval(it.id, { endTimeMs: newMs });
                          }}
                          style={{
                            width: 28,
                            padding: '3px 4px',
                            fontSize: 11,
                            textAlign: 'center',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <div style={{ flex: 1 }} />
                        <button
                          onClick={() => handleDeleteBgaInterval(it.id)}
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                            border: `1px solid ${CHART_EDITOR_THEME.danger}`,
                            backgroundColor: 'rgba(239,68,68,0.12)',
                            color: CHART_EDITOR_THEME.danger,
                            cursor: 'pointer',
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => handleUpdateBgaInterval(it.id, { mode: it.mode === 'hidden' ? 'visible' : 'hidden' })}
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                            border: `1px solid ${it.mode === 'hidden' ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'}`,
                            backgroundColor: it.mode === 'hidden' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                            color: it.mode === 'hidden' ? '#fca5a5' : '#86efac',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {it.mode === 'hidden' ? '레인 숨김' : '레인 표시'}
                        </button>
                        <span style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>F-in</span>
                        <input
                          type="number"
                          min={0}
                          value={Math.round(it.fadeInMs ?? 0)}
                          onChange={(e) =>
                            handleUpdateBgaInterval(it.id, { fadeInMs: Math.max(0, Number(e.target.value) || 0) })
                          }
                          style={{
                            width: 42,
                            padding: '2px 4px',
                            fontSize: 10,
                            textAlign: 'center',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <span style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>F-out</span>
                        <input
                          type="number"
                          min={0}
                          value={Math.round(it.fadeOutMs ?? 0)}
                          onChange={(e) =>
                            handleUpdateBgaInterval(it.id, { fadeOutMs: Math.max(0, Number(e.target.value) || 0) })
                          }
                          style={{
                            width: 42,
                            padding: '2px 4px',
                            fontSize: 10,
                            textAlign: 'center',
                            backgroundColor: '#020617',
                            color: CHART_EDITOR_THEME.textPrimary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                          }}
                        />
                        <button
                          onClick={() => handleUpdateBgaInterval(it.id, { fadeInMs: 0, fadeOutMs: 0 })}
                          title="페이드 제거 (하드컷)"
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            backgroundColor: 'rgba(148,163,184,0.12)',
                            color: CHART_EDITOR_THEME.textSecondary,
                            cursor: 'pointer',
                          }}
                        >
                          즉시
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 테스트 시작 위치 */}
          <div
            style={{
              marginBottom: '12px',
              padding: '8px',
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              테스트 시작 위치
            </label>
            <input
              type="text"
              value={testStartInput}
              onChange={(e) => setTestStartInput(e.target.value)}
              placeholder="ms"
              style={{
                width: '100%',
                padding: '4px 6px',
                backgroundColor: '#020617',
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                marginBottom: '6px',
                fontSize: '12px',
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setTestStartInput(Math.floor(currentTime).toString())}
                style={{
                  flex: 1,
                  padding: '4px',
                  backgroundColor: 'rgba(34,211,238,0.14)',
                  color: CHART_EDITOR_THEME.accentStrong,
                  border: 'none',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                현재 위치
              </button>
              <button
                onClick={() => setTestStartInput('0')}
                style={{
                  flex: 1,
                  padding: '4px',
                  backgroundColor: 'rgba(148,163,184,0.14)',
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: 'none',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                0
              </button>
            </div>
            <button
              onClick={() => {
            if (onTest) {
                // 테스트 실행 전 잘못된 롱노트 필터링 및 수정
                const validatedNotes = notes.map((note) => {
                  // 롱노트 검증: duration이 0 이하이거나 endTime이 time보다 작거나 같으면 탭 노트로 변환
                  if (note.type === 'hold' || note.duration > 0) {
                    if (note.duration <= 0 || note.endTime <= note.time) {
                      return {
                        ...note,
                        type: 'tap' as const,
                        duration: 0,
                        endTime: note.time,
                      };
                    }
                    // 최소 길이 미만이면 탭 노트로 변환
                    if (note.duration < MIN_LONG_NOTE_DURATION) {
                      return {
                        ...note,
                        type: 'tap' as const,
                        duration: 0,
                        endTime: note.time,
                      };
                    }
                  }
                  return note;
                });
                
                onTest({
                    notes: validatedNotes,
                    startTimeMs: parseInt(testStartInput) || 0,
                    youtubeVideoId,
                    youtubeUrl,
                    playbackSpeed: 1, // 테스트 시 항상 1.0배속으로 강제
                audioOffsetMs: 0,
                bpm,
                speedChanges,
                    bgaVisibilityIntervals,
                chartId: subtitleSessionId,
                });
            }
          }}
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '6px',
                background:
                  'linear-gradient(135deg, #22c55e, #4ade80)',
                color: '#022c22',
                border: 'none',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '12px',
              }}
            >
              테스트 실행
            </button>
          </div>

          {/* 공유 버튼 */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            style={{
              width: '100%',
              padding: '6px',
              background:
                'linear-gradient(135deg, #38bdf8, #818cf8)',
              color: '#0b1120',
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusLg,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
            }}
          >
            공유
          </button>
        </div>
      </div>

      {/* Share Modal */}
      <ChartShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={shareTitle}
        onTitleChange={setShareTitle}
        author={resolvedAuthor || shareAuthor}
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
