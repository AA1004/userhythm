import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Note, Lane } from '../types/game';
import { extractYouTubeVideoId, waitForYouTubeAPI } from '../utils/youtube';
import { TapBPMCalculator, bpmToBeatDuration, isValidBPM } from '../utils/bpmAnalyzer';
import { chartAPI, isSupabaseConfigured, supabase } from '../lib/supabaseClient';

interface ChartEditorProps {
  onSave: (notes: Note[]) => void;
  onCancel: () => void;
  onTest?: (payload: ChartTestPayload) => void;
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
  beatIndex: number; // ê³??„ì²´ ê¸°ì? ë¹„íŠ¸ ?¸ë±??
  beatsPerMeasure: number; // ?? 4(4/4), 3(3/4)
}

const LANE_POSITIONS = [100, 200, 300, 400];
const LANE_KEY_LABELS = ['D', 'F', 'J', 'K'];
const TAP_NOTE_HEIGHT = 60;
const JUDGE_LINE_Y = 640;
const PIXELS_PER_SECOND = 200; // ?€?„ë¼???•ë? ë¹„ìœ¨
const TIMELINE_TOP_PADDING = 600;
const TIMELINE_BOTTOM_PADDING = JUDGE_LINE_Y;
const MIN_TIMELINE_DURATION_MS = 120000;
const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MIN_PLAYBACK_SPEED = 0.5;
const MAX_PLAYBACK_SPEED = 2;
const AUTO_SAVE_KEY = 'chartEditorLastChart';

export const ChartEditor: React.FC<ChartEditorProps> = ({ onSave, onCancel, onTest }) => {
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
  
  // YouTube ê´€???íƒœ
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubePlayer, setYoutubePlayer] = useState<any>(null);
  const youtubePlayerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerReadyRef = useRef(false);
  
  // BPM ê´€???íƒœ
  const [bpm, setBpm] = useState<number>(120);
  const [isBpmInputOpen, setIsBpmInputOpen] = useState<boolean>(false);
  const tapBpmCalculatorRef = useRef(new TapBPMCalculator());
  const [tapBpmResult, setTapBpmResult] = useState<{ bpm: number; confidence: number } | null>(null);

  // ë©”ë‰´ ?´ë¦¼/?«í˜ ?íƒœ
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [gridDivision, setGridDivision] = useState<number>(1); // 1=ê¸°ë³¸, 2=2ë¶„í• , 3=?‹ì‡????
  const [timeSignatures, setTimeSignatures] = useState<TimeSignatureEvent[]>([
    { id: 0, beatIndex: 0, beatsPerMeasure: 4 },
  ]);
  // ë§ˆë”” ?¤í”„??(ë°•ì ?¨ìœ„): ??²Œ ?œì‘?˜ëŠ” ê³¡ì„ ?„í•´ ë§ˆë”” ?œì‘? ì„ ???¤ë¡œ ?´ë™
  const [timeSignatureOffset, setTimeSignatureOffset] = useState<number>(0);
  // true???? ?¬ìƒ? ì— ë§ì¶° ?ë™ ?¤í¬ë¡?+ ?¬ìš©?ê? ?¤í¬ë¡¤ë¡œ ?„ì¹˜ë¥?ë°”ê¾¸ì§€ ëª»í•˜?„ë¡ ê³ ì •
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(true);
  const [isLongNoteMode, setIsLongNoteMode] = useState<boolean>(false);
  const [pendingLongNote, setPendingLongNote] = useState<{ lane: Lane; startTime: number } | null>(null);
  const [testStartInput, setTestStartInput] = useState<string>('0');
  const [volume, setVolume] = useState<number>(100); // 0~100 ?¸ì§‘ê¸??ŒëŸ‰
  
  // ê³µìœ  ê´€???íƒœ
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
  
  // ì´ˆê¸° ë¡œë“œ ?„ë£Œ ?Œë˜ê·?(ë³µì›???„ë£Œ?˜ê¸° ?„ì—???ë™ ?€?¥ì„ ?¤í‚µ)
  const hasRestoredRef = useRef(false);
  
  // ë§ˆì?ë§??‘ì—… ì±„ë³´ ?ë™ ë³µì›
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

      // ?¸íŠ¸ ?°ì´??ë¡œë“œ (handleLoad?€ ê±°ì˜ ?™ì¼)
      if (chartData.notes && Array.isArray(chartData.notes)) {
        noteIdRef.current = 0;

        const loadedNotes: Note[] = chartData.notes
          .map((noteData: any) => {
            if (typeof noteData.lane !== 'number' || typeof noteData.time !== 'number') {
              console.warn('? íš¨?˜ì? ?Šì? ?ë™ ë³µì› ?¸íŠ¸ ?°ì´??', noteData);
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

      // ?¬ìƒ ?íƒœ ì´ˆê¸°??
      setIsPlaying(false);
      setCurrentTime(0);

      // BPM, ë°•ì, ?¤í”„??ë³µì›
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

      // YouTube ?•ë³´ ë³µì›
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

      // ?ŒëŸ‰ ë³µì›
      if (typeof chartData.volume === 'number') {
        setVolume(Math.max(0, Math.min(100, chartData.volume)));
      } else {
        setVolume(100);
      }
      
      // ë³µì› ?„ë£Œ ?œì‹œ
      hasRestoredRef.current = true;
      console.log('???ë™ ì±„ë³´ ë³µì› ?„ë£Œ');
    } catch (error) {
      console.warn('?ë™ ì±„ë³´ ë³µì› ?¤íŒ¨:', error);
      hasRestoredRef.current = true;
    }
  }, []);

  // ?¸ì§‘ ì¤?ì±„ë³´ ?ë™ ?€??
  useEffect(() => {
    // ë³µì›???„ë£Œ?˜ê¸° ?„ì—???ë™ ?€?¥ì„ ?¤í‚µ (ë³µì› ì¤?ë¹??íƒœê°€ ?€?¥ë˜??ê²ƒì„ ë°©ì?)
    if (!hasRestoredRef.current) return;
    
    try {
      // ?„ì „??ë¹??íƒœë©??ë™ ?€???œê±°
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
      console.warn('?ë™ ?€???¤íŒ¨:', e);
    }
  }, [notes, bpm, timeSignatures, timeSignatureOffset, youtubeVideoId, youtubeUrl, volume]);
  
  // ?¬ìš©???¸ì¦ ?íƒœ ?•ì¸
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    
    // ?„ì¬ ?¸ì…˜ ?•ì¸
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    
    // ?¸ì¦ ?íƒœ ë³€ê²?ê°ì?
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  // Google ë¡œê·¸???¨ìˆ˜
  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      alert('Supabase ?˜ê²½ ë³€?˜ê? ?¤ì •?˜ì? ?Šì•„ ë¡œê·¸??ê¸°ëŠ¥???¬ìš©?????†ìŠµ?ˆë‹¤.');
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
      console.error('ë¡œê·¸???¤ë¥˜:', error);
      alert('ë¡œê·¸?¸ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤: ' + (error.message || '?????†ëŠ” ?¤ë¥˜'));
    }
  }, []);
  
  const maxNoteTime = useMemo(() => {
    if (!notes.length) return 0;
    return Math.max(
      ...notes.map((note) => Math.max(note.time, note.endTime ?? note.time))
    );
  }, [notes]);

  // BPM ê¸°ë°˜ ê¸°ë³¸ ë¹„íŠ¸ ê¸¸ì´(ms)
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
        // ?™ì¼ ?„ì¹˜ ?´ë²¤?¸ê? ?ˆìœ¼ë©??…ë°?´íŠ¸
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

  // ì´ˆê¸° ?¤í¬ë¡??„ì¹˜ ?¤ì •: ?¬ìƒ? ì„ ?”ë©´ ì¤‘ì•™??ë§ì¶¤
  useEffect(() => {
    if (hasScrolledToBottomRef.current) return;
    const container = timelineScrollRef.current;
    // originYê°€ ì¤€ë¹„ë˜?ˆëŠ”ì§€ ?•ì¸ (ì´ˆê¸° currentTime = 0?????¬ìƒ???„ì¹˜)
    if (!container || !originY || originY === 0) return;
    hasScrolledToBottomRef.current = true;
    
    // ?¬ìƒ? ì´ ?€?„ë¼??ë·°ì˜ ?¸ë¡œ ì¤‘ì•™???¤ë„ë¡??¤í¬ë¡??„ì¹˜ ê³„ì‚°
    requestAnimationFrame(() => {
      const centerOffset = container.clientHeight / 2;
      const rawTarget = originY - centerOffset;
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const targetScrollTop = Math.max(0, Math.min(maxScrollTop, rawTarget));
      container.scrollTop = targetScrollTop;
    });
  }, [originY]);

  // ë¡±ë…¸??ëª¨ë“œ ?´ì œ ??ì§„í–‰ ì¤‘ì´???œì‘ ì§€??ì´ˆê¸°??
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

  // ê¸°ì¡´ ?°ì´?°ì— duration/endTime/type ?„ë“œê°€ ?†ì„ ??ë³´ì •
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

  // ?œê°„??ê°€??ê°€ê¹Œìš´ ê·¸ë¦¬???„ì¹˜ë¡??¤ëƒ…
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

  // ?¸íŠ¸ ì¶”ê?
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
        // ê°™ì? ?„ì¹˜???¸íŠ¸ê°€ ?ˆëŠ”ì§€ ?•ì¸ (ì¤‘ë³µ ë°©ì?)
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

  // ?¸íŠ¸ ?? œ
  const deleteNote = useCallback((noteId: number) => {
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
  }, []);

  // ?ˆì¸ ?´ë¦­ ?¸ë“¤??(?¤ë³´???´ë²¤?¸ì—?œë„ ?¬ìš©)
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

  // YouTube ?Œë ˆ?´ì–´ ë³¼ë¥¨ ?™ê¸°??
  useEffect(() => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.setVolume?.(volume);
      } catch (error) {
        console.warn('ë³¼ë¥¨ ?¤ì • ?¤íŒ¨:', error);
      }
    }
  }, [volume, youtubePlayer]);

  // ?¤ë³´???´ë²¤???¸ë“¤??
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // ?…ë ¥ ?„ë“œ???¬ì»¤?¤ê? ?ˆìœ¼ë©?ë¬´ì‹œ
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // D, F, J, K ?¤ë¡œ ê°??ˆì¸???¸íŠ¸ ì¶”ê?
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
          console.error('YouTube ?Œë ˆ?´ì–´ ?„ì¹˜ ?´ë™ ?¤íŒ¨:', error);
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
        console.error('YouTube ?Œë ˆ?´ì–´ ?¼ì‹œ?•ì? ?¤íŒ¨:', error);
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
          console.error('YouTube ?Œë ˆ?´ì–´ ?¬ìƒ ?¤íŒ¨:', error);
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

  // ?€?„ë¼???´ë¦­ ?¸ë“¤??
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
          // applySeekê°€ ?´ë? ?¸ì¶œ?˜ì–´ currentTime???…ë°?´íŠ¸??
        }
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        upEvent.preventDefault();
        const resumeTime = lastDraggedPlayheadTimeRef.current ?? currentTime;
        
        // cleanup ë¨¼ì? ?¤í–‰ (?œë˜ê·??íƒœ ?´ì œ???˜ì¤‘??
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        playheadDragCleanupRef.current = null;
        
        // YouTube ?Œë ˆ?´ì–´ë¥?seek?˜ê³  currentTime ?…ë°?´íŠ¸
        if (resumeTime !== null) {
          applySeek(resumeTime);
          
          // ?½ê°„??ì§€???„ì— ?œë˜ê·??Œë˜ê·¸ë? ?´ì œ?˜ì—¬ YouTube ?™ê¸°?”ê? ?¤ì‹œ ?œì‘?˜ë„ë¡???
          // ?´ë ‡ê²??˜ë©´ YouTube ?Œë ˆ?´ì–´ seekê°€ ë¨¼ì? ?„ë£Œ?©ë‹ˆ??
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

  // YouTube ?Œë ˆ?´ì–´ ì´ˆê¸°??
  useEffect(() => {
    if (!youtubeVideoId || !youtubePlayerRef.current) return;

    let playerInstance: any = null;
    let isCancelled = false;

    // ê¸°ì¡´ ?Œë ˆ?´ì–´ ?•ë¦¬ (?ˆì „??ë²„ì „)
    const cleanup = (player: any) => {
      if (player) {
        try {
          console.log('?§¹ ?Œë ˆ?´ì–´ ?•ë¦¬ ì¤?..');
          // ?Œë ˆ?´ì–´ê°€ ? íš¨?œì? ?•ì¸
          if (typeof player.destroy === 'function') {
            player.destroy();
          }
        } catch (e) {
          console.warn('?Œë ˆ?´ì–´ ?œê±° ?¤íŒ¨ (ë¬´ì‹œ):', e);
        }
      }
      setYoutubePlayer(null);
      youtubePlayerReadyRef.current = false;
    };

    // ?„ì¬ ?Œë ˆ?´ì–´ ?•ë¦¬
    setYoutubePlayer((currentPlayer: any) => {
      if (currentPlayer) {
        cleanup(currentPlayer);
      }
      return null;
    });
    youtubePlayerReadyRef.current = false;

    waitForYouTubeAPI().then(() => {
      // cleanup???¤í–‰?˜ì—ˆ?”ì? ?•ì¸
      if (isCancelled) return;
      
      if (!window.YT || !window.YT.Player) {
        console.error('YouTube IFrame APIë¥?ë¡œë“œ?????†ìŠµ?ˆë‹¤.');
        return;
      }

      const playerElement = youtubePlayerRef.current;
      if (!playerElement || isCancelled) return;
      
      // div ?”ì†Œ??id ì¶”ê? (YouTube APIê°€ ?„ìš”ë¡???
      const playerId = `youtube-player-${youtubeVideoId}`;
      
      // ê¸°ì¡´ ?”ì†Œê°€ ?ˆìœ¼ë©??ˆì „?˜ê²Œ ?œê±°
      const existingPlayer = document.getElementById(playerId);
      if (existingPlayer && existingPlayer !== playerElement) {
        try {
          // ë¶€ëª??¸ë“œê°€ ?ˆëŠ”ì§€ ?•ì¸
          if (existingPlayer.parentNode) {
            existingPlayer.parentNode.removeChild(existingPlayer);
          }
        } catch (e) {
          console.warn('ê¸°ì¡´ ?Œë ˆ?´ì–´ ?”ì†Œ ?œê±° ?¤íŒ¨ (ë¬´ì‹œ):', e);
        }
      }
      
      // ?Œë ˆ?´ì–´ ?”ì†Œ ì´ˆê¸°??
      if (playerElement.id !== playerId) {
        playerElement.id = playerId;
      }
      
      // ê¸°ì¡´ iframe???ˆìœ¼ë©??œê±°
      const existingIframe = playerElement.querySelector('iframe');
      if (existingIframe) {
        try {
          if (existingIframe.parentNode) {
            existingIframe.parentNode.removeChild(existingIframe);
          }
        } catch (e) {
          console.warn('ê¸°ì¡´ iframe ?œê±° ?¤íŒ¨ (ë¬´ì‹œ):', e);
        }
      }
      
      if (isCancelled) return;
      
      console.log(`?¬ ???Œë ˆ?´ì–´ ì´ˆê¸°???œì‘: ${youtubeVideoId}`);
      
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
              
              console.log('??YouTube ?Œë ˆ?´ì–´ ì¤€ë¹??œì‘:', youtubeVideoId);
              
              // ?Œë ˆ?´ì–´ê°€ ??ë¹„ë””??ID?€ ?¼ì¹˜?˜ëŠ”ì§€ ?•ì¸
              const player = event.target;
              try {
                const currentVideoId = player.getVideoData?.()?.video_id;
                
                if (currentVideoId !== youtubeVideoId) {
                  console.warn('? ï¸ ?Œë ˆ?´ì–´ ë¹„ë””??ID ë¶ˆì¼ì¹?', currentVideoId, 'vs', youtubeVideoId);
                  return; // ?¤ë¥¸ ë¹„ë””?¤ì˜ ?Œë ˆ?´ì–´?´ë©´ ë¬´ì‹œ
                }
              } catch (e) {
                console.warn('ë¹„ë””??ID ?•ì¸ ?¤íŒ¨:', e);
              }
              
              if (isCancelled) return;
              
              youtubePlayerReadyRef.current = true;
              setYoutubePlayer(player);
              playerInstance = player;
              console.log('??YouTube ?Œë ˆ?´ì–´ ì¤€ë¹??„ë£Œ');
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
        console.error('?Œë ˆ?´ì–´ ?ì„± ?¤íŒ¨:', e);
      }
    });

    // cleanup ?¨ìˆ˜ ë°˜í™˜ (ì»´í¬?ŒíŠ¸ ?¸ë§ˆ?´íŠ¸ ?ëŠ” youtubeVideoId ë³€ê²???
    return () => {
      console.log('?§¹ useEffect cleanup: ?Œë ˆ?´ì–´ ?•ë¦¬');
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
        console.warn('?¬ìƒ ?ë„ ?¤ì • ?¤íŒ¨:', error);
      }
    }
  }, [playbackSpeed, youtubePlayer]);

  // YouTube ?Œë ˆ?´ì–´ ë³¼ë¥¨ ?¤ì •
  useEffect(() => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.setVolume?.(volume);
      } catch (error) {
        console.warn('ë³¼ë¥¨ ?¤ì • ?¤íŒ¨:', error);
      }
    }
  }, [volume, youtubePlayer]);

  // YouTube ?¬ìƒ ?œê°„ ?™ê¸°??(ì¢€ ??ë¶€?œëŸ½ê²??…ë°?´íŠ¸)
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;
    // ?¬ìƒ ì¤‘ì´ ?„ë‹ ?ŒëŠ” ?™ê¸°?”í•˜ì§€ ?ŠìŒ
    if (!isPlaying) return;

    const syncInterval = setInterval(() => {
      // ?œë˜ê·?ì¤‘ì¼ ?ŒëŠ” YouTube ?™ê¸°?”ë? ê±´ë„ˆ?€
      if (isDraggingPlayheadRef.current) return;
      
      try {
        const currentTime = youtubePlayer.getCurrentTime() * 1000;
        setCurrentTime(currentTime);
      } catch (e) {
        console.error('YouTube ?Œë ˆ?´ì–´ ?œê°„ ?™ê¸°???¤íŒ¨:', e);
      }
    }, 33); // ??30fps

    return () => clearInterval(syncInterval);
  }, [youtubePlayer, isPlaying]);

  // ?¬ìƒ???ë™ ?¤í¬ë¡? ?¬ìƒ ì¤??¬ìƒ? ì„ ?”ë©´ ì¤‘ì•™??ê³ ì •
  useEffect(() => {
    if (!isPlaying || !isAutoScrollEnabled || isDraggingPlayheadRef.current) return;

    const container = timelineScrollRef.current;
    if (!container || !playheadY || playheadY === 0) return;

    // ?¬ìƒ? ì„ ?”ë©´ ì¤‘ì•™??ë§ì¶”ê¸?
    const centerOffset = container.clientHeight / 2;
    const targetScrollTop = playheadY - centerOffset;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));

    // requestAnimationFrame?¼ë¡œ ë¶€?œëŸ½ê²??…ë°?´íŠ¸
    requestAnimationFrame(() => {
      if (!isDraggingPlayheadRef.current && container) {
        container.scrollTop = clampedScrollTop;
      }
    });
  }, [isPlaying, isAutoScrollEnabled, playheadY, currentTime]);

  // YouTube URL ì²˜ë¦¬
  const handleYouTubeUrlSubmit = useCallback(() => {
    if (!youtubeUrl.trim()) {
      alert('YouTube URL???…ë ¥?´ì£¼?¸ìš”.');
      return;
    }

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      alert('? íš¨??YouTube URL???„ë‹™?ˆë‹¤.');
      return;
    }

    console.log('?“º YouTube URL ë¡œë“œ ?”ì²­:', videoId);

    // ê¸°ì¡´ ?Œë ˆ?´ì–´ ?œê±°
    if (youtubePlayer) {
      try {
        console.log('?§¹ ê¸°ì¡´ ?Œë ˆ?´ì–´ ?œê±° ì¤?..');
        youtubePlayer.destroy();
      } catch (e) {
        console.warn('ê¸°ì¡´ ?Œë ˆ?´ì–´ ?œê±° ?¤íŒ¨ (ë¬´ì‹œ):', e);
      }
    }

    // ?íƒœ ì´ˆê¸°??
    setYoutubePlayer(null);
    youtubePlayerReadyRef.current = false;
    
    // ê°™ì? ë¹„ë””?¤ë? ?¤ì‹œ ë¡œë“œ?˜ëŠ” ê²½ìš°ë¥??„í•´, ë¨¼ì? nullë¡??¤ì •???¤ìŒ videoId ?¤ì •
    // ?´ë ‡ê²??˜ë©´ useEffectê°€ ??ƒ ?¸ë¦¬ê±°ë¨
    if (youtubeVideoId === videoId) {
      console.log('?”„ ê°™ì? ë¹„ë””???¬ë¡œ?? ê°•ì œë¡??Œë ˆ?´ì–´ ì´ˆê¸°??);
      setYoutubeVideoId(null);
      // ?¤ìŒ ?±ì—??videoId ?¤ì •
      setTimeout(() => {
        setYoutubeVideoId(videoId);
      }, 0);
    } else {
      // ??ë¹„ë””??ID ?¤ì • (?´ë ‡ê²??˜ë©´ useEffectê°€ ?¸ë¦¬ê±°ë˜?????Œë ˆ?´ì–´ ì´ˆê¸°??
      setYoutubeVideoId(videoId);
    }
  }, [youtubeUrl, youtubePlayer, youtubeVideoId]);

  // ?´ë¦½ë³´ë“œ?ì„œ YouTube URL ë¶™ì—¬?£ê¸° ë°??ë™ ë¡œë“œ
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        const trimmedText = text.trim();
        setYoutubeUrl(trimmedText);
        
        // ? íš¨??YouTube URL?´ë©´ ?ë™?¼ë¡œ ë¡œë“œ
        const videoId = extractYouTubeVideoId(trimmedText);
        if (videoId) {
          // ê¸°ì¡´ ?Œë ˆ?´ì–´ ?œê±°
          if (youtubePlayer) {
            try {
              youtubePlayer.destroy();
            } catch (e) {
              console.error('ê¸°ì¡´ ?Œë ˆ?´ì–´ ?œê±° ?¤íŒ¨:', e);
            }
          }

          setYoutubeVideoId(videoId);
          setYoutubePlayer(null);
          youtubePlayerReadyRef.current = false;
        } else {
          // ? íš¨?˜ì? ?Šì? URL??ê²½ìš° ?Œë¦¼
          alert('? íš¨??YouTube URL???„ë‹™?ˆë‹¤. URL???•ì¸?´ì£¼?¸ìš”.');
        }
      } else {
        alert('?´ë¦½ë³´ë“œê°€ ë¹„ì–´?ˆìŠµ?ˆë‹¤.');
      }
    } catch (error) {
      console.error('?´ë¦½ë³´ë“œ ?½ê¸° ?¤íŒ¨:', error);
      alert('?´ë¦½ë³´ë“œë¥??½ì„ ???†ìŠµ?ˆë‹¤. ?˜ë™?¼ë¡œ ë¶™ì—¬?£ì–´ì£¼ì„¸??');
    }
  }, [youtubePlayer, youtubeVideoId]);

  // BPM ??ê³„ì‚°
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

  // BPM ?˜ë™ ?…ë ¥
  const handleBpmInput = useCallback((value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && isValidBPM(numValue)) {
      setBpm(numValue);
      setIsBpmInputOpen(false);
    } else {
      alert('? íš¨??BPM???…ë ¥?´ì£¼?¸ìš”. (30-300)');
    }
  }, []);

  // ?¬ìƒ/?¼ì‹œ?•ì?
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, pausePlayback, startPlayback]);

  // ì²˜ìŒ?¼ë¡œ ?Œì•„ê°€ê¸?
  const handleRewind = useCallback(() => {
    pausePlayback();
    applySeek(0);
  }, [applySeek, pausePlayback]);

  // ?¬ìƒ ì¤‘ì?
  const stopPlayback = useCallback(() => {
    pausePlayback();
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.stopVideo();
      } catch (error) {
        console.error('YouTube ?Œë ˆ?´ì–´ ì¤‘ì? ?¤íŒ¨:', error);
      }
    }
    applySeek(0);
  }, [applySeek, pausePlayback, youtubePlayer]);

  const handleTestRun = useCallback(() => {
    if (!onTest) {
      alert('?ŒìŠ¤??ê¸°ëŠ¥???¬ìš©?????†ìŠµ?ˆë‹¤.');
      return;
    }
    if (!notes.length) {
      alert('?¸íŠ¸ê°€ ?†ìŠµ?ˆë‹¤. ?¸íŠ¸ë¥?ì¶”ê??????ŒìŠ¤?¸í•˜?¸ìš”.');
      return;
    }

    const startMs = getClampedTestStart();
    const hasAvailableNotes = notes.some((note) => {
      const duration = typeof note.duration === 'number' ? note.duration : 0;
      const endTime = typeof note.endTime === 'number' ? note.endTime : note.time + duration;
      return endTime >= startMs;
    });

    if (!hasAvailableNotes) {
      alert('? íƒ???œì‘ ?„ì¹˜ ?´í›„???¸íŠ¸ê°€ ?†ìŠµ?ˆë‹¤.');
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

  // ?€??
  const handleSave = useCallback(() => {
    if (notes.length === 0) {
      alert('?¸íŠ¸ê°€ ?†ìŠµ?ˆë‹¤. ?¸íŠ¸ë¥?ì¶”ê??????€?¥í•´ì£¼ì„¸??');
      return;
    }
    
    // ì±„ë³´ ?°ì´??ì¤€ë¹?
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
    
    // localStorage???€??
    const chartName = prompt('ì±„ë³´ ?´ë¦„???…ë ¥?˜ì„¸??', `Chart_${Date.now()}`);
    if (chartName) {
      const savedCharts = JSON.parse(localStorage.getItem('savedCharts') || '{}');
      savedCharts[chartName] = chartData;
      localStorage.setItem('savedCharts', JSON.stringify(savedCharts));
      
      alert(`ì±„ë³´ "${chartName}"??ê°€) ?€?¥ë˜?ˆìŠµ?ˆë‹¤!`);
      onSave(notes);
    }
  }, [notes, bpm, timeSignatures, timeSignatureOffset, youtubeVideoId, youtubeUrl, volume, onSave]);

  // ?¨ë¼??ê³µìœ 
  const handleShareChart = useCallback(async () => {
    if (!isSupabaseConfigured) {
      alert('Supabase ??ê¼ è¹‚Â€??? ??¼ì ™??? ??†ë¸˜ ?¨ë“­?€ æ¹²ê³•????????????ë’¿??ˆë–. ?·â‘¦???ë¶¾ì †?ê³•â”??CHART_SHARING_SETUP.md??ï§¡ë©¸?????ê¼ è¹‚Â€??? ??¼ì ™??????¼ë–† ??•ë£„??ï¼œ?ëª„ìŠ‚.');
      setUploadStatus('Supabase ??ê¼ è¹‚Â€??? ??ë¼± ?¨ë“­?€??????ë’¿??ˆë–.');
      return;
    }
    if (notes.length === 0) {
      alert('?¸íŠ¸ê°€ ?†ìŠµ?ˆë‹¤. ?¸íŠ¸ë¥?ì¶”ê?????ê³µìœ ?´ì£¼?¸ìš”.');
      return;
    }
    
    if (!shareTitle.trim() || !shareAuthor.trim()) {
      alert('?œëª©ê³??‘ì„±?ë? ?…ë ¥?´ì£¼?¸ìš”.');
      return;
    }
    
    setIsUploading(true);
    setUploadStatus('?…ë¡œ??ì¤?..');
    
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
      
      // ?´ë?ì§€ê°€ ?ˆìœ¼ë©?ë¨¼ì? ?…ë¡œ??
      let previewImageUrl: string | undefined = undefined;
      console.log('?…ë¡œ???œì‘, previewImageFile:', previewImageFile);
      if (previewImageFile) {
        try {
          setUploadStatus('?´ë?ì§€ ?…ë¡œ??ì¤?..');
          console.log('?´ë?ì§€ ?…ë¡œ???œì‘:', previewImageFile.name, previewImageFile.size);
          // ?„ì‹œ IDë¡??´ë?ì§€ ?…ë¡œ??(?¤ì œ ì±„ë³´ ID???˜ì¤‘???…ë°?´íŠ¸)
          const tempId = `temp-${Date.now()}`;
          previewImageUrl = await chartAPI.uploadPreviewImage(tempId, previewImageFile);
          console.log('?´ë?ì§€ ?…ë¡œ???±ê³µ, URL:', previewImageUrl);
        } catch (imageError: any) {
          console.error('?´ë?ì§€ ?…ë¡œ???¤íŒ¨:', imageError);
          console.error('?ëŸ¬ ?ì„¸:', {
            message: imageError.message,
            statusCode: imageError.statusCode,
            error: imageError.error,
            fullError: imageError
          });
          const errorMsg = imageError?.message || '?????†ëŠ” ?¤ë¥˜';
          const continueWithoutImage = confirm(`?´ë?ì§€ ?…ë¡œ?œì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.\n\n?ëŸ¬: ${errorMsg}\n\n?´ë?ì§€ ?†ì´ ê³„ì†?˜ì‹œê² ìŠµ?ˆê¹Œ?`);
          if (!continueWithoutImage) {
            setIsUploading(false);
            setUploadStatus('');
            return;
          }
        }
      } else {
        console.log('previewImageFile???†ì–´???´ë?ì§€ ?…ë¡œ??ê±´ë„ˆ?€');
      }
      
      // ì±„ë³´ ?…ë¡œ??(?´ë?ì§€ URL ?¬í•¨)
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
      
      console.log('ì±„ë³´ ?…ë¡œ???±ê³µ, preview_image:', previewImageUrl);
      setUploadStatus('?…ë¡œ???„ë£Œ! ê´€ë¦¬ì ?¹ì¸ ??ê³µê°œ?©ë‹ˆ??');
      setIsShareModalOpen(false);
      
      // ??ì´ˆê¸°??
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
      console.error('ì±„ë³´ ?…ë¡œ???¤íŒ¨:', error);
      setUploadStatus(`?…ë¡œ???¤íŒ¨: ${error.message || '?????†ëŠ” ?¤ë¥˜'}`);
    } finally {
      setIsUploading(false);
    }
  }, [notes, bpm, timeSignatures, timeSignatureOffset, youtubeVideoId, youtubeUrl, playbackSpeed, shareTitle, shareAuthor, shareDifficulty, shareDescription, previewImageFile]);

  // ì±„ë³´ ë¡œë“œ
  const handleLoad = useCallback(() => {
    try {
      const savedCharts = JSON.parse(localStorage.getItem('savedCharts') || '{}');
      const chartNames = Object.keys(savedCharts);
      
      if (chartNames.length === 0) {
        alert('?€?¥ëœ ì±„ë³´ê°€ ?†ìŠµ?ˆë‹¤.');
        return;
      }
      
      const chartName = prompt(
        `ë¡œë“œ??ì±„ë³´ë¥?? íƒ?˜ì„¸??\n${chartNames.join(', ')}`,
        chartNames[0]
      );
      
      if (!chartName || !savedCharts[chartName]) {
        return;
      }
      
      const chartData = savedCharts[chartName];
      
      // ?¸íŠ¸ ?°ì´??ê²€ì¦?ë°?ë¡œë“œ
      if (chartData.notes && Array.isArray(chartData.notes)) {
        // noteIdRef ì´ˆê¸°??
        noteIdRef.current = 0;
        
        const loadedNotes: Note[] = chartData.notes
          .map((noteData: any) => {
            // ?„ìˆ˜ ?„ë“œ ê²€ì¦?
            if (typeof noteData.lane !== 'number' || typeof noteData.time !== 'number') {
              console.warn('? íš¨?˜ì? ?Šì? ?¸íŠ¸ ?°ì´??', noteData);
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
      
      // ?¬ìƒ ?íƒœ ì´ˆê¸°??
      setIsPlaying(false);
      setCurrentTime(0);
      
      // ê¸°ì¡´ ?Œë ˆ?´ì–´ ?•ë¦¬
      if (youtubePlayer) {
        try {
          youtubePlayer.destroy();
        } catch (e) {
          console.warn('ê¸°ì¡´ ?Œë ˆ?´ì–´ ?œê±° ?¤íŒ¨:', e);
        }
      }
      setYoutubePlayer(null);
      youtubePlayerReadyRef.current = false;
      
      // BPM ë³µì›
      if (chartData.bpm && typeof chartData.bpm === 'number') {
        setBpm(chartData.bpm);
      }

      // ë°•ì ?„í™˜ ?•ë³´ ë³µì›
      if (chartData.timeSignatures && Array.isArray(chartData.timeSignatures)) {
        setTimeSignatures(chartData.timeSignatures);
      }

      // ë§ˆë”” ?¤í”„??ë³µì›
      if (
        typeof chartData.timeSignatureOffset === 'number'
      ) {
        setTimeSignatureOffset(chartData.timeSignatureOffset);
      } else {
        setTimeSignatureOffset(0); // ê¸°ë³¸ê°?
      }
      
      // YouTube ?•ë³´ ë³µì› (?Œë ˆ?´ì–´??useEffect?ì„œ ?ë™ ì´ˆê¸°?”ë¨)
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
      
      // ?ŒëŸ‰ ë³µì›
      if (typeof chartData.volume === 'number') {
        setVolume(Math.max(0, Math.min(100, chartData.volume)));
      } else {
        setVolume(100); // ê¸°ë³¸ê°?
      }
      
      alert(`ì±„ë³´ "${chartName}"??ê°€) ë¡œë“œ?˜ì—ˆ?µë‹ˆ??`);
    } catch (error) {
      console.error('ì±„ë³´ ë¡œë“œ ?¤ë¥˜:', error);
      alert('ì±„ë³´ë¥?ë¡œë“œ?˜ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤. ì½˜ì†”???•ì¸?˜ì„¸??');
    }
  }, [youtubePlayer]);

  // ?¸íŠ¸??y ì¢Œí‘œ ê³„ì‚°
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
      {/* ?¤ë” */}
      <div
        style={{
          backgroundColor: '#2a2a2a',
          borderBottom: '2px solid #444',
        }}
      >
        {/* ë©”ë‰´ ? ê? ë²„íŠ¼ */}
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
              ì±„ë³´ ?ë””??
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
              ??
            </span>
            {/* ?Œë ˆ?´ì–´ ì»¨íŠ¸ë¡?ë²„íŠ¼??*/}
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
                title="ì²˜ìŒ?¼ë¡œ ?Œì•„ê°€ê¸?(0ì´?"
              >
                ??ì²˜ìŒ?¼ë¡œ
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
                {isPlaying ? '???¼ì‹œ?•ì?' : '???¬ìƒ'}
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
                ??ì¤‘ì?
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
                {isAutoScrollEnabled ? '?“Œ ê³ ì •' : '?“Œ ?´ì œ'}
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
                ?“‚ ë¡œë“œ
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
                ?’¾ ?€??
              </button>
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
                ???˜ê?ê¸?
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ color: '#FFD700', fontSize: '16px', fontWeight: 'bold' }}>
              BPM: {Math.round(bpm)}
            </span>
          </div>
        </div>

        {/* ?‘ì„ ???ˆëŠ” ë©”ë‰´ ?´ìš© */}
        {isMenuOpen && (
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
            }}
          >
            {/* YouTube URL ?…ë ¥ */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="YouTube URL ?…ë ¥..."
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
                title="?´ë¦½ë³´ë“œ?ì„œ ë¶™ì—¬?£ê¸°"
              >
                ?“‹ ë¶™ì—¬?£ê¸°
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
                ??ë¡œë“œ
              </button>
            </div>
            
            {/* BPM ?¤ì • */}
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
                  ?…ë ¥
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
                  ??({tapBpmCalculatorRef.current.getTapCount()})
                </button>
                {tapBpmResult && (
                  <span style={{ color: '#aaa', fontSize: '12px' }}>
                    (? ë¢°?? {(tapBpmResult.confidence * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            
            {isBpmInputOpen && (
              <input
                type="number"
                min="30"
                max="300"
                placeholder="BPM ?…ë ¥"
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

      {/* ë©”ì¸ ?ë””???ì—­ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ?¼ìª½ ?¬ì´?œë°” - ê¸°ë³¸ ?•ë³´ */}
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
              ?„ì¬ ?œê°„
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
              ?¸íŠ¸ ê°œìˆ˜
            </div>
            <div style={{ color: '#aaa', fontSize: '14px' }}>{notes.length}ê°?/div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              ì¤?
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
                
                // ?´ë¦­???„ì¹˜??ì¤?ê°?ê³„ì‚° ë°?ì¦‰ì‹œ ?ìš©
                const clickZoom = 0.5 + ratio * (3 - 0.5);
                setZoom(clickZoom);
                
                // ?œë˜ê·??œì‘ ?¤ì •
                slider.style.cursor = 'grabbing';
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
                
                const startX = e.clientX;
                const startZoom = clickZoom; // ?´ë¦­???„ì¹˜??ì¤?ê°’ì—???œì‘
                
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
              ?¬ìƒ ?ë„
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
              ?„ì¬: {playbackSpeed}x
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '10px', marginTop: '2px' }}>
              {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                <span key={`speed-label-${speed}`}>{speed}x</span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              ?ŒëŸ‰ 
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
              ?„ì¬: {volume}%
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              ë°•ì / ê²©ì
            </div>
            <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '6px' }}>
              ?„ì¬ ë°•ì: {activeTimeSignature.beatsPerMeasure}/4
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
                  4/4ë¡??¤ì •
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
                  3/4ë¡??¤ì •
                </button>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ color: '#aaa', fontSize: '12px' }}>?¸ë¶„??</span>
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
                  ê¸°ë³¸
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
                  2ë¶„í• 
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
                  ?‹ì‡??
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
                  ë§ˆë”” ?¤í”„??
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
                    title="ë§ˆë”” ?œì‘? ì„ ??ì¹??ìœ¼ë¡??´ë™"
                  >
                    ?€
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
                    title="ë§ˆë”” ?œì‘? ì„ ??ì¹??¤ë¡œ ?´ë™"
                  >
                    ??
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
                    title="ë§ˆë”” ?¤í”„??ì´ˆê¸°??
                  >
                    ì´ˆê¸°??
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ?ë””??ìº”ë²„??*/}
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
            {/* ???ˆì¸ ?ì—­ ë°°ê²½ */}
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

            {/* ?ˆì¸ êµ¬ë¶„??*/}
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

            {/* ?€?„ë¼???¤í¬ë¡??ì—­ */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                // ê³ ì • ëª¨ë“œ???ŒëŠ” ?¬ìš©?ê? ?¤í¬ë¡¤ë¡œ ?„ì¹˜ë¥?ë°”ê¾¸ì§€ ëª»í•˜?„ë¡ overflowë¥??¨ê?
                overflowY: isAutoScrollEnabled ? 'hidden' : 'auto',
                cursor: 'default',
              }}
              onClick={handleTimelineClick}
              ref={timelineScrollRef}
            >
              {/* ?œê°„ ê²©ì */}
              <div
                style={{
                  position: 'relative',
                  height: `${timelineContentHeight}px`,
                }}
              >
                {/* BPM + ë°•ì ê¸°ë°˜ ë¹„íŠ¸ / ë§ˆë”” ê²©ì */}
                {(() => {
                  if (!beatDuration || beatDuration <= 0) return null;
                  const totalBeats = Math.ceil(timelineDurationMs / beatDuration) + 16;
                  let tsIndex = 0;
                  let currentTS =
                    sortedTimeSignatures.length > 0
                      ? sortedTimeSignatures[0]
                      : { id: -1, beatIndex: 0, beatsPerMeasure: 4 };

                  return Array.from({ length: totalBeats }).map((_, i) => {
                    // ?„ì¬ ë¹„íŠ¸???´ë‹¹?˜ëŠ” ë°•ì ?•ë³´ ì°¾ê¸°
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
                    // ë§ˆë”” ?¤í”„???ìš©: ??²Œ ?œì‘?˜ëŠ” ê³¡ì„ ?„í•´ ë§ˆë”” ?œì‘??ì¡°ì •
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
                        {/* ?‹ì‡?????¸ë¶„??ê²©ì */}
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
                
                {/* ê¸°ë³¸ ?œê°„ ê²©ì (1ì´?ê°„ê²©) */}
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

                {/* ?¬ìƒ??(Playhead) */}
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
                    title="?¬ìƒ???œë˜ê·?
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
                    ??
                  </div>
                </div>

                {/* ?¸íŠ¸ ?Œë”ë§?*/}
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
                          ? `ë¡±ë…¸?? ${note.time.toFixed(0)}ms ~ ${note.endTime.toFixed(0)}ms`
                          : `?´ë¦­?˜ì—¬ ?? œ (${note.time.toFixed(0)}ms)`
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

            {/* YouTube ?Œë ˆ?´ì–´ (?¨ê? - ?¤ë””?¤ë§Œ ?¬ìƒ) */}
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

        {/* ?¤ë¥¸ìª??¬ì´?œë°” - ë¡±ë…¸??& ?ŒìŠ¤??*/}
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
              ë¡±ë…¸??
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
              {isLongNoteMode ? 'ë¡±ë…¸???´ì œ' : 'ë¡±ë…¸???œì„±??}
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
                  ? `${LANE_KEY_LABELS[pendingLongNote.lane]} ?œì‘?? ì¢…ë£Œ ?„ì¹˜?ì„œ ?™ì¼ ???¬ì…??`
                  : '?¤ë? ??ë²??ŒëŸ¬ ?œì‘/ì¢…ë£Œ ì§€??}
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
                    ì·¨ì†Œ
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
              ?ŒìŠ¤??
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
                ?œì‘ ?„ì¹˜ (ms)
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
                  ?„ì¬
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
                  ì²˜ìŒ
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
                ?® ?ŒìŠ¤???¤í–‰
              </button>
            </div>
          </div>

          {/* ?¨ë¼??ê³µìœ  */}
          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
              ?¨ë¼??ê³µìœ 
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
              ?Œ ì±„ë³´ ê³µìœ ?˜ê¸°
            </button>
          </div>
        </div>
      </div>

      {/* ê³µìœ  ëª¨ë‹¬ */}
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
              ì±„ë³´ ê³µìœ ?˜ê¸°
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ color: '#ddd', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  ?œëª© *
                </label>
                <input
                  type="text"
                  value={shareTitle}
                  onChange={(e) => setShareTitle(e.target.value)}
                  placeholder="ì±„ë³´ ?œëª©???…ë ¥?˜ì„¸??
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
                  ?‘ì„±??*
                </label>
                <input
                  type="text"
                  value={shareAuthor}
                  onChange={(e) => setShareAuthor(e.target.value)}
                  placeholder="?‘ì„±???´ë¦„???…ë ¥?˜ì„¸??
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
                  ?œì´??
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
                  ?¤ëª…
                </label>
                <textarea
                  value={shareDescription}
                  onChange={(e) => setShareDescription(e.target.value)}
                  placeholder="ì±„ë³´???€???¤ëª…???…ë ¥?˜ì„¸??(? íƒ?¬í•­)"
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
                  ë¯¸ë¦¬ë³´ê¸° ?´ë?ì§€ (? íƒ?¬í•­)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    console.log('?Œì¼ ? íƒ??', file);
                    if (file) {
                      // ?Œì¼ ?¬ê¸° ?œí•œ (5MB)
                      if (file.size > 5 * 1024 * 1024) {
                        alert('?´ë?ì§€ ?¬ê¸°??5MB ?´í•˜?¬ì•¼ ?©ë‹ˆ??');
                        e.target.value = '';
                        return;
                      }
                      setPreviewImageFile(file);
                      console.log('previewImageFile ?íƒœ ?¤ì •??', file.name);
                      // ë¯¸ë¦¬ë³´ê¸° URL ?ì„±
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        setPreviewImageUrl(event.target?.result as string);
                        console.log('ë¯¸ë¦¬ë³´ê¸° URL ?ì„±??);
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
                      alt="ë¯¸ë¦¬ë³´ê¸°"
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
                  ê¶Œì¥ ?¬ê¸°: 16:9 ë¹„ìœ¨, ìµœë? 5MB
                </div>
              </div>

              <div style={{ color: '#aaa', fontSize: '12px', padding: '10px', backgroundColor: '#1f1f1f', borderRadius: '6px' }}>
                <strong>ì±„ë³´ ?•ë³´:</strong><br />
                ?¸íŠ¸ ?? {notes.length}ê°?br />
                BPM: {bpm}<br />
                {youtubeUrl && `YouTube: ${youtubeUrl}`}
              </div>

              {uploadStatus && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: uploadStatus.includes('?„ë£Œ') ? '#4CAF50' : uploadStatus.includes('?¤íŒ¨') ? '#f44336' : '#2196F3',
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
                  ì·¨ì†Œ
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
                    ë¡œê·¸????ê³µìœ 
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
                    {isUploading ? '?…ë¡œ??ì¤?..' : 'ê³µìœ ?˜ê¸°'}
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

