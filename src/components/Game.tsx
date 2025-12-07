import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
type AuthUser = {
  id: string;
  email?: string;
  role?: string;
  profile?: any;
};
import { GameState, Note, Lane, JudgeType, SpeedChange } from '../types/game';
import { Note as NoteComponent } from './Note';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { Score as ScoreComponent } from './Score';
import { ChartEditor } from './ChartEditor';
import { ChartSelect } from './ChartSelect';
import { ChartAdmin } from './ChartAdmin';
import { SubtitleEditor } from './SubtitleEditor';
import { SettingsModal } from './SettingsModal';
import { useKeyboard } from '../hooks/useKeyboard';
import { useGameLoop } from '../hooks/useGameLoop';
import { judgeTiming, judgeHoldReleaseTiming } from '../utils/judge';
import { judgeConfig } from '../config/judgeConfig';
import { generateNotes } from '../utils/noteGenerator';
import { waitForYouTubeAPI } from '../utils/youtube';
import { SubtitleCue, SubtitleStyle } from '../types/subtitle';
import { subtitleAPI, localSubtitleStorage } from '../lib/subtitleAPI';
import { supabase, isSupabaseConfigured, profileAPI, UserProfile } from '../lib/supabaseClient';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { VideoRhythmLayout } from './VideoRhythmLayout';
import { LyricOverlay } from './LyricOverlay';
import { getNoteFallDuration } from '../utils/speedChange';
import { GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT } from '../constants/gameLayout';

// Subtitle editor chart data
interface SubtitleEditorChartData {
  chartId: string;
  notes: Note[];
  bpm: number;
  youtubeVideoId?: string | null;
  youtubeUrl?: string;
  title?: string;
}

interface EditorTestPayload {
  notes: Note[];
  startTimeMs: number;
  youtubeVideoId: string | null;
  youtubeUrl: string;
  playbackSpeed: number;
  audioOffsetMs?: number;
  bpm?: number;
  speedChanges?: SpeedChange[];
  chartId?: string;
}

// 4개 레인을 더 붙이도록 배치: 각 레인 100px 너비, 4개 = 400px
// 좌우 여백을 3분의 1로 줄임: (700 - 400) / 2 / 3 = 50px
// 각 레인 중앙: 50 + 50 = 100px, 이후 100px씩 간격
// 판정선: 50px ~ 450px (4개 레인 영역)
const LANE_POSITIONS = [100, 200, 300, 400];
const JUDGE_LINE_LEFT = 50; // 판정선 시작 위치 (첫 레인 왼쪽)
const JUDGE_LINE_WIDTH = 400; // 판정선 너비 (4개 레인 영역)
const JUDGE_LINE_Y = 640;

// 자막 렌더링 영역 (16:9 비율, 4레인 영역 기준)

const GAME_DURATION = 30000; // 30초
const START_DELAY_MS = 4000;
const BASE_FALL_DURATION = 2000; // 기본 노트 낙하 시간(ms)

const DEFAULT_KEY_BINDINGS: [string, string, string, string] = ['D', 'F', 'J', 'K'];
const DISPLAY_NAME_STORAGE_KEY = 'rhythmGameDisplayName';
const KEY_BINDINGS_STORAGE_KEY = 'rhythmGameKeyBindings';
const NOTE_SPEED_STORAGE_KEY = 'rhythmGameNoteSpeed';
const BGA_ENABLED_STORAGE_KEY = 'rhythmGameBgaEnabled';

const safeReadLocalStorage = (key: string) => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeWriteLocalStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export const Game: React.FC = () => {
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [isChartSelectOpen, setIsChartSelectOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isSubtitleEditorOpen, setIsSubtitleEditorOpen] = useState<boolean>(false);
  const [subtitleEditorData, setSubtitleEditorData] = useState<SubtitleEditorChartData | null>(null);
  const [chartListRefreshToken, setChartListRefreshToken] = useState<number>(0);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const [isFromEditor, setIsFromEditor] = useState<boolean>(false); // 에디터에서 테스트 시작인지 구분
  const testPreparedNotesRef = useRef<Note[]>([]);
  const [baseBpm, setBaseBpm] = useState<number>(120);
  const [speedChanges, setSpeedChanges] = useState<SpeedChange[]>([]);

  // 인증 관련 상태
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [remoteProfile, setRemoteProfile] = useState<UserProfile | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // 설정 관련 상태
  const [displayName, setDisplayName] = useState<string>(() => {
    return safeReadLocalStorage(DISPLAY_NAME_STORAGE_KEY) || '';
  });
  const [keyBindings, setKeyBindings] = useState<string[]>(() => {
    const stored = safeReadLocalStorage(KEY_BINDINGS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === 4) {
          return parsed.map((key: string, index: number) => {
            if (typeof key !== 'string' || key.length === 0) {
              return DEFAULT_KEY_BINDINGS[index];
            }
            return key.toUpperCase();
          });
        }
      } catch {
        // ignore
      }
    }
    return [...DEFAULT_KEY_BINDINGS];
  });
  const [noteSpeed, setNoteSpeed] = useState<number>(() => {
    const stored = safeReadLocalStorage(NOTE_SPEED_STORAGE_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 10) {
        return parsed;
      }
    }
    return 1.0;
  });
  const [isBgaEnabled, setIsBgaEnabled] = useState<boolean>(() => {
    const stored = safeReadLocalStorage(BGA_ENABLED_STORAGE_KEY);
    return stored === 'true';
  });
  const [nextDisplayNameChangeAt, setNextDisplayNameChangeAt] = useState<Date | null>(null);

  // 로그인 가능 여부 (Supabase 설정 필요)
  const canEditCharts = !isSupabaseConfigured ? true : !!authUser;
  const hasPrivilegedRole = remoteProfile?.role === 'admin' || remoteProfile?.role === 'moderator';
  const canSeeAdminMenu = !isSupabaseConfigured ? true : !!authUser && hasPrivilegedRole;
  
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
  audioOffsetMs?: number;
  chartId?: string;
} | null>(null);
  const audioHasStartedRef = useRef(false);
  const lastResyncTimeRef = useRef(0); // 마지막 리싱크 시간 (쿨다운용)
  const [gameState, setGameState] = useState<GameState>(() => ({
    notes: generateNotes(GAME_DURATION),
    score: {
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
    },
    currentTime: 0,
    gameStarted: false,
    gameEnded: false,
  }));
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const [gameViewSize, setGameViewSize] = useState({ width: GAME_VIEW_WIDTH, height: GAME_VIEW_HEIGHT });

  const [pressedKeys, setPressedKeys] = useState<Set<Lane>>(new Set());
  const [holdingNotes, setHoldingNotes] = useState<Map<number, Note>>(new Map()); // 현재 누르고 있는 롱노트들 (노트 ID -> 노트)
  const [judgeFeedbacks, setJudgeFeedbacks] = useState<Array<{
    id: number;
    judge: JudgeType;
  }>>([]);
  const feedbackIdRef = useRef(0);
  const [keyEffects, setKeyEffects] = useState<Array<{
    id: number;
    lane: Lane;
    x: number;
    y: number;
  }>>([]);
  const keyEffectIdRef = useRef(0);

  // 자막 상태
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);

  const getAudioBaseSeconds = () => {
    if (!testAudioSettingsRef.current) return 0;
    const { startTimeMs, audioOffsetMs = 0 } = testAudioSettingsRef.current;
    return Math.max(0, (startTimeMs + audioOffsetMs) / 1000);
  };

  const getAudioPositionSeconds = (gameTimeMs: number) => {
    if (!testAudioSettingsRef.current) return 0;
    const { startTimeMs, audioOffsetMs = 0 } = testAudioSettingsRef.current;
    const effectiveTime = Math.max(0, gameTimeMs);
    return Math.max(0, (startTimeMs + audioOffsetMs + effectiveTime) / 1000);
  };
  const processedMissNotes = useRef<Set<number>>(new Set()); // 이미 Miss 처리된 노트 ID 추적
  const buildInitialScore = useCallback(
    () => ({
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
    }),
    []
  );
  
  // speed는 noteSpeed를 사용
  const speed = noteSpeed;

  // 인증 상태 동기화
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthUser(null);
      return;
    }

    let isMounted = true;
    const syncSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('세션 정보를 가져오지 못했습니다:', error);
          return;
        }
        const user = data.session?.user ?? null;
        if (isMounted) {
          setAuthUser(user);
        }

        if (user) {
          try {
            const profile = await profileAPI.getOrCreateProfile(user.id);
            if (isMounted) {
              setRemoteProfile(profile);
              if (profile.display_name) {
                setDisplayName(profile.display_name);
              }
              if (profile.nickname_updated_at) {
                const nextChange = new Date(new Date(profile.nickname_updated_at).getTime() + 7 * 24 * 60 * 60 * 1000);
                setNextDisplayNameChangeAt(nextChange);
              }
            }
          } catch (profileError) {
            console.error('프로필 정보를 불러오지 못했습니다:', profileError);
          }
        } else {
          if (isMounted) {
            setRemoteProfile(null);
          }
        }
      } catch (error) {
        console.error('Supabase 세션 동기화 실패:', error);
      }
    };

    syncSession();
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      const user = session?.user ?? null;
      setAuthUser(user);

      if (user) {
        try {
          const profile = await profileAPI.getOrCreateProfile(user.id);
          if (isMounted) {
            setRemoteProfile(profile);
            if (profile.display_name) {
              setDisplayName(profile.display_name);
            }
            if (profile.nickname_updated_at) {
              const nextChange = new Date(new Date(profile.nickname_updated_at).getTime() + 7 * 24 * 60 * 60 * 1000);
              setNextDisplayNameChangeAt(nextChange);
            }
          }
        } catch (profileError) {
          console.error('프로필 정보를 불러오지 못했습니다:', profileError);
        }
      } else {
        setRemoteProfile(null);
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // 설정 로컬 스토리지 저장
  useEffect(() => {
    safeWriteLocalStorage(DISPLAY_NAME_STORAGE_KEY, displayName);
  }, [displayName]);

  useEffect(() => {
    safeWriteLocalStorage(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(keyBindings));
  }, [keyBindings]);

  useEffect(() => {
    safeWriteLocalStorage(NOTE_SPEED_STORAGE_KEY, String(noteSpeed));
  }, [noteSpeed]);

  useEffect(() => {
    safeWriteLocalStorage(BGA_ENABLED_STORAGE_KEY, String(isBgaEnabled));
  }, [isBgaEnabled]);

  // 로그인/로그아웃 핸들러
  const handleLoginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      alert('Supabase가 설정되지 않았습니다.');
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
      console.error('Google 로그인 실패:', error);
      alert(error?.message || '로그인 중 문제가 발생했습니다.');
    }
  }, []);

  const handleLogout = useCallback(async () => {
    console.log('[Game] 로그아웃 버튼 클릭');

    // UI는 즉시 로그아웃 상태로 전환 (낙관적 업데이트)
    setAuthUser(null);
    setRemoteProfile(null);

    if (!isSupabaseConfigured) {
      // Supabase 미설정 환경에서는 여기서 끝
      return;
    }

    try {
      // Supabase signOut이 길게 걸리거나 응답이 없더라도 UI를 막지 않도록 타임아웃을 건다
      const signOutPromise = supabase.auth.signOut();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase signOut timeout')), 7000)
      );

      await Promise.race([signOutPromise, timeout]);
      console.log('[Game] Supabase 로그아웃 요청 완료');
    } catch (error: any) {
      console.error('로그아웃 실패(무시 가능):', error);
      // 여기서는 추가 alert 없이 콘솔만 찍고 넘어간다 (UI는 이미 로그인 해제 상태)
    }
  }, [isSupabaseConfigured]);

  // 닉네임 저장 핸들러
  const handleDisplayNameSave = useCallback(async () => {
    if (!authUser || !displayName.trim()) return;
    try {
      const result = await profileAPI.updateDisplayName(authUser.id, displayName.trim());
      if (result.success) {
        alert('닉네임이 저장되었습니다.');
        setNextDisplayNameChangeAt(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      } else if (result.nextChangeAt) {
        setNextDisplayNameChangeAt(result.nextChangeAt);
        alert(`닉네임은 ${result.nextChangeAt.toLocaleDateString()} 이후에 변경할 수 있습니다.`);
      }
    } catch (error: any) {
      console.error('닉네임 저장 실패:', error);
      alert(error?.message || '닉네임 저장 중 문제가 발생했습니다.');
    }
  }, [authUser, displayName]);

  // 키 바인딩 변경 핸들러
  const handleKeyBindingChange = useCallback((index: number, key: string) => {
    setKeyBindings((prev) => {
      const next = [...prev];
      next[index] = key;
      return next;
    });
  }, []);

  const handleResetKeyBindings = useCallback(() => {
    setKeyBindings([...DEFAULT_KEY_BINDINGS]);
  }, []);

  // 닉네임 변경 가능 여부
  const canChangeDisplayName = useMemo(() => {
    if (!nextDisplayNameChangeAt) return true;
    return new Date() >= nextDisplayNameChangeAt;
  }, [nextDisplayNameChangeAt]);

  // 역할 라벨
  const currentRoleLabel = useMemo(() => {
    if (!remoteProfile?.role) return '일반 사용자';
    switch (remoteProfile.role) {
      case 'admin':
        return '관리자';
      case 'moderator':
        return '운영자';
      default:
        return '일반 사용자';
    }
  }, [remoteProfile?.role]);

  // 역할별 체스말 아이콘 (User → 폰, Moderator → 비숍, Admin → 퀸)
  const roleChessIcon = useMemo(() => {
    switch (remoteProfile?.role) {
      case 'admin':
        return '♛';
      case 'moderator':
        return '♝';
      default:
        return '♟';
    }
  }, [remoteProfile?.role]);

  const isAdmin = useMemo(() => remoteProfile?.role === 'admin', [remoteProfile?.role]);
  const isModerator = useMemo(() => remoteProfile?.role === 'moderator', [remoteProfile?.role]);

  // 레인 키 라벨 (설정된 키 바인딩 사용)
  const laneKeyLabels = useMemo(() => keyBindings.map((k) => [k]), [keyBindings]);

  // 에디터 접근 확인
  const ensureEditorAccess = useCallback(() => {
    if (!canEditCharts) {
      alert('Google 로그인 후 이용할 수 있습니다.');
      return false;
    }
    return true;
  }, [canEditCharts]);

  // 표시할 이름 (닉네임 > 구글 이름 > 이메일)
  const userDisplayName = useMemo(() => {
    if (displayName.trim()) return displayName.trim();
    if (remoteProfile?.display_name) return remoteProfile.display_name;
    if ((remoteProfile as any)?.nickname) return (remoteProfile as any).nickname;
    if (authUser?.profile?.nickname) return authUser.profile.nickname;
    if (authUser?.email) return authUser.email.split('@')[0];
    return '게스트';
  }, [displayName, authUser, remoteProfile]);

  useEffect(() => {
    const container = gameContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateSize = () => {
      setGameViewSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // 자막 좌표 영역: 16:9 비율 (에디터 프리뷰와 동일)
  // 게임 화면 높이를 기준으로 16:9 영역을 계산하여 좌우로 확장
  const subtitleArea = useMemo(() => {
    const containerHeight = gameViewSize.height || GAME_VIEW_HEIGHT;
    const containerWidth = gameViewSize.width || GAME_VIEW_WIDTH;
    
    // 16:9 비율로 자막 영역 계산 (높이 기준)
    const SUBTITLE_ASPECT_RATIO = 16 / 9;
    const subtitleWidth = containerHeight * SUBTITLE_ASPECT_RATIO;
    const subtitleHeight = containerHeight;
    
    // 게임 화면 중앙에 정렬 (좌우로 확장됨)
    const offsetLeft = (containerWidth - subtitleWidth) / 2;
    
    return {
      left: offsetLeft,
      top: 0,
      width: subtitleWidth,
      height: subtitleHeight,
    };
  }, [gameViewSize]);


  // 속도가 변경될 때마다 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('rhythmGameSpeed', speed.toString());
  }, [speed]);

  // gameState를 ref로 유지하여 최신 값을 항상 참조
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const handleKeyPress = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      
      if (!currentState.gameStarted || currentState.gameEnded) return;

      // 키 프레스 상태 업데이트 - 키를 눌렀을 때만 눌린 상태로 변경
      setPressedKeys((prev) => {
        if (prev.has(lane)) return prev; // 이미 누른 키는 업데이트 스킵
        const next = new Set(prev);
        next.add(lane);
        
        // 키를 뗄 때만 짧게 시간 동안 떼어놓음
        setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(lane);
            return next;
          });
        }, 100); // 100ms 후에 키 떼기
        
        return next;
      });

      // 해당 레인에서 가장 가까운 노트 찾기
      const laneNotes = currentState.notes.filter(
        (note) => note.lane === lane && !note.hit
      );

      // 노트가 없으면 아무것도 하지 않음 (성공/실패 판단을 처리 안 함)
      if (laneNotes.length === 0) {
        return;
      }

      const currentTime = currentState.currentTime;
      let bestNote: Note | null = null;
      let bestTimeDiff = Infinity;

      for (const note of laneNotes) {
        const timeDiff = Math.abs(note.time - currentTime);
        if (timeDiff < bestTimeDiff && timeDiff <= 150) {
          bestTimeDiff = timeDiff;
          bestNote = note;
        }
      }

      if (bestNote) {
        const isHoldNote = (bestNote.type === 'hold' || bestNote.duration > 0);
        const judge = judgeTiming(bestNote.time - currentTime);
        
        // 상태 업데이트를 하나로 묶침
        setGameState((prev) => {
          const newScore = { ...prev.score };
          
          switch (judge) {
            case 'perfect':
              newScore.perfect++;
              newScore.combo++;
              break;
            case 'great':
              newScore.great++;
              newScore.combo++;
              break;
            case 'good':
              newScore.good++;
              newScore.combo++;
              break;
            case 'miss':
              newScore.miss++;
              newScore.combo = 0;
              break;
          }

          if (newScore.combo > newScore.maxCombo) {
            newScore.maxCombo = newScore.combo;
          }

          // 롱노트가 아닌 경우에만 hit: true로 설정
          const updatedNotes = isHoldNote
            ? prev.notes
            : prev.notes.map((note) =>
                note.id === bestNote!.id ? { ...note, hit: true } : note
              );

          return {
            ...prev,
            notes: updatedNotes,
            score: newScore,
          };
        });

        // 롱노트인 경우 holdingNotes에 추가
        if (isHoldNote) {
          setHoldingNotes((prev) => {
            const next = new Map(prev);
            next.set(bestNote.id, bestNote);
            return next;
          });
        }

        // 새로운 판정 피드백 추가 - 이전 판정은 제거
        const feedbackId = feedbackIdRef.current++;
        setJudgeFeedbacks([{ id: feedbackId, judge }]);
        
        // 판정선에 이펙트 추가 (miss가 아닐 때만) - 노트가 있는 판정선 위치에서
        if (judge !== 'miss') {
          const effectId = keyEffectIdRef.current++;
          // 노트가 판정선에 있는 위치 (판정선 y 좌표: 640px)
          const effectX = LANE_POSITIONS[lane];
          const effectY = 640; // 판정선 위치
          setKeyEffects((prev) => [...prev, { id: effectId, lane, x: effectX, y: effectY }]);
          
          // 피드백 제거와 이펙트 제거를 requestAnimationFrame으로 처리하여 렌더링 최적화
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
              setKeyEffects((prev) => prev.filter(e => e.id !== effectId));
            }, 800);
          });
        } else {
          // miss인 경우 이펙트 없이 피드백만 제거
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
            }, 800);
          });
        }
      }
      // bestNote가 null이고 laneNotes가 있으면 타이밍이 안 맞는 경우
      // 이 경우에도 Miss 처리를 하지 않음 (성공/실패가 구별이 안 되면 처리 안 함)
    },
    [] // 기존 코드 제거하여 함수 생성을 방지
  );

  const handleKeyRelease = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(lane);
        return next;
      });

      // 해당 레인의 holdingNotes에서 롱노트 찾기
      setHoldingNotes((prev) => {
        const next = new Map(prev);
        const laneHoldNotes = Array.from(prev.values()).filter(
          (note) => note.lane === lane && !note.hit
        );

        for (const holdNote of laneHoldNotes) {
          const currentTime = currentState.currentTime;
          const endTime = typeof holdNote.endTime === 'number' ? holdNote.endTime : holdNote.time + (holdNote.duration || 0);
          const timeDiff = Math.abs(endTime - currentTime);
          // 롱노트 판정 윈도우 사용 (일반 판정보다 여유로움)
          const holdReleaseWindow = judgeConfig.holdReleaseWindows.good;
          const isBeforeEnd = currentTime < endTime - holdReleaseWindow;
          
          if (timeDiff <= holdReleaseWindow) {
            // 롱노트 끝 판정 (롱노트 전용 판정 함수 사용)
            const judge = judgeHoldReleaseTiming(endTime - currentTime);
            
            setGameState((prevState) => {
              const newScore = { ...prevState.score };
              
              switch (judge) {
                case 'perfect':
                  newScore.perfect++;
                  newScore.combo++;
                  break;
                case 'great':
                  newScore.great++;
                  newScore.combo++;
                  break;
                case 'good':
                  newScore.good++;
                  newScore.combo++;
                  break;
                case 'miss':
                  newScore.miss++;
                  newScore.combo = 0;
                  break;
              }

              if (newScore.combo > newScore.maxCombo) {
                newScore.maxCombo = newScore.combo;
              }

              const updatedNotes = prevState.notes.map((note) =>
                note.id === holdNote.id ? { ...note, hit: true } : note
              );

              return {
                ...prevState,
                notes: updatedNotes,
                score: newScore,
              };
            });

            // 판정 피드백 추가
            const feedbackId = feedbackIdRef.current++;
            setJudgeFeedbacks([{ id: feedbackId, judge }]);
            
            if (judge !== 'miss') {
              const effectId = keyEffectIdRef.current++;
              const effectX = LANE_POSITIONS[lane];
              const effectY = 640;
              setKeyEffects((prevEffects) => [...prevEffects, { id: effectId, lane, x: effectX, y: effectY }]);
              
              requestAnimationFrame(() => {
                setTimeout(() => {
                  setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
                  setKeyEffects((prev) => prev.filter(e => e.id !== effectId));
                }, 800);
              });
            } else {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
                }, 800);
              });
            }

            // holdingNotes에서 제거
            next.delete(holdNote.id);
          } else if (isBeforeEnd) {
            // 롱노트를 충분히 유지하기 전에 손을 뗀 경우 Miss 처리
            processedMissNotes.current.add(holdNote.id);

            setGameState((prevState) => {
              const newScore = { ...prevState.score };
              newScore.miss++;
              newScore.combo = 0;

              const updatedNotes = prevState.notes.map((note) =>
                note.id === holdNote.id ? { ...note, hit: true } : note
              );

              return {
                ...prevState,
                notes: updatedNotes,
                score: newScore,
              };
            });

            const feedbackId = feedbackIdRef.current++;
            setJudgeFeedbacks([{ id: feedbackId, judge: 'miss' }]);
            requestAnimationFrame(() => {
              setTimeout(() => {
                setJudgeFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
              }, 800);
            });

            next.delete(holdNote.id);
          }
        }

        return next;
      });
    },
    []
  );

  useKeyboard(
    handleKeyPress,
    handleKeyRelease,
    gameState.gameStarted && !gameState.gameEnded,
    keyBindings
  );

  const handleNoteMiss = useCallback((note: Note) => {
    if (processedMissNotes.current.has(note.id)) {
      return;
    }

    processedMissNotes.current.add(note.id);

    setHoldingNotes((prev) => {
      if (!prev.has(note.id)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(note.id);
      return next;
    });
  }, []);

  useGameLoop(gameState, setGameState, handleNoteMiss, speed, START_DELAY_MS);

  // 현재 게임 시간(ms)을 자막/채보 타임라인 시간으로 변환
  const currentChartTimeMs = useMemo(
    () => Math.max(0, gameState.currentTime),
    [gameState.currentTime]
  );

  // 자막 불러오기
  const loadSubtitlesForChart = useCallback(async (chartId: string) => {
    try {
      let cues: SubtitleCue[] = [];

      const shouldForceLocal = !chartId || chartId.startsWith('local-');
      if (isSupabaseConfigured && !shouldForceLocal) {
        cues = await subtitleAPI.getSubtitlesByChartId(chartId);
      }

      if (!cues.length || shouldForceLocal) {
        const localCues = localSubtitleStorage.get(chartId);
        if (localCues.length) {
          cues = localCues;
        }
      }

      cues.sort((a, b) => a.startTimeMs - b.startTimeMs);
      setSubtitles(cues);
    } catch (e) {
      console.error('자막을 불러오지 못했습니다:', e);
      setSubtitles([]);
    }
  }, []);

  // 자막 페이드 인/아웃 포함 opacity 계산
  const getSubtitleOpacity = useCallback(
    (cue: SubtitleCue, chartTimeMs: number) => {
      const style: SubtitleStyle = cue.style || ({} as SubtitleStyle);
      const inEffect = style.inEffect ?? 'none';
      const outEffect = style.outEffect ?? 'none';
      const inDuration = style.inDurationMs ?? 120;
      const outDuration = style.outDurationMs ?? 120;

      if (chartTimeMs < cue.startTimeMs) return 0;

      // in 페이드
      if (chartTimeMs < cue.startTimeMs + inDuration && inEffect === 'fade') {
        const t = (chartTimeMs - cue.startTimeMs) / Math.max(1, inDuration);
        return Math.max(0, Math.min(1, t));
      }

      // 메인 표시 구간
      if (chartTimeMs <= cue.endTimeMs) {
        return 1;
      }

      // out 페이드
      if (outEffect === 'fade' && chartTimeMs <= cue.endTimeMs + outDuration) {
        const t = (chartTimeMs - cue.endTimeMs) / Math.max(1, outDuration);
        return Math.max(0, Math.min(1, 1 - t));
      }

      return 0;
    },
    []
  );

  const activeSubtitles = useMemo(() => {
    if (!subtitles.length) return [];
    if (!gameState.gameStarted) return [];

    const t = currentChartTimeMs;

    return subtitles
      .map((cue) => {
        const opacity = getSubtitleOpacity(cue, t);
        return opacity > 0
          ? {
              cue,
              opacity,
            }
          : null;
      })
      .filter((x): x is { cue: SubtitleCue; opacity: number } => x !== null);
  }, [subtitles, gameState.gameStarted, currentChartTimeMs, getSubtitleOpacity]);

  useEffect(() => {
    if (
      gameState.gameStarted &&
      gameState.currentTime >= GAME_DURATION &&
      !gameState.gameEnded
    ) {
      setGameState((prev) => ({ ...prev, gameEnded: true }));
      
      // 게임 종료 시 YouTube 플레이어 정지/해제
      if (isTestMode && testYoutubePlayer && testYoutubePlayerReadyRef.current) {
        try {
          testYoutubePlayer.pauseVideo?.();
        } catch (e) {
          console.warn('YouTube 일시정지 실패:', e);
        }
      }
    }
  }, [gameState.currentTime, gameState.gameStarted, gameState.gameEnded, isTestMode, testYoutubePlayer]);

  const resetGame = () => {
    setIsTestMode(false);
    setIsFromEditor(false);
    audioHasStartedRef.current = false;
    testPreparedNotesRef.current = [];
    processedMissNotes.current.clear(); // Miss 처리 노트 추적 초기화
    setPressedKeys(new Set());
    setHoldingNotes(new Map()); // 롱노트 상태 초기화
    setSubtitles([]);
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
      notes: generateNotes(GAME_DURATION),
      score: buildInitialScore(),
    }));
    setBaseBpm(120);
    setSpeedChanges([]);
  };

  const startTestSession = useCallback(
    (preparedNotes: Note[]) => {
      if (!preparedNotes.length) return;
      audioHasStartedRef.current = false;
      processedMissNotes.current.clear();
      setPressedKeys(new Set());
      setHoldingNotes(new Map()); // 롱노트 상태 초기화
      setGameState((prev) => ({
        ...prev,
        gameStarted: true,
        notes: preparedNotes.map((note, index) => ({
          ...note,
          id: index + 1,
          y: 0,
          hit: false,
        })),
        score: buildInitialScore(),
        currentTime: -START_DELAY_MS,
        gameEnded: false,
      }));
    },
    [buildInitialScore]
  );

  const handleEditorTest = useCallback(
    (payload: EditorTestPayload) => {
      const startMs = Math.max(0, Math.floor(payload.startTimeMs || 0));
      const preparedNotes = payload.notes
        .map((note) => {
          const rawDuration =
            typeof note.duration === 'number'
              ? Math.max(0, note.duration)
              : Math.max(
                  0,
                  (typeof note.endTime === 'number' ? note.endTime : note.time) - note.time
                );
          const originalEnd =
            typeof note.endTime === 'number' ? note.endTime : note.time + rawDuration;
          if (originalEnd < startMs) {
            return null;
          }
          const adjustedStart = Math.max(note.time, startMs);
          const trimmedDuration = Math.max(0, originalEnd - adjustedStart);
          const relativeStart = adjustedStart - startMs;
          const relativeEnd = relativeStart + trimmedDuration;
          return {
            ...note,
            time: relativeStart,
            duration: trimmedDuration,
            endTime: relativeEnd,
            type: trimmedDuration > 0 ? 'hold' : 'tap',
            y: 0,
            hit: false,
          };
        })
        .filter((note): note is Note => note !== null)
        .sort((a, b) => a.time - b.time)
        .map((note, index) => ({ ...note, id: index + 1 }));

      if (!preparedNotes.length) {
        alert('선택한 시작 위치 이후에 노트가 없습니다. 시작 위치를 조정해주세요.');
        return;
      }

      // YouTube 오디오 설정 전달
      testAudioSettingsRef.current = {
        youtubeVideoId: payload.youtubeVideoId,
        youtubeUrl: payload.youtubeUrl,
        startTimeMs: startMs,
        playbackSpeed: payload.playbackSpeed || 1,
        audioOffsetMs: payload.audioOffsetMs ?? 0,
      };

      testPreparedNotesRef.current = preparedNotes.map((note) => ({ ...note }));
      setIsTestMode(true);
      setIsFromEditor(true); // 에디터에서 테스트 시작
      setIsEditorOpen(false);
      setBaseBpm(payload.bpm ?? 120);
      setSpeedChanges(payload.speedChanges ?? []);
      if (payload.chartId) {
        loadSubtitlesForChart(payload.chartId);
      } else {
        setSubtitles([]);
      }
      
      // YouTube 플레이어 초기화를 위해 videoId 설정
      if (payload.youtubeVideoId) {
        setTestYoutubeVideoId(payload.youtubeVideoId);
      } else {
        setTestYoutubeVideoId(null);
      }
      
      startTestSession(preparedNotes);
    },
    [startTestSession, loadSubtitlesForChart]
  );

  const handleRetest = useCallback(() => {
    if (!testPreparedNotesRef.current.length) return;
    setIsTestMode(true);
    const clonedNotes = testPreparedNotesRef.current.map((note) => ({ ...note }));
    startTestSession(clonedNotes);
  }, [startTestSession]);

  const handleReturnToEditor = useCallback(() => {
    setIsEditorOpen(true);
    setIsTestMode(false);
    setIsFromEditor(false);
    audioHasStartedRef.current = false;
    testPreparedNotesRef.current = [];
    testAudioSettingsRef.current = null;
    setTestYoutubeVideoId(null);
    setSubtitles([]);
    
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

  // ESC 키로 테스트 모드 나가기
  // 플레이 목록으로 돌아가기 핸들러
  const handleReturnToPlayList = useCallback(() => {
    setIsTestMode(false);
    setIsFromEditor(false);
    audioHasStartedRef.current = false;
    testPreparedNotesRef.current = [];
    testAudioSettingsRef.current = null;
    setTestYoutubeVideoId(null);
    setSubtitles([]);
    
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
      notes: [],
      score: buildInitialScore(),
    }));
    
    // 플레이 종료 후 채보 목록 새로고침 트리거
    setChartListRefreshToken((prev) => prev + 1);
    setIsChartSelectOpen(true);
  }, [testYoutubePlayer, buildInitialScore]);

  useEffect(() => {
    if (!isTestMode || !gameState.gameStarted || gameState.gameEnded) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFromEditor) {
          handleReturnToEditor();
        } else {
          handleReturnToPlayList();
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isTestMode, isFromEditor, gameState.gameStarted, gameState.gameEnded, handleReturnToEditor, handleReturnToPlayList]);

  // 테스트 모드 YouTube 플레이어 초기화
  useEffect(() => {
    if (!isTestMode || !testYoutubeVideoId) return;
    if (!testYoutubePlayerRef.current) return;

    let playerInstance: any = null;
    let isCancelled = false;

    const cleanup = (player: any) => {
      if (player) {
        try {
          if (typeof player.destroy === 'function') {
            player.destroy();
          }
        } catch (e) {
          console.warn('테스트 플레이어 정리 실패:', e);
        }
      }
      setTestYoutubePlayer(null);
      testYoutubePlayerReadyRef.current = false;
    };

    // 기존 플레이어 정리
    setTestYoutubePlayer((currentPlayer: any) => {
      if (currentPlayer) {
        cleanup(currentPlayer);
      }
      return null;
    });
    testYoutubePlayerReadyRef.current = false;

    waitForYouTubeAPI().then(() => {
      if (isCancelled) return;

      if (!window.YT || !window.YT.Player) {
        console.error('YouTube IFrame API를 로드하지 못했습니다.');
        return;
      }

      const playerElement = testYoutubePlayerRef.current;
      if (!playerElement || isCancelled) return;

      const videoId = testYoutubeVideoId;
      if (!videoId) return;

      const playerId = `test-youtube-player-${videoId}`;
      if (playerElement.id !== playerId) {
        playerElement.id = playerId;
      }

      try {
        playerInstance = new window.YT.Player(playerElement.id, {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            enablejsapi: 1,
          } as any,
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;

              const player = event.target;
              testYoutubePlayerReadyRef.current = true;
              setTestYoutubePlayer(player);
              playerInstance = player;

              console.log('✅ 테스트 YouTube 플레이어 준비 완료');
              
              // 플레이어가 준비되면 설정만 하고, 실제 재생은 게임 시작 후에 수행
              setTimeout(() => {
                if (!isCancelled && player && testAudioSettingsRef.current) {
                  try {
                    const { playbackSpeed } = testAudioSettingsRef.current;
                    const startTimeSec = getAudioBaseSeconds();
                    
                    // 재생 속도 설정
                    player.setPlaybackRate?.(playbackSpeed);
                    
                    // 시작 위치로 이동 (미리 이동)
                    player.seekTo(startTimeSec, true);
                    
                    console.log(`🎵 YouTube 플레이어 준비 완료 (${startTimeSec}초, ${playbackSpeed}x) - 게임 시작 후 재생`);
                  } catch (e) {
                    console.warn('YouTube 플레이어 설정 실패:', e);
                  }
                }
              }, 100);
            },
          },
        });
      } catch (e) {
        console.error('테스트 플레이어 생성 실패:', e);
      }
    });

    return () => {
      isCancelled = true;
      if (playerInstance) {
        cleanup(playerInstance);
      }
    };
  }, [isTestMode, testYoutubeVideoId]);

  // Test mode YouTube audio sync
  useEffect(() => {
    if (!isTestMode || !gameState.gameStarted) return;
    if (!testYoutubePlayer || !testYoutubePlayerReadyRef.current) return;
    if (!testAudioSettingsRef.current) return;

    const { playbackSpeed } = testAudioSettingsRef.current;

    try {
      testYoutubePlayer.setPlaybackRate?.(playbackSpeed);
    } catch (e) {
      console.warn("YouTube playback speed update failed:", e);
    }

    const cueSeconds = getAudioBaseSeconds();

    if (gameState.currentTime < 0) {
      audioHasStartedRef.current = false;
      try {
        testYoutubePlayer.pauseVideo?.();
        testYoutubePlayer.seekTo(cueSeconds, true);
      } catch (e) {
        console.warn("YouTube cueing failed:", e);
      }
      return;
    }

    if (!audioHasStartedRef.current) {
      try {
        testYoutubePlayer.seekTo(cueSeconds, true);
        testYoutubePlayer.playVideo?.();
        audioHasStartedRef.current = true;
        console.log(`YouTube test playback start (${cueSeconds.toFixed(2)}s)`);
      } catch (e) {
        console.warn("YouTube initial playback failed:", e);
      }
      return;
    }

    const desiredSeconds = getAudioPositionSeconds(gameState.currentTime);
    const currentSeconds = testYoutubePlayer.getCurrentTime?.() ?? 0;
    const now = Date.now();

    // 임계값: 0.5초 이상 차이날 때만 리싱크
    // 쿨다운: 마지막 리싱크 후 2초 이내에는 리싱크하지 않음
    const RESYNC_THRESHOLD = 0.5;
    const RESYNC_COOLDOWN = 2000;

    if (
      Math.abs(currentSeconds - desiredSeconds) > RESYNC_THRESHOLD &&
      now - lastResyncTimeRef.current > RESYNC_COOLDOWN
    ) {
      try {
        testYoutubePlayer.seekTo(desiredSeconds, true);
        lastResyncTimeRef.current = now;
        console.log(`YouTube resync: ${currentSeconds.toFixed(2)}s → ${desiredSeconds.toFixed(2)}s (차이: ${Math.abs(currentSeconds - desiredSeconds).toFixed(2)}s)`);
      } catch (e) {
        console.warn("YouTube resync failed:", e);
      }
    }
  }, [isTestMode, gameState.gameStarted, gameState.currentTime, testYoutubePlayer]);

  const total = gameState.score.perfect + gameState.score.great + 
                gameState.score.good + gameState.score.miss;
  const accuracy =
    total > 0
      ? ((gameState.score.perfect * 100 +
          gameState.score.great * 80 +
          gameState.score.good * 50) /
          (total * 100)) *
        100
      : 0;

  // 채보 저장 핸들러 (현재 미사용)
  // const handleChartSave = useCallback((notes: Note[]) => {
  //   setIsTestMode(false);
  //   testPreparedNotesRef.current = [];
  //   setGameState((prev) => ({
  //     ...prev,
  //     notes: notes.map((note) => ({ ...note, y: 0, hit: false })),
  //   }));
  //   setIsEditorOpen(false);
  // }, []);

  // 에디터 닫기 핸들러
  const handleEditorCancel = useCallback(() => {
    setIsTestMode(false);
    testPreparedNotesRef.current = [];
    setIsEditorOpen(false);
  }, []);

  // 채보 선택 핸들러
  const handleChartSelect = useCallback((chartData: any) => {
    try {
      if (!chartData) {
        console.error('Chart data is missing');
        alert('채보 데이터가 없습니다.');
        return;
      }

      if (!chartData.notes || !Array.isArray(chartData.notes)) {
        console.error('Invalid chart data: notes array missing');
        alert('유효하지 않은 채보 데이터입니다.');
        return;
      }

      setIsChartSelectOpen(false);
      
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
          chartId: chartData.chartId,
        };
        setTestYoutubeVideoId(chartData.youtubeVideoId); // state로 설정하여 useEffect가 감지하도록
        setIsTestMode(true);
      } else {
        setIsTestMode(false);
        setTestYoutubeVideoId(null);
        testAudioSettingsRef.current = chartData.chartId
          ? {
              youtubeVideoId: null,
              youtubeUrl: chartData.youtubeUrl || '',
              startTimeMs: 0,
              playbackSpeed: 1,
              chartId: chartData.chartId,
            }
          : null;
      }
      
      // 선택된 채보 데이터로 게임 상태 초기화 (키 중복 방지 및 기본 필드 보정)
      const preparedNotes = chartData.notes
        .map((note: Note, index: number) => {
          const safeDuration =
            typeof note.duration === 'number'
              ? Math.max(0, note.duration)
              : Math.max(
                  0,
                  (typeof note.endTime === 'number' ? note.endTime : note.time) - note.time
                );
          const endTime =
            typeof note.endTime === 'number' ? note.endTime : note.time + safeDuration;
          return {
            ...note,
            id: index + 1, // React key/게임 로직 모두에서 고유 ID 보장
            time: Math.max(0, note.time),
            duration: safeDuration,
            endTime,
            type: safeDuration > 0 ? 'hold' : 'tap',
            y: 0,
            hit: false,
          };
        })
        .sort((a: Note, b: Note) => a.time - b.time);
      
      if (preparedNotes.length === 0) {
        alert('이 채보에는 노트가 없습니다.');
        return;
      }
      
      setGameState({
        notes: preparedNotes,
        score: buildInitialScore(),
        currentTime: -START_DELAY_MS,
        gameStarted: true,
        gameEnded: false,
      });
      if (typeof chartData.bpm === 'number') {
        setBaseBpm(chartData.bpm);
      } else {
        setBaseBpm(120);
      }
      setSpeedChanges(chartData.speedChanges || []);
      
      setHoldingNotes(new Map());
      processedMissNotes.current = new Set();

      // 자막 로드 (chartId가 있을 때만)
      if (chartData.chartId) {
        loadSubtitlesForChart(chartData.chartId);
      } else {
        setSubtitles([]);
      }
    } catch (error) {
      console.error('Failed to load chart:', error);
      alert('채보를 불러오는데 실패했습니다. 다시 시도해주세요.');
    }
  }, [buildInitialScore, loadSubtitlesForChart]);

  // 관리자 테스트 핸들러
  const handleAdminTest = useCallback((chartData: any) => {
    // 관리자 화면을 먼저 닫고, 다음 렌더링 사이클에서 테스트 시작
    setIsAdminOpen(false);
    // 상태 업데이트가 완료된 후 테스트 시작 (다음 틱에서 실행)
    setTimeout(() => {
    handleEditorTest({
      notes: chartData.notes || [],
      startTimeMs: 0,
      youtubeVideoId: chartData.youtubeVideoId || null,
      youtubeUrl: chartData.youtubeUrl || '',
      playbackSpeed: 1,
      audioOffsetMs: 0,
      bpm: chartData.bpm,
      speedChanges: chartData.speedChanges || [],
    });
    }, 0);
  }, [handleEditorTest]);

  // Subtitle editor open handler
  const handleOpenSubtitleEditor = useCallback((chartData: SubtitleEditorChartData) => {
    setSubtitleEditorData(chartData);
    setIsSubtitleEditorOpen(true);
    setIsEditorOpen(false);
  }, []);

  // Subtitle editor close handler
  const handleCloseSubtitleEditor = useCallback(() => {
    setIsSubtitleEditorOpen(false);
    setSubtitleEditorData(null);
    setIsEditorOpen(true);
  }, []);

  // Show subtitle editor if open
  if (isSubtitleEditorOpen && subtitleEditorData) {
    return (
      <SubtitleEditor
        chartId={subtitleEditorData.chartId}
        chartData={subtitleEditorData}
        onClose={handleCloseSubtitleEditor}
      />
    );
  }

  // 에디터가 열려있으면 에디터만 표시
  if (isEditorOpen) {
    return <ChartEditor onCancel={handleEditorCancel} onTest={handleEditorTest} onOpenSubtitleEditor={handleOpenSubtitleEditor} />;
  }

  // 채보 선택 화면
  if (isChartSelectOpen) {
    return (
      <ChartSelect
        onSelect={handleChartSelect}
        onClose={() => setIsChartSelectOpen(false)}
        refreshToken={chartListRefreshToken}
      />
    );
  }

  // 관리자 화면
  if (isAdminOpen) {
    return <ChartAdmin onClose={() => setIsAdminOpen(false)} onTestChart={handleAdminTest} />;
  }

  const backgroundVideoId = testYoutubeVideoId;
  const bgaCurrentSeconds =
    backgroundVideoId && isBgaEnabled
      ? getAudioPositionSeconds(gameState.currentTime)
      : null;
  const shouldPlayBga =
    !!backgroundVideoId &&
    isBgaEnabled &&
    gameState.gameStarted &&
    !gameState.gameEnded &&
    gameState.currentTime >= 0;

  return (
    <VideoRhythmLayout
      videoId={backgroundVideoId}
      bgaEnabled={isBgaEnabled}
      shouldPlayBga={shouldPlayBga}
      bgaCurrentSeconds={bgaCurrentSeconds ?? undefined}
    >
      {/* 게임 + 자막 wrapper (자막이 게임 바깥으로 나갈 수 있도록) */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 'min(500px, 100vw - 32px)',
            height: 'min(800px, 100vh - 32px)',
            maxWidth: '500px',
            maxHeight: '800px',
            margin: '0 auto',
            marginTop: 0,
          }}
        >
          <div
            ref={gameContainerRef}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: CHART_EDITOR_THEME.radiusLg,
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
        {/* 4개 레인 영역 배경 */}
        <div
          style={{
            position: 'absolute',
            left: '50px',
            top: '0',
            width: '400px',
            height: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.6)', // 네온 톤의 남색 계열
          }}
        />
        
        {/* 배경 라인 구분선 - 레인 사이 경계와 양쪽 끝 */}
        {[50, 150, 250, 350, 450].map((x) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: '0',
              width: '2px',
              height: '100%',
              backgroundColor: 'rgba(255,255,255,0.1)',
              transform: 'translateX(-50%)',
            }}
          />
        ))}

        {/* 노트 렌더링 */}
        {gameState.notes.map((note) => {
          const baseDuration = BASE_FALL_DURATION / speed;
          const fallDuration = getNoteFallDuration(
            note.time,
            gameState.currentTime,
            baseBpm,
            speedChanges,
            baseDuration
          );

          return (
            <NoteComponent
              key={`${note.id}-${note.time}-${note.lane}`}
              note={note}
              fallDuration={fallDuration}
              currentTime={gameState.currentTime}
              judgeLineY={JUDGE_LINE_Y}
              laneX={LANE_POSITIONS[note.lane]}
              isHolding={holdingNotes.has(note.id)}
            />
          );
        })}

        {/* 판정선 - 게임 중에만 표시 (4개 레인 영역에만) */}
        {gameState.gameStarted && (
          <JudgeLine left={JUDGE_LINE_LEFT} width={JUDGE_LINE_WIDTH} />
        )}

        {/* 4개 레인 - 게임 중에만 표시 */}
        {gameState.gameStarted &&
          LANE_POSITIONS.map((x, index) => (
            <KeyLane
              key={index}
              x={x}
              keys={laneKeyLabels[index]}
              isPressed={pressedKeys.has(index as Lane)}
            />
          ))}

        {/* 판정선에 나오는 이펙트 - 노트가 있는 위치에서 (게임 중에만 표시) */}
        {gameState.gameStarted &&
          keyEffects.map((effect) => (
            <div
              key={effect.id}
              style={{
                position: 'absolute',
                left: `${effect.x}px`,
                top: `${effect.y}px`,
                transform: 'translate(-50%, -50%)',
                width: '120px',
                height: '120px',
                pointerEvents: 'none',
                zIndex: 500,
              }}
            >
              {/* 파티클 이펙트 */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100%',
                  height: '100%',
                  animation: 'keyEffectRipple 0.6s ease-out forwards',
                  borderRadius: '50%',
                  border: '3px solid rgba(255, 255, 255, 0.8)',
                  boxShadow: '0 0 20px rgba(255, 255, 255, 0.6), 0 0 40px rgba(255, 255, 255, 0.4)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '80%',
                  height: '80%',
                  animation: 'keyEffectRipple 0.6s 0.1s ease-out forwards',
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 255, 255, 0.6)',
                  boxShadow: '0 0 15px rgba(255, 255, 255, 0.5)',
                }}
              />
              {/* 사방으로 날아가는 파티클 */}
              {[...Array(8)].map((_, i) => {
                const angle = (i * 360) / 8;
                const radians = (angle * Math.PI) / 180;
                const distance = 40;
                const x = Math.cos(radians) * distance;
                const y = Math.sin(radians) * distance - 40; // 위로 좀 날아가도록
                
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      boxShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
                      animation: `keyEffectParticle 0.6s ease-out forwards`,
                      animationDelay: `${i * 0.05}s`,
                      '--end-x': `${x}px`,
                      '--end-y': `${y}px`,
                    } as React.CSSProperties & { '--end-x': string; '--end-y': string }}
                  />
                );
              })}
            </div>
          ))}

        {/* 판정 피드백 - 4개 레인 영역 중앙에 통합 표시 (개별 애니메이션) */}
        {judgeFeedbacks.map((feedback) => 
          feedback.judge ? (
            <div
              key={feedback.id}
              style={{
                position: 'absolute',
                left: '50%',
                top: '500px',
                transform: 'translateX(-50%)',
                fontSize: '48px',
                fontWeight: 'bold',
                color:
                  feedback.judge === 'perfect'
                    ? '#FFD700'
                    : feedback.judge === 'great'
                    ? '#00FF00'
                    : feedback.judge === 'good'
                    ? '#00BFFF'
                    : '#FF4500',
                textShadow: '0 0 20px rgba(255,255,255,0.9), 0 0 40px currentColor',
                animation: 'judgePopUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                zIndex: 1000 + feedback.id,
                pointerEvents: 'none',
              }}
            >
              {feedback.judge.toUpperCase()}
            </div>
          ) : null
        )}

        {/* 점수 - 게임 중에만 표시 */}
        {gameState.gameStarted && <ScoreComponent score={gameState.score} />}

        {/* 테스트/플레이 중 나가기 버튼 */}
        {gameState.gameStarted && !gameState.gameEnded && isTestMode && (
          <button
            onClick={isFromEditor ? handleReturnToEditor : handleReturnToPlayList}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: CHART_EDITOR_THEME.danger,
              color: CHART_EDITOR_THEME.textPrimary,
              border: `1px solid ${CHART_EDITOR_THEME.danger}`,
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              cursor: 'pointer',
              fontWeight: 'bold',
              zIndex: 1000,
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = CHART_EDITOR_THEME.danger;
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ✕ 나가기
          </button>
        )}

        {/* 게임 시작/종료 UI */}
        {!gameState.gameStarted && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 520,
                padding: '0 24px',
                boxSizing: 'border-box',
                textAlign: 'center',
                pointerEvents: 'auto',
              }}
            >
              {/* 히어로 영역 */}
              <div style={{ marginBottom: '32px' }}>
                <h1
                  style={{
                    fontSize: '46px',
                    marginBottom: '12px',
                    marginTop: '-20px',
                    fontWeight: 900,
                    fontStyle: 'italic',
                    letterSpacing: '0.18em',
                    background: CHART_EDITOR_THEME.titleGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    WebkitTextStroke: `3px ${CHART_EDITOR_THEME.rootBackground}`,
                    textShadow: CHART_EDITOR_THEME.titleGlow,
                    fontFamily: 'Arial Black, sans-serif',
                    textTransform: 'uppercase',
                    lineHeight: 1.1,
                  }}
                >
                  UseRhythm
                </h1>
                <p
                  style={{
                    fontSize: '15px',
                    lineHeight: 1.6,
                    color: CHART_EDITOR_THEME.textSecondary,
                  }}
                >
                  누구나 리듬게임 채보를 만들고,
                  <br />
                  친구들과 플레이를 공유해 보세요.
                </p>
              </div>

              {/* 메인 액션 버튼들 */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  marginBottom: 32,
                }}
              >
                {/* 플레이 버튼 */}
                <button
                  style={{
                    padding: '18px 40px',
                    fontSize: '20px',
                    background: CHART_EDITOR_THEME.buttonPrimaryBg,
                    color: CHART_EDITOR_THEME.buttonPrimaryText,
                    border: 'none',
                    borderRadius: CHART_EDITOR_THEME.radiusLg,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.18s ease-out',
                    boxShadow: CHART_EDITOR_THEME.shadowSoft,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      CHART_EDITOR_THEME.buttonPrimaryBgHover;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      CHART_EDITOR_THEME.buttonPrimaryBg;
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  onClick={() => {
                    setIsChartSelectOpen(true);
                  }}
                >
                  ▶️ 플레이
                </button>

                {/* 채보 만들기 버튼 */}
                <button
                  style={{
                    padding: '16px 40px',
                    fontSize: '18px',
                    background: CHART_EDITOR_THEME.ctaButtonGradient,
                    color: CHART_EDITOR_THEME.textPrimary,
                    border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                    borderRadius: CHART_EDITOR_THEME.radiusLg,
                    cursor: canEditCharts ? 'pointer' : 'not-allowed',
                    fontWeight: 'bold',
                    transition: 'all 0.18s ease-out',
                    boxShadow: `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`,
                    opacity: canEditCharts ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => {
                    if (!canEditCharts) return;
                    e.currentTarget.style.background =
                      CHART_EDITOR_THEME.ctaButtonGradientHover;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 6px 16px ${CHART_EDITOR_THEME.accentSoft}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      CHART_EDITOR_THEME.ctaButtonGradient;
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`;
                  }}
                  onClick={() => {
                    if (!ensureEditorAccess()) return;
                    setIsEditorOpen(true);
                  }}
                  title={
                    !canEditCharts && isSupabaseConfigured
                      ? 'Google 로그인 후 이용할 수 있습니다.'
                      : undefined
                  }
                >
                  ✏️ 채보 만들기
                </button>

                {/* 관리자 버튼 (보조 액션) */}
                {canSeeAdminMenu && (
                  <button
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      background: CHART_EDITOR_THEME.ctaButtonGradient,
                      color: CHART_EDITOR_THEME.textPrimary,
                      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      borderRadius: CHART_EDITOR_THEME.radiusMd,
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                      boxShadow: `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 6px 16px ${CHART_EDITOR_THEME.accentSoft}`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`;
                    }}
                    onClick={() => {
                      setIsAdminOpen(true);
                    }}
                  >
                    🔐 관리자
                  </button>
                )}
              </div>

              {/* 로그인/설정 영역 */}
              <div style={{ marginBottom: 24 }}>
                {isSupabaseConfigured && !authUser ? (
                  <button
                    onClick={handleLoginWithGoogle}
                    style={{
                      padding: '10px 20px',
                      fontSize: '14px',
                      background: 'transparent',
                      color: CHART_EDITOR_THEME.textPrimary,
                      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      cursor: 'pointer',
                      marginRight: '8px',
                    }}
                  >
                    🔑 Google 로그인
                  </button>
                ) : authUser ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: CHART_EDITOR_THEME.textSecondary }}>
                      <span>
                        {roleChessIcon} {userDisplayName}
                      </span>
                      {(isAdmin || isModerator) && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.25px',
                            color: isAdmin ? '#fecaca' : '#c7d2fe',
                            background: isAdmin
                              ? 'rgba(239, 68, 68, 0.16)'
                              : 'rgba(56, 189, 248, 0.12)',
                            border: isAdmin
                              ? '1px solid rgba(239, 68, 68, 0.55)'
                              : '1px solid rgba(56, 189, 248, 0.55)',
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                            textTransform: 'uppercase',
                          }}
                        >
                          {isAdmin ? 'ADMIN' : 'MODERATOR'}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setIsSettingsOpen(true)}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        background: 'transparent',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        cursor: 'pointer',
                      }}
                    >
                      ⚙️ 설정
                    </button>
                    <button
                      onClick={handleLogout}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        background: 'transparent',
                        color: CHART_EDITOR_THEME.textSecondary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        cursor: 'pointer',
                      }}
                    >
                      로그아웃
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    style={{
                      padding: '6px 16px',
                      fontSize: '13px',
                      background: CHART_EDITOR_THEME.buttonGhostBg,
                      color: CHART_EDITOR_THEME.textPrimary,
                      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      cursor: 'pointer',
                    }}
                  >
                    ⚙ 설정
                  </button>
                )}
              </div>

              {isSupabaseConfigured && !authUser && (
                <p
                  style={{
                    fontSize: '12px',
                    color: CHART_EDITOR_THEME.textSecondary,
                  }}
                >
                  채보 만들기는 Google 로그인 후 이용할 수 있습니다.
                </p>
              )}
            </div>
          </div>
        )}

        {gameState.gameEnded && (
          isTestMode ? (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: CHART_EDITOR_THEME.textPrimary,
                backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                padding: '32px',
                borderRadius: CHART_EDITOR_THEME.radiusLg,
                minWidth: '360px',
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
              }}
            >
              <h1 style={{ 
                fontSize: '40px', 
                marginBottom: '20px',
                color: CHART_EDITOR_THEME.textPrimary,
              }}>
                테스트 종료
              </h1>
              <div style={{ 
                fontSize: '20px', 
                marginBottom: '28px',
                color: CHART_EDITOR_THEME.textSecondary,
              }}>
                <div>정확도: {accuracy.toFixed(2)}%</div>
                <div>최대 콤보: {gameState.score.maxCombo}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={handleRetest}
                  style={{
                    padding: '14px 24px',
                    fontSize: '18px',
                    background: CHART_EDITOR_THEME.ctaButtonGradient,
                    color: CHART_EDITOR_THEME.textPrimary,
                    border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🔁 다시 테스트
                </button>
                {isFromEditor ? (
                  <button
                    onClick={handleReturnToEditor}
                    style={{
                      padding: '14px 24px',
                      fontSize: '18px',
                      background: CHART_EDITOR_THEME.ctaButtonGradient,
                      color: CHART_EDITOR_THEME.textPrimary,
                      border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                      borderRadius: CHART_EDITOR_THEME.radiusMd,
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    ✏️ 에디터로 돌아가기
                  </button>
                ) : (
                  <button
                    onClick={handleReturnToPlayList}
                    style={{
                      padding: '14px 24px',
                      fontSize: '18px',
                      background: CHART_EDITOR_THEME.ctaButtonGradient,
                      color: CHART_EDITOR_THEME.textPrimary,
                      border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                      borderRadius: CHART_EDITOR_THEME.radiusMd,
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    📋 플레이 목록으로
                  </button>
                )}
                <button
                  onClick={resetGame}
                  style={{
                    padding: '14px 24px',
                    fontSize: '18px',
                    background: 'transparent',
                    color: CHART_EDITOR_THEME.textPrimary,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.surface;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🏠 메인 메뉴
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: CHART_EDITOR_THEME.textPrimary,
                backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                padding: '32px',
                borderRadius: CHART_EDITOR_THEME.radiusLg,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
              }}
            >
              <h1 style={{ 
                fontSize: '48px', 
                marginBottom: '32px',
                color: CHART_EDITOR_THEME.textPrimary,
              }}>
                게임 종료
              </h1>
              <div style={{ 
                fontSize: '24px', 
                marginBottom: '32px',
                color: CHART_EDITOR_THEME.textSecondary,
              }}>
                <div>최대 콤보: {gameState.score.maxCombo}</div>
                <div>정확도: {accuracy.toFixed(2)}%</div>
              </div>
              <button
                onClick={resetGame}
                style={{
                  padding: '16px 32px',
                  fontSize: '24px',
                  background: CHART_EDITOR_THEME.ctaButtonGradient,
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                다시 시작
              </button>
            </div>
          )
        )}
        
        {/* 테스트 모드 YouTube 플레이어 (숨김 - 오디오만 재생) */}
        {isTestMode && testYoutubeVideoId && (
          <div
            ref={testYoutubePlayerRef}
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

      {/* 자막 레이어 (게임 컨테이너 바깥, 16:9 영역으로 확장) */}
      <LyricOverlay activeSubtitles={activeSubtitles} subtitleArea={subtitleArea} />
        </div>
      </div>

      {/* 설정 모달 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        displayName={displayName}
        onDisplayNameChange={setDisplayName}
        onDisplayNameSave={handleDisplayNameSave}
        canChangeDisplayName={canChangeDisplayName}
        nextDisplayNameChangeAt={nextDisplayNameChangeAt}
        keyBindings={keyBindings}
        onKeyBindingChange={handleKeyBindingChange}
        onResetKeyBindings={handleResetKeyBindings}
        noteSpeed={noteSpeed}
        onNoteSpeedChange={setNoteSpeed}
        isBgaEnabled={isBgaEnabled}
        onBgaChange={setIsBgaEnabled}
        currentRoleLabel={currentRoleLabel}
      />
    </VideoRhythmLayout>
  );
};
