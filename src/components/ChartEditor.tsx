import React, { startTransition, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Note, BPMChange, ChartTestPayload, SubtitleEditorChartData, Lane, SpeedChange, BgaVisibilityInterval, LanePositionInterval } from '../types/game';
import { ChartEditorHeader } from './ChartEditor/ChartEditorHeader';
import { ChartEditorSidebarLeft } from './ChartEditor/ChartEditorSidebarLeft';
import { ChartEditorSidebarRight } from './ChartEditor/ChartEditorSidebarRight';
import { ChartEditorTimeline } from './ChartEditor/ChartEditorTimeline';
import { ChartShareModal } from './ChartEditor/ChartShareModal';
import { ChartEditorLoadExistingModal } from './ChartEditor/ChartEditorLoadExistingModal';
import { useChartYoutubePlayer } from '../hooks/useChartYoutubePlayer';
import { useChartTimeline } from '../hooks/useChartTimeline';
import { useChartAutosave } from '../hooks/useChartAutosave';
import { useChartHistory } from '../hooks/useChartHistory';
import { useHitSound } from '../hooks/useHitSound';
import { useEditorMetronome } from '../hooks/useEditorMetronome';
import { TapBPMCalculator, isValidBPM } from '../utils/bpmAnalyzer';
import { calculateTotalBeatsWithChanges, formatSongLength, timeToMeasure } from '../utils/bpmUtils';
import { chartAPI, supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { api, ApiChart } from '../lib/api';
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
import { getDisplayChartDifficulty } from '../constants/chartDifficulty';
import { localSubtitleStorage } from '../lib/subtitleAPI';
import {
  MIN_LONG_NOTE_DURATION,
  getMaxNoteId,
  hasAnyNotePlacementConflict,
  hasNotePlacementConflict,
  validateNotes,
} from '../utils/noteValidation';
import { convertBgaEventsToEditableIntervals } from '../utils/bgaVisibility';
import {
  DEFAULT_LANE_POSITION_DURATION_MS,
  normalizeLanePositionIntervals,
} from '../utils/lanePositionIntervals';
import { normalizeSubtitlePayload } from '../utils/subtitleNormalization';
import { getChartPayload } from '../utils/chartPayload';
import { START_DELAY_MS } from '../constants/gameConstants';
import { AudioAnalysisData } from '../types/audioAnalysis';
import {
  blurEditorNonTextControlAfterPointer,
  blurEditorSelectAfterChange,
  blurEditorTransientAction,
  isInteractiveElementFocused,
  isTextEditingTarget,
  preventTransientEditorActionFocus,
} from '../utils/editorFocus';

const KEY_TO_LANE: Record<string, Lane> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
};
const BGA_INTERVAL_MIN_DURATION_MS = 120;
const EDITOR_CONTRIBUTION_DRAFT_KEY = 'userhythm:editor-contribution-draft';
// The playhead reads internalTimeRef on every animation frame. React snapshots
// only need 30 Hz, which keeps large charts from re-rendering thousands of notes
// often enough to disturb the editor clock.
const EDITOR_UI_COMMIT_INTERVAL_MS = 1000 / 30;
const EDITOR_METRONOME_STORAGE_KEY = 'userhythm:editor-metronome:v1';

interface EditorMetronomeSettings {
  enabled: boolean;
  volume: number;
}

const loadEditorMetronomeSettings = (): EditorMetronomeSettings => {
  if (typeof window === 'undefined') return { enabled: false, volume: 35 };
  try {
    const parsed = JSON.parse(localStorage.getItem(EDITOR_METRONOME_STORAGE_KEY) || 'null');
    return {
      enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : false,
      volume:
        typeof parsed?.volume === 'number' && Number.isFinite(parsed.volume)
          ? Math.max(0, Math.min(100, Math.round(parsed.volume)))
          : 35,
    };
  } catch {
    return { enabled: false, volume: 35 };
  }
};

const keepTimelineActionButtonFromTakingFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.preventDefault();
};

const blurPointerTimelineActionButton = (event: React.MouseEvent<HTMLButtonElement>) => {
  if (event.detail > 0) {
    event.currentTarget.blur();
  }
};

interface EditorTimelineActionRailsProps {
  isLongNoteMode: boolean;
  isMoveMode: boolean;
  isBgaPlacementMode: boolean;
  selectedNoteCount: number;
  onToggleLongNoteMode: () => void;
  onToggleMoveMode: () => void;
  onToggleBgaPlacementMode: () => void;
  onMirrorNotes: () => void;
}

const timelineRailButtonStyle = (active = false): React.CSSProperties => ({
  width: '100%',
  minHeight: 42,
  padding: '8px 10px',
  borderRadius: CHART_EDITOR_THEME.radiusLg,
  border: `1px solid ${active ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle}`,
  background: active
    ? 'linear-gradient(135deg, rgba(34,211,238,0.24), rgba(129,140,248,0.16))'
    : 'rgba(2,6,23,0.72)',
  color: active ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
  boxShadow: active
    ? '0 0 18px rgba(34,211,238,0.18)'
    : '0 10px 24px rgba(0,0,0,0.28)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.02em',
  textAlign: 'left',
  transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
});

const EditorTimelineActionRails: React.FC<EditorTimelineActionRailsProps> = React.memo(({
  isLongNoteMode,
  isMoveMode,
  isBgaPlacementMode,
  selectedNoteCount,
  onToggleLongNoteMode,
  onToggleMoveMode,
  onToggleBgaPlacementMode,
  onMirrorNotes,
}) => {
  const railBaseStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    width: 136,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'auto',
  };

  const railLabelStyle: React.CSSProperties = {
    padding: '0 4px',
    color: CHART_EDITOR_THEME.textMuted,
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    textShadow: '0 1px 8px rgba(0,0,0,0.6)',
  };

  return (
    <>
      <style>{`
        @media (max-width: 1320px) {
          .chart-editor-lane-action-rail {
            width: 118px !important;
          }
          .chart-editor-lane-action-rail button {
            min-height: 38px !important;
            padding: 7px 8px !important;
            font-size: 11px !important;
          }
        }
      `}</style>
      <div
        className="chart-editor-lane-action-rails"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 30,
          pointerEvents: 'none',
        }}
      >
        <div
          className="chart-editor-lane-action-rail"
          style={{
            ...railBaseStyle,
            right: 'calc(50% + 244px)',
          }}
        >
          <div style={railLabelStyle}>Edit Mode</div>
          <button
            data-editor-transient-action="true"
            onMouseDown={keepTimelineActionButtonFromTakingFocus}
            onClick={(e) => {
              onToggleLongNoteMode();
              blurPointerTimelineActionButton(e);
            }}
            style={timelineRailButtonStyle(isLongNoteMode)}
          >
            롱노트
            <span style={{ display: 'block', marginTop: 3, color: CHART_EDITOR_THEME.textMuted, fontSize: 10 }}>
              {isLongNoteMode ? 'ON' : 'OFF'} · Space
            </span>
          </button>
          <button
            data-editor-transient-action="true"
            onMouseDown={keepTimelineActionButtonFromTakingFocus}
            onClick={(e) => {
              onToggleMoveMode();
              blurPointerTimelineActionButton(e);
            }}
            style={timelineRailButtonStyle(isMoveMode)}
          >
            선택 이동
            <span style={{ display: 'block', marginTop: 3, color: CHART_EDITOR_THEME.textMuted, fontSize: 10 }}>
              {isMoveMode ? 'ON' : 'OFF'}
            </span>
          </button>
          <button
            data-editor-transient-action="true"
            onMouseDown={keepTimelineActionButtonFromTakingFocus}
            onClick={(e) => {
              onToggleBgaPlacementMode();
              blurPointerTimelineActionButton(e);
            }}
            style={timelineRailButtonStyle(isBgaPlacementMode)}
          >
            BGA 페이드
            <span style={{ display: 'block', marginTop: 3, color: CHART_EDITOR_THEME.textMuted, fontSize: 10 }}>
              {isBgaPlacementMode ? '배치 중' : '배치 대기'}
            </span>
          </button>
        </div>

        <div
          className="chart-editor-lane-action-rail"
          style={{
            ...railBaseStyle,
            left: 'calc(50% + 244px)',
          }}
        >
          <div style={railLabelStyle}>Selection</div>
          <button
            data-editor-transient-action="true"
            onMouseDown={keepTimelineActionButtonFromTakingFocus}
            onClick={(e) => {
              onMirrorNotes();
              blurPointerTimelineActionButton(e);
            }}
            style={timelineRailButtonStyle(selectedNoteCount > 0)}
          >
            선대칭 반전
            <span style={{ display: 'block', marginTop: 3, color: CHART_EDITOR_THEME.textMuted, fontSize: 10 }}>
              선택 {selectedNoteCount}개
            </span>
          </button>
        </div>
      </div>
    </>
  );
});

interface ChartEditorProps {
  onCancel: () => void;
  onTest?: (payload: ChartTestPayload) => void;
  onOpenSubtitleEditor?: (chartData: SubtitleEditorChartData) => void;
  isAdmin?: boolean;
}

export const ChartEditor: React.FC<ChartEditorProps> = ({
  onCancel,
  onTest,
  onOpenSubtitleEditor,
  isAdmin = false,
}) => {
  // --- 기본 상태 ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const isPlayingRef = useRef(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1);
  const [volume, setVolume] = useState<number>(100);
  const [hitSoundVolume, setHitSoundVolume] = useState<number>(40);
  const [metronomeSettings, setMetronomeSettings] = useState<EditorMetronomeSettings>(
    loadEditorMetronomeSettings
  );
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
  const [cachedSubtitlePayload, setCachedSubtitlePayload] = useState(() =>
    normalizeSubtitlePayload(
      typeof window === 'undefined' ? 'local' : localStorage.getItem('subtitle-session-id') || 'local',
      typeof window === 'undefined'
        ? []
        : localSubtitleStorage.get(localStorage.getItem('subtitle-session-id') || 'local'),
      typeof window === 'undefined'
        ? []
        : localSubtitleStorage.getTracks(localStorage.getItem('subtitle-session-id') || 'local')
    )
  );
  useEffect(() => {
    const handler = (event: Event) => {
      try {
        const custom = event as CustomEvent<string>;
        if (typeof custom.detail === 'string' && custom.detail.length > 0) {
          setSubtitleSessionId(custom.detail);
          setCachedSubtitlePayload(
            normalizeSubtitlePayload(
              custom.detail,
              localSubtitleStorage.get(custom.detail),
              localSubtitleStorage.getTracks(custom.detail)
            )
          );
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

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<any>;
      const detail = custom.detail;
      if (!detail || detail.chartId !== subtitleSessionId) return;
      setCachedSubtitlePayload(
        normalizeSubtitlePayload(
          subtitleSessionId,
          Array.isArray(detail.subtitles) ? detail.subtitles : [],
          Array.isArray(detail.subtitleTracks) ? detail.subtitleTracks : []
        )
      );
    };
    window.addEventListener('subtitle-payload-updated', handler as EventListener);
    return () => {
      window.removeEventListener('subtitle-payload-updated', handler as EventListener);
    };
  }, [subtitleSessionId]);

  
  // --- BPM & Grid 상태 ---
  const [bpm, setBpm] = useState<number>(120);
  const [bpmChanges, setBpmChanges] = useState<BPMChange[]>([]);
  // 기본 박자표만 유지 (마디별 박자 변경 기능 제거)
  const [beatsPerMeasure, setBeatsPerMeasure] = useState<number>(4);
  const [timeSignatureOffset, setTimeSignatureOffset] = useState<number>(0);
  const [timelineExtraMs, setTimelineExtraMs] = useState<number>(0);
  const [audioOffsetMs, setAudioOffsetMs] = useState<number>(0);
  const [startDelayMs, setStartDelayMs] = useState<number>(START_DELAY_MS);
  const [gridDivision, setGridDivision] = useState<number>(4);
  const [speedChanges, setSpeedChanges] = useState<SpeedChange[]>([]);
  const [bgaVisibilityIntervals, setBgaVisibilityIntervals] = useState<BgaVisibilityInterval[]>([]);
  const [lanePositionIntervals, setLanePositionIntervals] = useState<LanePositionInterval[]>([]);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisData | null>(null);

  const handleNumericInputFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== 'number' && target.dataset.selectOnFocus !== 'true') return;

    requestAnimationFrame(() => {
      if (document.activeElement === target) {
        target.select();
      }
    });
  }, []);

  // --- 선택 영역 상태 (복사/붙여넣기) ---
  const isSelectionMode = true; // 항상 영역 선택 모드 활성화
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
  
  // --- 실행 취소/다시 실행 (useChartHistory 훅 사용) ---
  const {
    saveToHistory,
    undo: undoHistory,
    redo: redoHistory,
    reset: resetHistory,
  } = useChartHistory<Note[]>({ maxSize: 50 });

  // 실행 취소 핸들러
  const handleUndo = useCallback(() => {
    const prevState = undoHistory();
    if (prevState) {
      setNotes([...prevState]);
    }
  }, [undoHistory]);

  // 다시 실행 핸들러
  const handleRedo = useCallback(() => {
    const nextState = redoHistory();
    if (nextState) {
      setNotes([...nextState]);
    }
  }, [redoHistory]);
  
  // --- UI 상태 ---
  const [isBpmInputOpen, setIsBpmInputOpen] = useState<boolean>(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(true);
  const [isLongNoteMode, setIsLongNoteMode] = useState<boolean>(false);
  const [isBgaPlacementMode, setIsBgaPlacementMode] = useState<boolean>(false);
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
  const dragPlayheadRafIdRef = useRef<number | null>(null);
  const lastUiCommitTimestampRef = useRef<number | null>(null);
  const lastHitCheckTimeRef = useRef<number>(0);
  const playedNoteIdsRef = useRef<Set<number>>(new Set());
  const lastCheckedNoteIndexRef = useRef<number>(0); // 성능 최적화: 마지막으로 확인한 노트 인덱스

  // --- 공유 모달 상태 ---
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareTitle, setShareTitle] = useState<string>('');
  const [shareAuthor, setShareAuthor] = useState<string>('');
  const [shareDifficulty, setShareDifficulty] = useState<string>('Normal');
  const [adminAssignedDifficulty, setAdminAssignedDifficulty] = useState<string>('');
  const [shareDescription, setShareDescription] = useState<string>('');
  const [shareIsWip, setShareIsWip] = useState<boolean>(false);
  const [shareWipNote, setShareWipNote] = useState<string>('');
  const [wipParentChartId, setWipParentChartId] = useState<string | null>(null);
  const [sharePreviewStartMeasure, setSharePreviewStartMeasure] = useState<number>(1);
  const [sharePreviewEndMeasure, setSharePreviewEndMeasure] = useState<number>(5);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [user, setUser] = useState<any>(null);
  const [editingChartId, setEditingChartId] = useState<string | null>(null);
  const [isLoadExistingModalOpen, setIsLoadExistingModalOpen] = useState<boolean>(false);
  const [isLoadingExistingCharts, setIsLoadingExistingCharts] = useState<boolean>(false);
  const [existingCharts, setExistingCharts] = useState<ApiChart[]>([]);
  const [existingChartsError, setExistingChartsError] = useState<string>('');
  const [existingChartSearch, setExistingChartSearch] = useState<string>('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const analysisInputRef = useRef<HTMLInputElement>(null);

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
    applyImmediatePlaybackState,
    getSynchronizedTimelineTime,
    youtubePlayerRef,
  } = useChartYoutubePlayer({
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    audioOffsetMs,
    volume,
  });

  const youtubeThumbnailUrl = useMemo(() => {
    if (youtubeVideoId) {
      return `https://img.youtube.com/vi/${youtubeVideoId}/maxresdefault.jpg`;
    }
    if (youtubeUrl) {
      const fallbackId = extractYouTubeVideoId(youtubeUrl);
      if (fallbackId) {
        return `https://img.youtube.com/vi/${fallbackId}/maxresdefault.jpg`;
      }
    }
    return null;
  }, [youtubeVideoId, youtubeUrl]);

  // --- 키음 재생 (useHitSound 훅 사용) ---
  const {
    play: playHitSound,
    setVolume: setHitSoundVolumeInternal,
    ensureContext: ensureAudioContext,
  } = useHitSound(hitSoundVolume);

  // 키음 볼륨 변경 시 훅에 반영
  useEffect(() => {
    setHitSoundVolumeInternal(hitSoundVolume);
  }, [hitSoundVolume, setHitSoundVolumeInternal]);

  useEffect(() => {
    try {
      localStorage.setItem(EDITOR_METRONOME_STORAGE_KEY, JSON.stringify(metronomeSettings));
    } catch {
      // Editor preferences remain usable even when storage is unavailable.
    }
  }, [metronomeSettings]);

  const sortedNotesByTime = useMemo(() => {
    return [...notes].sort((a, b) => a.time - b.time);
  }, [notes]);
  const sortedNotesByTimeRef = useRef<Note[]>([]);

  useEffect(() => {
    sortedNotesByTimeRef.current = sortedNotesByTime;
  }, [sortedNotesByTime]);

  // --- 재생선이 지나간 노트에 키음 재생 (ref 기반 cursor) ---
  const resetEditorHitCursor = useCallback((time: number) => {
    const notes = sortedNotesByTimeRef.current;
    if (notes.length === 0) {
      lastCheckedNoteIndexRef.current = 0;
      playedNoteIdsRef.current.clear();
      lastHitCheckTimeRef.current = time;
      return;
    }

    let left = 0;
    let right = notes.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (notes[mid].time < time) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    const rebuilt = new Set<number>();
    for (let i = 0; i < left; i++) {
      rebuilt.add(notes[i].id);
    }
    lastCheckedNoteIndexRef.current = left;
    playedNoteIdsRef.current = rebuilt;
    lastHitCheckTimeRef.current = time;
  }, []);

  const scanEditorHitSounds = useCallback((time: number) => {
    const notes = sortedNotesByTimeRef.current;
    if (notes.length === 0) return;

    if (time < lastHitCheckTimeRef.current) {
      resetEditorHitCursor(time);
    }

    let idx = lastCheckedNoteIndexRef.current;
    let crossedNoteCount = 0;

    while (idx < notes.length && notes[idx].time <= time) {
      if (!playedNoteIdsRef.current.has(notes[idx].id)) {
        playedNoteIdsRef.current.add(notes[idx].id);
        crossedNoteCount++;
      }
      idx++;
    }

    lastCheckedNoteIndexRef.current = idx;
    lastHitCheckTimeRef.current = time;

    if (crossedNoteCount > 0) {
      playHitSound();
    }
  }, [playHitSound, resetEditorHitCursor]);

  // --- 에디터 전용 타이머(재생선 시간 소스) ---
  // 매 프레임 상태 업데이트 (모니터 주사율에 맞춤)
  const internalTimeRef = useRef<number>(0);
  const [autosaveCurrentTime, setAutosaveCurrentTime] = useState<number>(0);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      if (playheadRafIdRef.current !== null) {
        cancelAnimationFrame(playheadRafIdRef.current);
        playheadRafIdRef.current = null;
      }
      lastUiCommitTimestampRef.current = null;
      return;
    }

    let clockAnchorTimeMs = Math.max(0, internalTimeRef.current);
    let clockAnchorTimestamp: number | null = null;

    const tick = (timestamp: number) => {
      if (!isPlaying) return;

      if (clockAnchorTimestamp === null) {
        clockAnchorTimestamp = timestamp;
      }

      // Derive time from one monotonic anchor instead of accumulating frame
      // deltas. A heavy chart may skip frames, but it must never lose song time.
      const fallbackTime = Math.max(
        0,
        clockAnchorTimeMs + (timestamp - clockAnchorTimestamp) * playbackSpeed
      );

      const nextRuntimeTime = youtubeVideoId
        ? getSynchronizedTimelineTime(fallbackTime)
        : fallbackTime;

      // YouTube startup gating or drift correction can adjust the clock. Rebase
      // the monotonic anchor so the next frame continues from that exact point.
      if (Math.abs(nextRuntimeTime - fallbackTime) > 0.5) {
        clockAnchorTimeMs = nextRuntimeTime;
        clockAnchorTimestamp = timestamp;
      }

      if (nextRuntimeTime !== internalTimeRef.current) {
        internalTimeRef.current = nextRuntimeTime;
        scanEditorHitSounds(internalTimeRef.current);
        const shouldCommitUi =
          lastUiCommitTimestampRef.current === null ||
          timestamp - lastUiCommitTimestampRef.current >= EDITOR_UI_COMMIT_INTERVAL_MS;

        if (shouldCommitUi) {
          lastUiCommitTimestampRef.current = timestamp;
          const nextTime = internalTimeRef.current;
          startTransition(() => {
            setCurrentTime(nextTime);
          });
        }
      }
      playheadRafIdRef.current = requestAnimationFrame(tick);
    };

    playheadRafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (playheadRafIdRef.current !== null) {
        cancelAnimationFrame(playheadRafIdRef.current);
        playheadRafIdRef.current = null;
      }
      lastUiCommitTimestampRef.current = null;
      // 최종 시간 동기화
      setCurrentTime(internalTimeRef.current);
       };
  }, [isPlaying, playbackSpeed, scanEditorHitSounds, youtubeVideoId, getSynchronizedTimelineTime]);

  useEffect(() => {
    if (!isPlaying) {
      internalTimeRef.current = currentTime;
    }
  }, [currentTime, isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      const next = Math.max(0, Math.floor(currentTime));
      setAutosaveCurrentTime((prev) => (prev === next ? prev : next));
    }
  }, [currentTime, isPlaying]);

  // --- 계산된 값들 ---
  const beatDuration = useMemo(() => (60000 / bpm), [bpm]);
  
  const sortedBpmChanges = useMemo(() => {
    return [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);
  }, [bpmChanges]);

  useEditorMetronome({
    enabled: metronomeSettings.enabled,
    volume: metronomeSettings.volume,
    isPlaying,
    currentTimeRef: internalTimeRef,
    playbackSpeed,
    bpm,
    bpmChanges: sortedBpmChanges,
    beatsPerMeasure,
    timeSignatureOffset,
    ensureAudioContext,
  });


  const timelineDurationMs = useMemo(() => {
    const lastNoteTime = notes.length > 0 
      ? Math.max(...notes.map(n => n.endTime || n.time)) 
      : 0;
    const bgaEndTime = bgaVisibilityIntervals.length > 0
      ? Math.max(...bgaVisibilityIntervals.map((interval) => interval.endTimeMs))
      : 0;
    const lanePositionEndTime = lanePositionIntervals.length > 0
      ? Math.max(...lanePositionIntervals.map((interval) => interval.endTimeMs))
      : 0;
    const subtitleEndTime = cachedSubtitlePayload.subtitles.length > 0
      ? Math.max(...cachedSubtitlePayload.subtitles.map((cue) => cue.endTimeMs))
      : 0;
    const videoDurationMs = (videoDurationSeconds || 0) * 1000;
    const validVideoDuration = (videoDurationSeconds && videoDurationSeconds > 0) 
      ? videoDurationMs 
      : MIN_TIMELINE_DURATION_MS;
    const baseDuration = Math.max(
      lastNoteTime + 5000,
      bgaEndTime,
      lanePositionEndTime,
      subtitleEndTime,
      validVideoDuration,
      MIN_TIMELINE_DURATION_MS
    );
    return Math.max(MIN_TIMELINE_DURATION_MS, baseDuration + timelineExtraMs);
  }, [notes, bgaVisibilityIntervals, lanePositionIntervals, cachedSubtitlePayload.subtitles, videoDurationSeconds, timelineExtraMs]);

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

  // 재생이 멈춰 있는 동안 재생선을 옮기면 인덱스 재설정
  useEffect(() => {
    if (!isPlaying) {
      resetEditorHitCursor(currentTime);
    }
  }, [isPlaying, currentTime, resetEditorHitCursor]);

  // --- 자동 저장 ---
  const autoSaveData = useMemo(
    () => {
      return {
        notes,
        bpm,
        youtubeUrl,
        youtubeVideoId,
        beatsPerMeasure,
        timeSignatureOffset,
        timelineExtraMs,
        audioOffsetMs,
        startDelayMs,
        bpmChanges,
        speedChanges,
        bgaVisibilityIntervals,
        lanePositionIntervals,
        subtitles: cachedSubtitlePayload.subtitles.length > 0 ? cachedSubtitlePayload.subtitles : undefined,
        subtitleTracks: cachedSubtitlePayload.subtitleTracks,
        editingChartId,
        chartTitle: shareTitle,
        chartAuthor: shareAuthor,
        chartDifficulty: shareDifficulty,
        chartDescription: shareDescription,
        previewStartMeasure: sharePreviewStartMeasure,
        previewEndMeasure: sharePreviewEndMeasure,
        wip: shareIsWip
          ? {
              enabled: true,
              note: shareWipNote,
              parentChartId: wipParentChartId,
            }
          : undefined,
        gridDivision,
        isLongNoteMode,
        testStartInput,
        playbackSpeed,
        volume,
        hitSoundVolume,
        currentTime: autosaveCurrentTime,
        isAutoScrollEnabled,
        zoom,
      };
    },
    [
    notes,
    bpm,
    youtubeUrl,
    youtubeVideoId,
    beatsPerMeasure,
    timeSignatureOffset,
      audioOffsetMs,
      startDelayMs,
      bpmChanges,
        speedChanges,
        bgaVisibilityIntervals,
        lanePositionIntervals,
      editingChartId,
      shareTitle,
      shareAuthor,
      shareDifficulty,
      shareDescription,
      sharePreviewStartMeasure,
      sharePreviewEndMeasure,
      shareIsWip,
      shareWipNote,
      wipParentChartId,
      subtitleSessionId,
      gridDivision,
      isLongNoteMode,
      testStartInput,
      playbackSpeed,
      volume,
      hitSoundVolume,
      autosaveCurrentTime,
      isAutoScrollEnabled,
      zoom,
      timelineExtraMs,
      cachedSubtitlePayload,
    ]
  );

  const derivePreviewMeasureRange = useCallback((data: any) => {
    const explicitStart =
      typeof data?.previewStartMeasure === 'number' && Number.isFinite(data.previewStartMeasure)
        ? Math.max(1, Math.floor(data.previewStartMeasure))
        : null;
    const explicitEnd =
      typeof data?.previewEndMeasure === 'number' && Number.isFinite(data.previewEndMeasure)
        ? Math.floor(data.previewEndMeasure)
        : null;

    if (explicitStart !== null) {
      return {
        start: explicitStart,
        end: Math.max(explicitStart + 1, explicitEnd ?? explicitStart + 4),
      };
    }

    if (Array.isArray(data?.subtitles) && data.subtitles.length > 0) {
      const firstCue = data.subtitles[0];
      const cueStartMs = Number(firstCue?.startTimeMs);
      if (Number.isFinite(cueStartMs)) {
        const derivedStart = Math.max(
          1,
          timeToMeasure(
            cueStartMs,
            typeof data?.bpm === 'number' ? data.bpm : bpm,
            Array.isArray(data?.bpmChanges) ? data.bpmChanges : bpmChanges,
            typeof data?.beatsPerMeasure === 'number' ? data.beatsPerMeasure : beatsPerMeasure
          )
        );
        return {
          start: derivedStart,
          end: derivedStart + 4,
        };
      }
    }

    return {
      start: 1,
      end: Math.max(2, explicitEnd ?? 5),
    };
  }, [beatsPerMeasure, bpm, bpmChanges]);

  const handleRestore = useCallback((data: any) => {
    if (!data || typeof data !== 'object') {
      console.warn('Invalid chart data provided to restore:', data);
      return;
    }

    // Restore from one local snapshot so a previous chart's state cannot clamp new metadata.
    const restoredNotes = Array.isArray(data.notes) ? validateNotes(data.notes) : [];
    const restoredBpm = typeof data.bpm === 'number' ? data.bpm : bpm;
    const restoredBeatsPerMeasure = typeof data.beatsPerMeasure === 'number'
      ? data.beatsPerMeasure
      : beatsPerMeasure;
    const restoredTimeSignatureOffset = data.timeSignatureOffset !== undefined
      ? data.timeSignatureOffset
      : timeSignatureOffset;
    const restoredTimelineExtraMs = typeof data.timelineExtraMs === 'number'
      ? data.timelineExtraMs
      : 0;
    const restoredBgaInput = Array.isArray(data.bgaVisibilityIntervals)
      ? data.bgaVisibilityIntervals
      : [];
    const restoredLaneInput = Array.isArray(data.lanePositionIntervals)
      ? data.lanePositionIntervals
      : [];
    const restoredSubtitleInput = Array.isArray(data.subtitles) ? data.subtitles : [];
    const restoredTimelineDurationMs = Math.max(
      MIN_TIMELINE_DURATION_MS,
      (restoredNotes.length > 0 ? Math.max(...restoredNotes.map((note) => note.endTime || note.time)) : 0)
        + 5000 + Math.max(0, restoredTimelineExtraMs),
      ...restoredBgaInput.map((interval: any) => Math.max(0, Number(interval?.endTimeMs) || 0)),
      ...restoredLaneInput.map((interval: any) => Math.max(0, Number(interval?.endTimeMs) || 0)),
      ...restoredSubtitleInput.map((cue: any) => Math.max(0, Number(cue?.endTimeMs) || 0))
    );

    if (Array.isArray(data.notes)) {
      // 복원 시 노트 검증 및 정규화 (validateNotes 유틸리티 사용)
      setNotes(restoredNotes);
      // 히스토리 초기화
      resetHistory([...restoredNotes]);
      noteIdRef.current = getMaxNoteId(restoredNotes) + 1;
    }

    setBpm(restoredBpm);
    if (typeof data.youtubeUrl === 'string') setYoutubeUrl(data.youtubeUrl);
    setBeatsPerMeasure(restoredBeatsPerMeasure);
    setTimeSignatureOffset(restoredTimeSignatureOffset);
    setTimelineExtraMs(restoredTimelineExtraMs);
    if (typeof data.audioOffsetMs === 'number') setAudioOffsetMs(data.audioOffsetMs);
    setStartDelayMs(
      typeof data.startDelayMs === 'number'
        ? Math.max(0, Math.round(data.startDelayMs))
        : START_DELAY_MS
    );
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
    if (restoredBgaInput.length > 0) {
      const hydrated = restoredBgaInput.map((interval: any, idx: number) => ({
        id: typeof interval.id === 'string' ? interval.id : `bga-${idx}`,
        startTimeMs: Math.max(0, Number(interval.startTimeMs) || 0),
        endTimeMs: Math.max(0, Number(interval.endTimeMs) || 0),
        mode: interval.mode === 'visible' ? 'visible' : 'hidden',
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
      setBgaVisibilityIntervals(
        sortAndClampBgaIntervals(
          convertBgaEventsToEditableIntervals(hydrated, restoredTimelineDurationMs),
          restoredTimelineDurationMs
        )
      );
    } else {
      setBgaVisibilityIntervals([]);
    }
    if (restoredLaneInput.length > 0) {
      setLanePositionIntervals(normalizeLanePositionIntervals(restoredLaneInput, restoredTimelineDurationMs));
    } else {
      setLanePositionIntervals([]);
    }
    if (typeof data.chartTitle === 'string') setShareTitle(data.chartTitle);
    if (typeof data.chartAuthor === 'string') setShareAuthor(data.chartAuthor);
    if (typeof data.chartDifficulty === 'string') setShareDifficulty(data.chartDifficulty);
    setAdminAssignedDifficulty('');
    if (typeof data.chartDescription === 'string') setShareDescription(data.chartDescription);
    const restoredPreviewRange = derivePreviewMeasureRange(data);
    setSharePreviewStartMeasure(restoredPreviewRange.start);
    setSharePreviewEndMeasure(restoredPreviewRange.end);
    const restoredWip = data.wip && typeof data.wip === 'object' ? data.wip : null;
    setShareIsWip(restoredWip?.enabled === true);
    setShareWipNote(typeof restoredWip?.note === 'string' ? restoredWip.note : '');
    setWipParentChartId(typeof restoredWip?.parentChartId === 'string' ? restoredWip.parentChartId : null);
    if (typeof data.editingChartId === 'string' && data.editingChartId.length > 0) {
      setEditingChartId(data.editingChartId);
    } else if (data.editingChartId === null) {
      setEditingChartId(null);
    }
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

    // 자막은 notes와 같은 복원 단위로 본다.
    // JSON/기존 채보에 자막이 없으면 현재 세션 자막도 비워서 이전 곡 흔적이 남지 않게 한다.
    try {
      const restoredSubtitlePayload = normalizeSubtitlePayload(
        subtitleSessionId,
        Array.isArray(data.subtitles) ? data.subtitles : [],
        Array.isArray(data.subtitleTracks) ? data.subtitleTracks : [],
        undefined
      );
      localSubtitleStorage.savePayload(
        subtitleSessionId,
        restoredSubtitlePayload.subtitles,
        restoredSubtitlePayload.subtitleTracks
      );
      localStorage.setItem(
        `subtitle-editor-${subtitleSessionId}`,
        JSON.stringify({
          chartId: subtitleSessionId,
          tracks: restoredSubtitlePayload.subtitleTracks,
          subtitleTracks: restoredSubtitlePayload.subtitleTracks,
          subtitles: restoredSubtitlePayload.subtitles,
          selectedTrackId: restoredSubtitlePayload.selectedTrackId,
          beatsPerMeasure: restoredBeatsPerMeasure,
          noteValue: 4,
          isPlayheadLocked: false,
          gridOffsetMs: restoredTimeSignatureOffset,
          currentTimeMs: 0,
        })
      );
      setCachedSubtitlePayload(restoredSubtitlePayload);
      window.dispatchEvent(
        new CustomEvent('subtitles-restored', {
          detail: {
            ...restoredSubtitlePayload,
            explicit: true,
          },
        })
      );
    } catch (error) {
      console.error('Failed to restore subtitles:', error);
    }
  }, [subtitleSessionId, derivePreviewMeasureRange]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EDITOR_CONTRIBUTION_DRAFT_KEY);
      if (!raw) return;
      localStorage.removeItem(EDITOR_CONTRIBUTION_DRAFT_KEY);
      localStorage.removeItem(AUTO_SAVE_KEY);
      const parsed = JSON.parse(raw);
      handleRestore(parsed);
      setEditingChartId(null);
      setShareIsWip(true);
      setWipParentChartId(
        typeof parsed?.wip?.parentChartId === 'string' ? parsed.wip.parentChartId : null
      );
      setUploadStatus('WIP 채보를 이어 만들기 작업으로 불러왔습니다.');
    } catch (error) {
      console.error('Failed to restore WIP contribution draft:', error);
    }
  }, [handleRestore]);

  useChartAutosave({
    key: AUTO_SAVE_KEY,
    data: autoSaveData,
    onRestore: handleRestore,
    debounceMs: 2000,
    paused: isPlaying,
  });

  // 초기화 핸들러
  const handleReset = useCallback(() => {
    if (!confirm('모든 채보 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    setNotes([]);
    // 히스토리 초기화
    resetHistory([]);
    setCurrentTime(0);
    setIsPlaying(false);
    setPlaybackSpeed(1);
    setZoom(1);
    setVolume(100);
    setHitSoundVolume(60);
    setBpm(120);
    setBpmChanges([]);
    setBeatsPerMeasure(4);
    setTimeSignatureOffset(0);
    setTimelineExtraMs(0);
    setAudioOffsetMs(0);
    setStartDelayMs(START_DELAY_MS);
    setGridDivision(1);
    setSpeedChanges([]);
    setBgaVisibilityIntervals([]);
    setLanePositionIntervals([]);
    setAudioAnalysis(null);
    setIsBpmInputOpen(false);
    setIsAutoScrollEnabled(true);
    setIsLongNoteMode(false);
    setIsBgaPlacementMode(false);
    setTestStartInput('0');
    setShareTitle('');
    setShareAuthor('');
    setShareDifficulty('Normal');
    setAdminAssignedDifficulty('');
    setShareDescription('');
    setShareIsWip(false);
    setShareWipNote('');
    setWipParentChartId(null);
    setEditingChartId(null);
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
    (
      raw: Partial<BgaVisibilityInterval> & { id: string },
      maxDurationMs: number = timelineDurationMs
    ) => {
      const clampWithDuration = (time: number) => Math.max(0, Math.min(time, maxDurationMs));
      const start = clampWithDuration(Math.max(0, Number(raw.startTimeMs) || 0));
      const requestedEnd = clampWithDuration(Math.max(0, Number(raw.endTimeMs) || start));
      const end = Math.max(start + BGA_INTERVAL_MIN_DURATION_MS, requestedEnd);
      return {
        id: raw.id,
        startTimeMs: start,
        endTimeMs: end,
        mode: 'hidden' as const,
        fadeInMs: Math.max(0, Number(raw.fadeInMs ?? 300) || 0),
        fadeOutMs: Math.max(0, Number(raw.fadeOutMs ?? 300) || 0),
        easing: raw.easing === 'linear' ? 'linear' : undefined,
      } as BgaVisibilityInterval;
    },
    [timelineDurationMs]
  );

  const sortAndClampBgaIntervals = useCallback(
    (intervals: BgaVisibilityInterval[], maxDurationMs: number = timelineDurationMs) => {
      const sorted = [...intervals]
        .map((interval) => normalizeInterval(interval, maxDurationMs))
        .sort((a, b) => a.startTimeMs - b.startTimeMs);

      const clamped: BgaVisibilityInterval[] = [];
      for (let index = 0; index < sorted.length; index += 1) {
        const current = { ...sorted[index] };
        const previous = clamped[index - 1];
        const next = sorted[index + 1];
        const minStart = previous ? previous.endTimeMs : 0;
        const maxEnd = next ? next.startTimeMs : maxDurationMs;

        current.startTimeMs = Math.max(minStart, current.startTimeMs);
        current.endTimeMs = Math.max(
          current.startTimeMs + BGA_INTERVAL_MIN_DURATION_MS,
          Math.min(maxEnd, current.endTimeMs)
        );

        if (next && current.endTimeMs > next.startTimeMs) {
          current.endTimeMs = Math.max(
            current.startTimeMs + BGA_INTERVAL_MIN_DURATION_MS,
            next.startTimeMs
          );
        }

        clamped.push(current);
      }

      return clamped.filter((interval) => interval.endTimeMs > interval.startTimeMs);
    },
    [normalizeInterval, timelineDurationMs]
  );

  const handleAddBgaIntervalAt = useCallback((startTimeMs: number) => {
    const start = clampTime(startTimeMs);
    const defaultDuration = Math.max(600, beatDuration * beatsPerMeasure);
    setBgaVisibilityIntervals((prev) => {
      const sortedPrev = [...prev].sort((a, b) => a.startTimeMs - b.startTimeMs);
      const overlapsExisting = sortedPrev.some(
        (interval) => start >= interval.startTimeMs && start < interval.endTimeMs
      );
      if (overlapsExisting) {
        return prev;
      }

      const nextInterval = sortedPrev.find((interval) => interval.startTimeMs > start);
      const maxEnd = nextInterval?.startTimeMs ?? timelineDurationMs;
      const desiredEnd = Math.min(maxEnd, start + defaultDuration);
      if (maxEnd - start < BGA_INTERVAL_MIN_DURATION_MS) {
        return prev;
      }

      const next: BgaVisibilityInterval = normalizeInterval({
        id: `bga-${Date.now()}`,
        startTimeMs: start,
        endTimeMs: Math.max(start + BGA_INTERVAL_MIN_DURATION_MS, desiredEnd),
        fadeInMs: 300,
        fadeOutMs: 300,
        easing: 'linear',
      });
      return sortAndClampBgaIntervals([...prev, next]);
    });
  }, [beatDuration, beatsPerMeasure, clampTime, normalizeInterval, sortAndClampBgaIntervals, timelineDurationMs]);

  const handleUpdateBgaInterval = useCallback(
    (id: string, patch: Partial<BgaVisibilityInterval>) => {
      setBgaVisibilityIntervals((prev) => {
        const target = prev.find((interval) => interval.id === id);
        if (!target) return prev;

        const others = prev
          .filter((interval) => interval.id !== id)
          .sort((a, b) => a.startTimeMs - b.startTimeMs);
        const insertIndex = others.findIndex((interval) => interval.startTimeMs > target.startTimeMs);
        const previous = insertIndex >= 0 ? others[insertIndex - 1] : others[others.length - 1];
        const next = insertIndex >= 0 ? others[insertIndex] : undefined;

        const desired = normalizeInterval({ ...target, ...patch, id });
        const minStart = previous?.endTimeMs ?? 0;
        const maxEnd = next?.startTimeMs ?? timelineDurationMs;
        const nextStart = next?.startTimeMs ?? timelineDurationMs;

        if (patch.startTimeMs !== undefined && patch.endTimeMs === undefined) {
          desired.startTimeMs = Math.max(minStart, Math.min(desired.startTimeMs, target.endTimeMs - BGA_INTERVAL_MIN_DURATION_MS));
          desired.endTimeMs = target.endTimeMs;
        } else if (patch.endTimeMs !== undefined && patch.startTimeMs === undefined) {
          desired.startTimeMs = target.startTimeMs;
          desired.endTimeMs = Math.min(
            nextStart,
            Math.max(target.startTimeMs + BGA_INTERVAL_MIN_DURATION_MS, desired.endTimeMs)
          );
        } else {
          desired.startTimeMs = Math.max(minStart, desired.startTimeMs);
          desired.endTimeMs = Math.min(
            maxEnd,
            Math.max(desired.startTimeMs + BGA_INTERVAL_MIN_DURATION_MS, desired.endTimeMs)
          );
        }

        return sortAndClampBgaIntervals([...others, desired]);
      });
    },
    [normalizeInterval, sortAndClampBgaIntervals, timelineDurationMs]
  );

  const handleDeleteBgaInterval = useCallback((id: string) => {
    if (!confirm('이 간주 구간을 삭제할까요?')) return;
    setBgaVisibilityIntervals((prev) => prev.filter((interval) => interval.id !== id));
  }, []);

  const handleAddLanePositionIntervalAtCurrent = useCallback((offsetX: number) => {
    const start = clampTime(snapToGrid(currentTime));
    const end = clampTime(start + DEFAULT_LANE_POSITION_DURATION_MS);
    const interval: LanePositionInterval = {
      id: `lane-pos-${Date.now()}`,
      startTimeMs: start,
      endTimeMs: end > start ? end : start + DEFAULT_LANE_POSITION_DURATION_MS,
      offsetX,
    };

    setLanePositionIntervals((prev) =>
      normalizeLanePositionIntervals([...prev, interval], timelineDurationMs)
    );
  }, [clampTime, currentTime, snapToGrid, timelineDurationMs]);

  const handleUpdateLanePositionInterval = useCallback(
    (id: string, patch: Partial<LanePositionInterval>) => {
      setLanePositionIntervals((prev) =>
        normalizeLanePositionIntervals(
          prev.map((interval) => (interval.id === id ? { ...interval, ...patch, id } : interval)),
          timelineDurationMs
        )
      );
    },
    [timelineDurationMs]
  );

  const handleDeleteLanePositionInterval = useCallback((id: string) => {
    setLanePositionIntervals((prev) => prev.filter((interval) => interval.id !== id));
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
    const copiedNotesWithRelativeTime = selectedNotes.map((note) => {
      const relativeTime = note.time - minTime;
      const isTapNote = (note.duration ?? 0) <= 0 || note.type === 'tap';
      
      // 탭 노트는 항상 endTime === time, 롱노트는 endTime도 상대 시간으로 변환
      const relativeEndTime = isTapNote
        ? relativeTime
        : (note.endTime && note.endTime > note.time
            ? note.endTime - minTime
            : relativeTime + (note.duration ?? 0));
      
      return {
        ...note,
        time: relativeTime,
        endTime: relativeEndTime,
        // 탭 노트는 duration을 0으로 강제
        duration: isTapNote ? 0 : (note.duration ?? 0),
        type: isTapNote ? 'tap' as const : (note.type || 'hold'),
      };
    });
    
    setCopiedNotes(copiedNotesWithRelativeTime);
  }, [notes, selectedNoteIds]);

  const handlePasteNotes = useCallback(() => {
    if (copiedNotes.length === 0) {
      return;
    }

    // 현재 재생선 위치를 그리드에 스냅하여 붙여넣기 시작점으로 사용
    const snappedCurrentTime = snapToGrid(currentTime);

    // 스냅된 시간 위치에 노트들을 붙여넣기
    const newNotes = copiedNotes
      .map((note) => {
        const newTime = note.time + snappedCurrentTime;
        const isTapNote = (note.duration ?? 0) <= 0 || note.type === 'tap';
        
        // 탭 노트는 항상 endTime === time, 롱노트는 endTime도 함께 조정
        const newEndTime = isTapNote
          ? newTime
          : (note.endTime && note.endTime > note.time
              ? note.endTime + snappedCurrentTime
              : newTime + (note.duration ?? 0));
        
        // 유효성 검증: endTime이 time보다 작거나 같으면 탭 노트로 변환
        const finalEndTime = newEndTime > newTime ? newEndTime : newTime;
        const finalIsTapNote = isTapNote || finalEndTime <= newTime;
        
        return {
          ...note,
          id: noteIdRef.current++,
          time: newTime,
          endTime: finalEndTime,
          // 탭 노트는 duration을 0으로 강제
          duration: finalIsTapNote ? 0 : (note.duration ?? 0),
          type: finalIsTapNote ? 'tap' as const : (note.type || 'hold'),
          hit: false, // 붙여넣은 노트는 항상 hit: false
        };
      })
      .filter((note) => {
        // 유효하지 않은 노트 필터링
        if (note.time < 0 || isNaN(note.time)) return false;
        if (note.endTime < note.time || isNaN(note.endTime)) return false;
        if (note.duration === 0 && note.endTime !== note.time) return false;
        return true;
      });
    
    if (newNotes.length === 0) {
      return;
    }
    
    setNotes((prev) => {
      const acceptedNotes: Note[] = [];
      for (const note of newNotes) {
        if (
          !hasNotePlacementConflict(prev, note) &&
          !hasNotePlacementConflict(acceptedNotes, note)
        ) {
          acceptedNotes.push(note);
        }
      }

      if (acceptedNotes.length === 0) {
        return prev;
      }

      const newNotesList = [...prev, ...acceptedNotes].sort((a, b) => a.time - b.time);
      saveToHistory(newNotesList);
      return newNotesList;
    });
  }, [copiedNotes, currentTime, saveToHistory, snapToGrid]);

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
      const idsToKeep = new Set(selectedNoteIds);
      const currentDragOffset = dragOffset;
      
      setNotes((prev) => {
        const selectedNotes = prev.filter((note) => idsToKeep.has(note.id));
        if (selectedNotes.length === 0) {
          setDragOffset(null);
          dragStartRef.current = null;
          return prev;
        }

        // 이동량은 선택 그룹 전체에 대해 한 번만 계산한다.
        // 노트마다 개별 스냅/개별 clamp를 하면 큰 선택 구간이 찢어진다.
        const anchorTime = Math.min(...selectedNotes.map((note) => note.time));
        const snappedAnchorTime = snapToGrid(Math.max(0, anchorTime + currentDragOffset.time));
        const snappedTimeDelta = snappedAnchorTime - anchorTime;

        const minLane = Math.min(...selectedNotes.map((note) => note.lane));
        const maxLane = Math.max(...selectedNotes.map((note) => note.lane));
        const minLaneDelta = -minLane;
        const maxLaneDelta = 3 - maxLane;
        const clampedLaneDelta = Math.max(
          minLaneDelta,
          Math.min(maxLaneDelta, currentDragOffset.lane)
        );

        const newNotes = prev.map((note) => {
          if (idsToKeep.has(note.id)) {
            const movedTime = Math.max(0, note.time + snappedTimeDelta);
            const newLane = (note.lane + clampedLaneDelta) as Lane;
            return {
              ...note,
              time: movedTime,
              lane: newLane,
              endTime: note.type === 'hold' ? movedTime + Math.max(0, note.duration || 0) : movedTime,
            };
          }
          return note;
        });

        if (hasAnyNotePlacementConflict(newNotes)) {
          setDragOffset(null);
          dragStartRef.current = null;
          return prev;
        }

        const sortedNotes = [...newNotes].sort((a, b) => a.time - b.time);
        saveToHistory(sortedNotes);
        
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

  // --- 마퀴/선택 핸들러 (성능 최적화: useCallback) ---
  const handleMarqueeStart = useCallback((operation: 'replace' | 'add' | 'toggle') => {
    marqueeOperationRef.current = operation;
    marqueeInitialSelectedIdsRef.current = new Set(selectedNoteIds);
  }, [selectedNoteIds]);

  const handleMarqueeUpdate = useCallback((rectSelectedIds: Set<number>) => {
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
  }, []);

  const handleMarqueeEnd = useCallback(() => {
    // noop: selection 유지
  }, []);

  const handleSelectionStart = useCallback((time: number, lane: Lane | null) => {
    setSelectionStartTime(time);
    setSelectionEndTime(time);
    setSelectedLane(lane);
    isSelectingRef.current = true;
  }, []);

  const handleSelectionUpdate = useCallback((time: number) => {
    setSelectionEndTime(time);
  }, []);

  const handleSelectionEnd = useCallback(() => {
    isSelectingRef.current = false;
  }, []);

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

      if (hasAnyNotePlacementConflict(newNotes)) {
        return prev;
      }

      const sortedNotes = newNotes.sort((a, b) => a.time - b.time);
      saveToHistory(sortedNotes);
      return sortedNotes;
    });
  }, [selectedNoteIds, saveToHistory]);

  // 선택된 노트들 삭제
  const deleteSelectedNotes = useCallback(() => {
    if (selectedNoteIds.size === 0 || isMoveMode) {
      return;
    }

    setNotes((prev) => {
      const newNotes = prev.filter((n) => !selectedNoteIds.has(n.id));
      saveToHistory(newNotes);
      return newNotes;
    });

    // 선택 해제
    setSelectedNoteIds(new Set());
  }, [selectedNoteIds, saveToHistory, isMoveMode]);

  // 마퀴 선택 도입 후: 선택 집합은 드래그 박스(hit-test) 결과(selectedNoteIds)로만 관리합니다.
  // (시간 범위 기반 자동 선택은 마퀴와 충돌하므로 제거)

  // 키보드 단축키 (Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+Y, ESC, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEditingTarget(e.target)) {
        return;
      }

      const hasCommandModifier = e.ctrlKey || e.metaKey;
      const isUndoShortcut =
        hasCommandModifier && !e.altKey && !e.shiftKey && e.code === 'KeyZ';
      const isRedoShortcut =
        hasCommandModifier &&
        !e.altKey &&
        ((e.shiftKey && e.code === 'KeyZ') || (!e.shiftKey && e.code === 'KeyY'));
      const isCopyShortcut = hasCommandModifier && !e.shiftKey && !e.altKey && e.code === 'KeyC';
      const isPasteShortcut = hasCommandModifier && !e.shiftKey && !e.altKey && e.code === 'KeyV';

      if (isUndoShortcut) {
        e.preventDefault();
        e.stopPropagation();
        handleUndo();
        return;
      }

      if (isRedoShortcut) {
        e.preventDefault();
        e.stopPropagation();
        handleRedo();
        return;
      }

      if (isCopyShortcut) {
        if (selectedNoteIds.size > 0) {
          e.preventDefault();
          e.stopPropagation();
          handleCopySelection();
        }
        return;
      }

      if (isPasteShortcut) {
        if (copiedNotes.length > 0) {
          e.preventDefault();
          e.stopPropagation();
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

      // Delete: 선택된 노트 삭제
      if (e.key === 'Delete') {
        if (selectedNoteIds.size > 0) {
          e.preventDefault();
          deleteSelectedNotes();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [selectionStartTime, selectionEndTime, selectedNoteIds, copiedNotes, handleCopySelection, handlePasteNotes, handleClearSelection, handleUndo, handleRedo, deleteSelectedNotes]);


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
      id: noteIdRef.current,
      lane,
      time,
      type,
      duration: type === 'hold' ? duration : 0,
      endTime: type === 'hold' ? time + duration : time,
      y: 0, // 렌더링 시 계산
      hit: false,
    };
    setNotes((prev) => {
      if (hasNotePlacementConflict(prev, newNote)) {
        return prev;
      }
      noteIdRef.current += 1;
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
    resetEditorHitCursor(time);
    seekTo(time, { shouldPause: true }); // shouldPause: true로 전달하여 재생 방지
  }, [clampTime, yToTime, seekTo, resetEditorHitCursor]);

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

  const getTimeAtTimelineClientY = useCallback((clientY: number): number | null => {
    const container = timelineScrollRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const relativeY = clientY - rect.top + container.scrollTop;
    return clampTime(yToTime(relativeY));
  }, [clampTime, yToTime]);

  const setDraggedPlayheadTimeFromClientY = useCallback((clientY: number): number | null => {
    const newTime = getTimeAtTimelineClientY(clientY);
    if (newTime === null) return null;

    internalTimeRef.current = newTime;
    resetEditorHitCursor(newTime);
    setCurrentTime(newTime);
    return newTime;
  }, [getTimeAtTimelineClientY, resetEditorHitCursor]);

  const scheduleDraggedPlayheadTimeUpdate = useCallback(() => {
    if (dragPlayheadRafIdRef.current !== null) return;

    dragPlayheadRafIdRef.current = requestAnimationFrame(() => {
      dragPlayheadRafIdRef.current = null;
      if (!isDraggingPlayheadRef.current) return;
      if (lastPointerClientYRef.current == null) return;
      setDraggedPlayheadTimeFromClientY(lastPointerClientYRef.current);
    });
  }, [setDraggedPlayheadTimeFromClientY]);

  useEffect(() => {
    return () => {
      if (dragPlayheadRafIdRef.current !== null) {
        cancelAnimationFrame(dragPlayheadRafIdRef.current);
        dragPlayheadRafIdRef.current = null;
      }
    };
  }, []);

  // 재생선 드래그 (모니터 주사율에 맞춰 부드럽게)
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 기본 드래그 동작 방지 (텍스트 선택 등)
    e.stopPropagation();
    isDraggingPlayheadRef.current = true;
    lastPointerClientYRef.current = e.clientY;
    setIsPlaying(false); // 드래그 시 일시정지

    // YouTube 시크는 throttle (너무 잦으면 성능 저하)
    let lastSeekTime = 0;
    const SEEK_THROTTLE_MS = 100;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      lastPointerClientYRef.current = moveEvent.clientY;
      const newTime = setDraggedPlayheadTimeFromClientY(moveEvent.clientY);
      if (newTime === null) return;

      // YouTube 시크는 100ms마다 (드래그 중에도 동기화)
      const now = performance.now();
      if (now - lastSeekTime >= SEEK_THROTTLE_MS) {
        seekTo(newTime, { shouldPause: true });
        lastSeekTime = now;
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault();
      upEvent.stopPropagation();

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragPlayheadRafIdRef.current !== null) {
        cancelAnimationFrame(dragPlayheadRafIdRef.current);
        dragPlayheadRafIdRef.current = null;
      }

      // 최종 위치로 이동 (YouTube 동기화 포함)
      const newTime = setDraggedPlayheadTimeFromClientY(upEvent.clientY);
      if (newTime !== null) {
        seekTo(newTime, { shouldPause: true });
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
  }, [seekTo, setDraggedPlayheadTimeFromClientY]);

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
      alert('유효한 BPM을 입력해주세요. (30-500)');
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

    if (!shareTitle) {
      alert('제목을 입력해주세요.');
      return;
    }
    
    setIsUploading(true);
    setUploadStatus('업로드 중...');

    try {
      const playableNotes = validateNotes(notes);
      // 공유 시에는 채보 데이터만 포함 (에디터 상태 제외)
      const subtitlePayload = normalizeSubtitlePayload(
        subtitleSessionId,
        localSubtitleStorage.get(subtitleSessionId),
        localSubtitleStorage.getTracks(subtitleSessionId)
      );
        const chartData = {
          notes: playableNotes,
          bpm,
          youtubeUrl,
          youtubeVideoId,
        beatsPerMeasure,
        timeSignatureOffset,
        timelineExtraMs,
        audioOffsetMs,
        startDelayMs,
        bpmChanges,
        speedChanges,
        bgaVisibilityIntervals,
        lanePositionIntervals,
          subtitles: subtitlePayload.subtitles.length > 0 ? subtitlePayload.subtitles : undefined,
          subtitleTracks: subtitlePayload.subtitleTracks,
          chartTitle: shareTitle,
          chartAuthor: shareAuthor,
          chartDifficulty: shareDifficulty,
          chartDescription: shareDescription,
          editingChartId,
          gridDivision,
          isLongNoteMode,
          previewStartMeasure: sharePreviewStartMeasure,
          previewEndMeasure: sharePreviewEndMeasure,
          wip: shareIsWip
            ? {
                enabled: true,
                note: shareWipNote.trim(),
                parentChartId: wipParentChartId,
              }
            : undefined,
        };

        if (editingChartId && isAdmin) {
          await chartAPI.updateChart(editingChartId, {
            title: shareTitle,
            bpm,
            difficulty: shareDifficulty || undefined,
            adminDifficulty: adminAssignedDifficulty || undefined,
            isWorkInProgress: shareIsWip,
            description: shareDescription || undefined,
            dataJson: JSON.stringify(chartData),
            youtubeUrl: youtubeUrl || undefined,
            previewImage: youtubeThumbnailUrl || undefined,
          });
          setUploadStatus('기존 채보 수정 저장 완료!');
        } else {
          await chartAPI.uploadChart({
            title: shareTitle,
            bpm,
            difficulty: shareDifficulty || undefined,
            adminDifficulty: adminAssignedDifficulty || undefined,
            isWorkInProgress: shareIsWip,
            description: shareDescription || undefined,
            dataJson: JSON.stringify(chartData),
            youtubeUrl: youtubeUrl || undefined,
            previewImage: youtubeThumbnailUrl || undefined,
          });
          setUploadStatus(
            shareIsWip
              ? 'WIP 업로드 완료! 제작 중인 채보 목록에 공개됩니다.'
              : '업로드 완료! 관리자 승인 후 공개됩니다.'
          );
        }

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
  }, [shareTitle, shareAuthor, shareDifficulty, adminAssignedDifficulty, shareDescription, bpm, youtubeUrl, youtubeVideoId, youtubeThumbnailUrl, notes, beatsPerMeasure, timeSignatureOffset, timelineExtraMs, audioOffsetMs, startDelayMs, bpmChanges, speedChanges, bgaVisibilityIntervals, lanePositionIntervals, gridDivision, isLongNoteMode, user, subtitleSessionId, sharePreviewStartMeasure, sharePreviewEndMeasure, shareIsWip, shareWipNote, wipParentChartId, editingChartId, isAdmin]);

  const handleExportJson = useCallback(() => {
    try {
      const playableNotes = validateNotes(notes);
      // 자막 데이터 가져오기
      const subtitlePayload = normalizeSubtitlePayload(
        subtitleSessionId,
        localSubtitleStorage.get(subtitleSessionId),
        localSubtitleStorage.getTracks(subtitleSessionId)
      );
      
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        chart: {
          ...autoSaveData,
          notes: playableNotes,
          subtitles: subtitlePayload.subtitles.length > 0 ? subtitlePayload.subtitles : undefined,
          subtitleTracks: subtitlePayload.subtitleTracks,
          previewStartMeasure: sharePreviewStartMeasure,
          previewEndMeasure: sharePreviewEndMeasure,
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
  }, [autoSaveData, notes, shareTitle, subtitleSessionId, sharePreviewStartMeasure, sharePreviewEndMeasure]);

  const handleImportJsonClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportAnalysisClick = useCallback(() => {
    analysisInputRef.current?.click();
  }, []);

  const handleImportJsonFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const chartData = getChartPayload(JSON.parse(text));
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

  const handleImportAnalysisFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AudioAnalysisData;
      const beats = Array.isArray(parsed.beats)
        ? parsed.beats
            .filter((beat) => Number.isFinite(Number(beat.timeMs)))
            .map((beat) => ({ ...beat, timeMs: Math.max(0, Number(beat.timeMs)) }))
        : [];
      const onsets = Array.isArray(parsed.onsets)
        ? parsed.onsets
            .filter((onset) => Number.isFinite(Number(onset.timeMs)))
            .map((onset) => ({
              ...onset,
              timeMs: Math.max(0, Number(onset.timeMs)),
              strength: Number.isFinite(Number(onset.strength))
                ? Math.max(0, Math.min(1, Number(onset.strength)))
                : undefined,
            }))
        : [];

      if (beats.length === 0 && onsets.length === 0) {
        throw new Error('beats 또는 onsets 데이터가 없습니다.');
      }

      setAudioAnalysis({
        ...parsed,
        beats,
        onsets,
      });
    } catch (error) {
      console.error('오디오 분석 JSON 불러오기 실패:', error);
      alert('오디오 분석 JSON을 불러오지 못했습니다. .userhythm-analysis.json 형식을 확인해 주세요.');
    } finally {
      event.target.value = '';
    }
  }, []);

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

  const handleToggleLongNoteMode = useCallback(() => {
    setIsLongNoteMode((prev) => {
      const newMode = !prev;
      if (!newMode && pendingLongNote) {
        setPendingLongNote(null);
      }
      return newMode;
    });
  }, [pendingLongNote]);

  const handleToggleMoveMode = useCallback(() => {
    setIsMoveMode((prev) => !prev);
  }, []);

  const resolveEditorPreviewChartTimeMs = useCallback(
    () => Math.max(0, Math.floor(isPlaying ? internalTimeRef.current : currentTime)),
    [currentTime, isPlaying]
  );

  const handleRunEditorTest = useCallback(() => {
    if (!onTest) return;

    const validatedNotes = validateNotes(notes);
    const startTimeMs = parseInt(testStartInput, 10) || 0;

    // 에디터 미리듣기 플레이어가 잠깐 더 재생되면 테스트 플레이어와 이중으로 들릴 수 있으므로
    // 테스트 시작 전에 즉시 멈추고 목표 시작 위치에 고정한다.
    setIsPlaying(false);
    seekTo(startTimeMs, { shouldPause: true });

    onTest({
      notes: validatedNotes,
      startTimeMs,
      youtubeVideoId,
      youtubeUrl,
      playbackSpeed: 1,
      audioOffsetMs,
      startDelayMs,
      bgaVisibilityIntervals,
      lanePositionIntervals,
      chartId: subtitleSessionId,
      subtitles: normalizeSubtitlePayload(
        subtitleSessionId,
        localSubtitleStorage.get(subtitleSessionId),
        localSubtitleStorage.getTracks(subtitleSessionId)
      ).subtitles,
      subtitleTracks: localSubtitleStorage.getTracks(subtitleSessionId),
    });
  }, [
    onTest,
    notes,
    testStartInput,
    setIsPlaying,
    seekTo,
    youtubeVideoId,
      youtubeUrl,
      audioOffsetMs,
      startDelayMs,
      bgaVisibilityIntervals,
      lanePositionIntervals,
      subtitleSessionId,
      resolveEditorPreviewChartTimeMs,
    ]);

  const handleSetTestStartToCurrent = useCallback(() => {
    setTestStartInput(resolveEditorPreviewChartTimeMs().toString());
  }, [resolveEditorPreviewChartTimeMs]);

  const handleOpenShareModal = useCallback(() => {
    setIsShareModalOpen(true);
  }, []);

  const loadExistingCharts = useCallback(async () => {
    setIsLoadingExistingCharts(true);
    setExistingChartsError('');
    try {
      const res = await api.getPendingCharts('all');
      setExistingCharts((res.charts || []).filter((chart) => chart.status !== 'rejected'));
    } catch (error) {
      console.error('Failed to load existing charts for editor:', error);
      setExistingChartsError('기존 채보 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoadingExistingCharts(false);
    }
  }, []);

  const handleOpenLoadExistingModal = useCallback(() => {
    setIsLoadExistingModalOpen(true);
    if (!isLoadingExistingCharts && existingCharts.length === 0) {
      void loadExistingCharts();
    }
  }, [existingCharts.length, isLoadingExistingCharts, loadExistingCharts]);

  const filteredExistingCharts = useMemo(() => {
    const query = existingChartSearch.trim().toLowerCase();
    if (!query) return existingCharts;
    return existingCharts.filter((chart) =>
      [chart.title, chart.author, chart.difficulty, chart.admin_difficulty, getDisplayChartDifficulty(chart.difficulty, chart.admin_difficulty), chart.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [existingChartSearch, existingCharts]);

  const handleLoadExistingChart = useCallback((chart: ApiChart) => {
    if (!confirm(`"${chart.title}" 채보를 현재 에디터에 불러옵니다. 현재 작업 내용은 덮어써집니다.`)) {
      return;
    }

    try {
      const parsed = getChartPayload(JSON.parse(chart.data_json || '{}'));
      handleRestore({
        ...parsed,
        editingChartId: chart.id,
        chartTitle: parsed.chartTitle ?? chart.title,
        chartAuthor: parsed.chartAuthor ?? chart.author,
        chartDifficulty: parsed.chartDifficulty ?? chart.difficulty ?? 'Normal',
        chartDescription: parsed.chartDescription ?? chart.description ?? '',
        youtubeUrl: parsed.youtubeUrl ?? chart.youtube_url ?? '',
      });
      setEditingChartId(chart.id);
      setShareTitle(chart.title);
      setShareAuthor(chart.author);
      setShareDifficulty(chart.difficulty || parsed.difficulty || 'Normal');
      setAdminAssignedDifficulty(chart.admin_difficulty || '');
      setShareDescription(chart.description || parsed.description || '');
      setShareIsWip(parsed.wip?.enabled === true);
      setShareWipNote(typeof parsed.wip?.note === 'string' ? parsed.wip.note : '');
      setWipParentChartId(typeof parsed.wip?.parentChartId === 'string' ? parsed.wip.parentChartId : null);
      setUploadStatus('');
      setIsShareModalOpen(false);
      setIsLoadExistingModalOpen(false);
      seekTo(0, { shouldPause: true });
    } catch (error) {
      console.error('Failed to load existing chart into editor:', error);
      alert('채보 데이터를 불러오지 못했습니다.');
    }
  }, [handleRestore, seekTo]);

  const handleClearEditingExisting = useCallback(() => {
    setEditingChartId(null);
    setUploadStatus('');
  }, []);

  const applyTimelineScrollPosition = useCallback((targetScrollTopRaw: number) => {
    const container = timelineScrollRef.current;
    if (!container) return;

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const clampedTarget = Math.min(maxScrollTop, Math.max(0, targetScrollTopRaw));

    // Keep sub-pixel movement at high refresh rates. Integer snapping makes a
    // slowly moving timeline advance in visible one-pixel steps.
    if (Math.abs(container.scrollTop - clampedTarget) >= 0.01) {
      container.scrollTop = clampedTarget;
    }

    if (timelineContentRef.current) {
      // Some browsers quantize scrollTop to device pixels. Compensate only the
      // residual so the grid, notes and playhead share one continuous position.
      const residualY = container.scrollTop - clampedTarget;
      timelineContentRef.current.style.transform = `translateX(-50%) translateY(${residualY}px)`;
    }
  }, []);

  // 자동 스크롤은 재생선과 동일한 runtime time source를 읽어 떨림을 줄인다.
  useEffect(() => {
    if (!isPlaying || !isAutoScrollEnabled || isDraggingPlayheadRef.current) {
      if (timelineContentRef.current) {
        timelineContentRef.current.style.transform = 'translateX(-50%) translateY(0px)';
      }
      return;
    }
    if (!timelineScrollRef.current) return;

    const container = timelineScrollRef.current;
    let frameId: number | null = null;

    const syncScroll = () => {
      if (!timelineScrollRef.current || isDraggingPlayheadRef.current) {
        frameId = requestAnimationFrame(syncScroll);
        return;
      }

      const centerOffset = container.clientHeight / 2;
      const runtimePlayheadY = timeToY(internalTimeRef.current);
      applyTimelineScrollPosition(runtimePlayheadY - centerOffset);

      frameId = requestAnimationFrame(syncScroll);
    };

    frameId = requestAnimationFrame(syncScroll);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      if (timelineContentRef.current) {
        timelineContentRef.current.style.transform = 'translateX(-50%) translateY(0px)';
      }
    };
  }, [isPlaying, isAutoScrollEnabled, timeToY, applyTimelineScrollPosition]);

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
    applyTimelineScrollPosition(timeToY(isPlaying ? internalTimeRef.current : currentTime) - centerOffset);

    lastZoomRef.current = zoom;
  }, [zoom, isAutoScrollEnabled, playheadY, timeToY, isPlaying, currentTime, applyTimelineScrollPosition]);

  // 재생선 드래그 중 스크롤(마우스 휠 등) 시, 재생선을 마우스 위치에 맞춰 부드럽게 따라가게 함
  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!isDraggingPlayheadRef.current) return;
      if (lastPointerClientYRef.current == null) return;
      scheduleDraggedPlayheadTimeUpdate();
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (dragPlayheadRafIdRef.current !== null) {
        cancelAnimationFrame(dragPlayheadRafIdRef.current);
        dragPlayheadRafIdRef.current = null;
      }
    };
  }, [scheduleDraggedPlayheadTimeUpdate]);

  // 키보드 핸들러 (에디터 전용 전역 단축키)
  const handleToggleEditorPlayback = useCallback(async () => {
    const nextPlaying = !isPlayingRef.current;
    const commandTimeMs = Math.max(0, internalTimeRef.current);
    isPlayingRef.current = nextPlaying;

    if (!nextPlaying) {
      setCurrentTime(commandTimeMs);
      if (!applyImmediatePlaybackState(false, commandTimeMs)) {
        seekTo(commandTimeMs, { shouldPause: true });
      }
      setIsPlaying(false);
      return;
    }

    try {
      await ensureAudioContext();
    } catch {
      // ignore: fallback to play without pre-warm
    }

    if (!isPlayingRef.current) {
      return;
    }

    if (!applyImmediatePlaybackState(true, commandTimeMs)) {
      seekTo(commandTimeMs, { snapOnly: true });
    }

    setIsPlaying(true);
  }, [applyImmediatePlaybackState, ensureAudioContext, seekTo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 인터랙티브 요소가 포커스를 가진 동안에는 에디터 전역 단축키를 먹지 않는다.
      if (isInteractiveElementFocused(e.target)) {
        return;
      }

      if (
        e.key.toLowerCase() === 'c' &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        void handleToggleEditorPlayback();
        return;
      }
      
      // Space: 롱노트 모드 토글
      if (e.key === ' ' || e.key === 'Space') {
        e.preventDefault();
        handleToggleLongNoteMode();
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
  }, [handleLaneInput, handleToggleEditorPlayback, handleToggleLongNoteMode]);

  return (
    <div
      className="chart-editor-root"
      onFocusCapture={handleNumericInputFocus}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        minHeight: 0,
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
        onTogglePlayback={handleToggleEditorPlayback}
        onStop={() => {
          setIsPlaying(false);
          seekTo(0, { shouldPause: true });
        }}
        onToggleAutoScroll={() => setIsAutoScrollEnabled(prev => !prev)}
        onReset={handleReset}
        onSubtitleClick={
          onOpenSubtitleEditor
            ? () => {
                const subtitlePayload = normalizeSubtitlePayload(
                  subtitleSessionId,
                  localSubtitleStorage.get(subtitleSessionId),
                  localSubtitleStorage.getTracks(subtitleSessionId)
                );
                onOpenSubtitleEditor({
                  chartId: subtitleSessionId,
                  notes,
                  bpm,
                  youtubeVideoId,
                  youtubeUrl,
                  title: shareTitle || 'Untitled',
                  subtitles: subtitlePayload.subtitles,
                  subtitleTracks: subtitlePayload.subtitleTracks,
                });
              }
            : undefined
        }
        onExit={onCancel}
        onYoutubePasteButton={handleYoutubePasteButton}
        onToggleBpmInput={() => setIsBpmInputOpen(prev => !prev)}
        onBpmInput={(val) => {
          const nextBpm = Number(val);
          if (!Number.isFinite(nextBpm) || !isValidBPM(nextBpm)) return;
          setBpm(nextBpm);
          setIsBpmInputOpen(false);
        }}
        onTapBpm={handleTapBpm}
        onAddBpmChange={handleAddBpmChange}
        onAddBpmChangeAtCurrent={handleAddBpmChangeAtCurrentPosition}
        onEditBpmChange={handleEditBpmChange}
        onDeleteBpmChange={handleDeleteBpmChange}
        onExportJson={handleExportJson}
        onImportJson={handleImportJsonClick}
        onImportAnalysis={handleImportAnalysisClick}
      />

      <div
        className="chart-editor-workbench"
        onPointerDownCapture={preventTransientEditorActionFocus}
        onPointerUpCapture={blurEditorNonTextControlAfterPointer}
        onMouseDownCapture={preventTransientEditorActionFocus}
        onClickCapture={blurEditorTransientAction}
        onChangeCapture={blurEditorSelectAfterChange}
        style={{
          flex: 1,
          minHeight: 0,
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
          metronomeEnabled={metronomeSettings.enabled}
          onMetronomeEnabledChange={(enabled) =>
            setMetronomeSettings((previous) => ({ ...previous, enabled }))
          }
          metronomeVolume={metronomeSettings.volume}
          onMetronomeVolumeChange={(nextVolume) =>
            setMetronomeSettings((previous) => ({
              ...previous,
              volume: Math.max(0, Math.min(100, Math.round(nextVolume))),
            }))
          }
          beatsPerMeasure={beatsPerMeasure}
          onTimeSignatureChange={setBeatsPerMeasure}
          gridDivision={gridDivision}
          onGridDivisionChange={setGridDivision}
          timeSignatureOffset={timeSignatureOffset}
          timelineExtraMs={timelineExtraMs}
          audioOffsetMs={audioOffsetMs}
          startDelayMs={startDelayMs}
          onTimeSignatureOffsetChange={setTimeSignatureOffset}
          onTimelineExtraChange={(updater) => setTimelineExtraMs((prev) => updater(prev))}
          onAudioOffsetChange={(updater) => setAudioOffsetMs((prev) => updater(prev))}
          onStartDelayChange={(updater) => setStartDelayMs((prev) => Math.max(0, updater(prev)))}
          beatDuration={beatDuration}
        />

        {/* Main Timeline Canvas */}
        <div
          className="chart-editor-timeline-shell"
          style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', backgroundColor: '#1f1f1f', overflow: 'hidden' }}
        >
            <ChartEditorTimeline
                notes={notes}
                beatsPerMeasure={beatsPerMeasure}
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
                currentTimeRef={internalTimeRef}
                isPlaying={isPlaying}
              bpm={bpm}
              bpmChanges={sortedBpmChanges}
                bgaVisibilityIntervals={bgaVisibilityIntervals}
                lanePositionIntervals={lanePositionIntervals}
                audioAnalysis={audioAnalysis}
                isBgaPlacementMode={isBgaPlacementMode}
                 isSelectionMode={isSelectionMode}
                 selectedLane={selectedLane}
                 isMoveMode={isMoveMode}
                 selectedNoteIds={selectedNoteIds}
                 dragOffset={dragOffset}
                 selectionStartTime={selectionStartTime}
                 selectionEndTime={selectionEndTime}
                 onMarqueeStart={handleMarqueeStart}
                 onMarqueeUpdate={handleMarqueeUpdate}
                 onMarqueeEnd={handleMarqueeEnd}
                 onSelectionStart={handleSelectionStart}
                 onSelectionUpdate={handleSelectionUpdate}
                 onSelectionEnd={handleSelectionEnd}
                 onMoveStart={handleMoveStart}
                 onMoveUpdate={handleMoveUpdate}
                 onMoveEnd={handleMoveEnd}
                 yToTime={yToTime}
                 pendingLongNote={pendingLongNote}
                 onAddBgaIntervalAt={handleAddBgaIntervalAt}
                 onUpdateBgaInterval={handleUpdateBgaInterval}
                 onDeleteBgaInterval={handleDeleteBgaInterval}
                 onUpdateLanePositionInterval={handleUpdateLanePositionInterval}
            />

            <EditorTimelineActionRails
              isLongNoteMode={isLongNoteMode}
              isMoveMode={isMoveMode}
              isBgaPlacementMode={isBgaPlacementMode}
              selectedNoteCount={selectedNoteIds.size}
              onToggleLongNoteMode={handleToggleLongNoteMode}
              onToggleMoveMode={handleToggleMoveMode}
              onToggleBgaPlacementMode={() => setIsBgaPlacementMode((prev) => !prev)}
              onMirrorNotes={handleMirrorNotes}
            />
            
            {/* Hidden Youtube Player */}
            <div
                ref={youtubePlayerRef}
                style={{
                    position: 'fixed',
                    left: '-10000px',
                    top: '-10000px',
                    width: '160px',
                    height: '90px',
                    overflow: 'hidden',
                    opacity: 0,
                    visibility: 'hidden',
                    pointerEvents: 'none', 
                    zIndex: -1 
                }}
            />
        </div>

        {/* Right Sidebar */}
        <ChartEditorSidebarRight
          speedChanges={speedChanges}
          onAddSpeedChange={handleAddSpeedChangeAtCurrent}
          onUpdateSpeedChange={handleUpdateSpeedChange}
          onDeleteSpeedChange={handleDeleteSpeedChange}
          bgaVisibilityIntervals={bgaVisibilityIntervals}
          isBgaPlacementMode={isBgaPlacementMode}
          onToggleBgaPlacementMode={() => setIsBgaPlacementMode((prev) => !prev)}
          onAddBgaIntervalAtCurrent={() => handleAddBgaIntervalAt(currentTime)}
          onUpdateBgaInterval={handleUpdateBgaInterval}
          onDeleteBgaInterval={handleDeleteBgaInterval}
          lanePositionIntervals={lanePositionIntervals}
          onAddLanePositionIntervalAtCurrent={handleAddLanePositionIntervalAtCurrent}
          onUpdateLanePositionInterval={handleUpdateLanePositionInterval}
          onDeleteLanePositionInterval={handleDeleteLanePositionInterval}
          testStartInput={testStartInput}
          onTestStartInputChange={setTestStartInput}
          currentTime={currentTime}
          onSetTestStartToCurrent={handleSetTestStartToCurrent}
          onTest={handleRunEditorTest}
          onShareClick={handleOpenShareModal}
          isAdmin={isAdmin}
          onLoadExistingClick={handleOpenLoadExistingModal}
          isEditingExisting={!!editingChartId && isAdmin}
          editingChartTitle={shareTitle}
          onClearEditingExisting={handleClearEditingExisting}
          bpm={bpm}
          bpmChanges={sortedBpmChanges}
          beatsPerMeasure={beatsPerMeasure}
        />
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
        isWip={shareIsWip}
        onIsWipChange={setShareIsWip}
        wipNote={shareWipNote}
        onWipNoteChange={setShareWipNote}
        thumbnailUrl={youtubeThumbnailUrl}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
        onUpload={handleShare}
        user={user}
        onLogin={handleLoginWithGoogle}
        isEditingExisting={!!editingChartId && isAdmin}
        previewStartMeasure={sharePreviewStartMeasure}
        previewEndMeasure={sharePreviewEndMeasure}
        onPreviewStartMeasureChange={setSharePreviewStartMeasure}
        onPreviewEndMeasureChange={setSharePreviewEndMeasure}
        beatsPerMeasure={beatsPerMeasure}
      />
      <ChartEditorLoadExistingModal
        isOpen={isLoadExistingModalOpen}
        isLoading={isLoadingExistingCharts}
        error={existingChartsError}
        charts={filteredExistingCharts}
        search={existingChartSearch}
        onSearchChange={setExistingChartSearch}
        onReload={loadExistingCharts}
        onLoadChart={handleLoadExistingChart}
        onClose={() => setIsLoadExistingModalOpen(false)}
      />
      <input
        type="file"
        accept="application/json,.json"
        ref={importInputRef}
        style={{ display: 'none' }}
        onChange={handleImportJsonFile}
      />
      <input
        type="file"
        accept="application/json,.json,.userhythm-analysis.json"
        ref={analysisInputRef}
        style={{ display: 'none' }}
        onChange={handleImportAnalysisFile}
      />
    </div>
  );
};
