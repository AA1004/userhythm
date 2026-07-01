import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api, ApiChart, ApiScore, ApiUserAggregate } from '../lib/api';
import { extractYouTubeVideoId, waitForYouTubeAPI, YOUTUBE_EMBED_HOST } from '../utils/youtube';
import { measureToTime } from '../utils/bpmUtils';
import { validateNotes } from '../utils/noteValidation';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { PREVIEW_TRANSITION_DURATION_MS, PREVIEW_BGA_OPACITY } from '../constants/gameConstants';
import {
  ADMIN_CHART_DIFFICULTY_OPTIONS,
  getChartDifficultyColor,
  getDisplayChartDifficulty,
} from '../constants/chartDifficulty';

interface ChartSelectProps {
  onSelect: (chartData: any) => void;
  onClose: () => void;
  refreshToken?: number; // 외부에서 강제 새로고침 트리거
  isAdmin?: boolean;
  isLoggedIn?: boolean;
  chartStatus?: 'approved' | 'wip';
  onContribute?: (chart: ApiChart) => void;
}

const DEFAULT_THUMBNAIL_ASPECT_RATIO = 16 / 9;
const PREVIEW_VOLUME = 35;

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const parsed = Number.parseInt(value, 16);
  if (Number.isNaN(parsed)) return `rgba(97, 97, 97, ${alpha})`;
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const getDifficultyBadgeVisual = (difficulty?: string | null) => {
  const color = getChartDifficultyColor(difficulty || 'Normal');
  const glow = hexToRgba(color, 0.45);
  const soft = hexToRgba(color, 0.2);
  const deep = hexToRgba(color, 0.08);

  return {
    color,
    background: `linear-gradient(135deg, ${soft}, rgba(8, 12, 24, 0.92) 54%, ${deep})`,
    compactBackground: `linear-gradient(135deg, ${hexToRgba(color, 0.95)}, ${hexToRgba(color, 0.52)})`,
    border: `1px solid ${hexToRgba(color, 0.72)}`,
    shadow: `0 0 18px ${hexToRgba(color, 0.24)}, inset 0 1px 0 rgba(255,255,255,0.16)`,
    textShadow: `0 1px 10px ${glow}`,
  };
};

const preferHighResolutionYouTubeThumbnail = (url: string | null) => {
  if (!url) return null;
  return url.replace(
    /(i\.ytimg\.com|img\.youtube\.com)\/vi\/([^/]+)\/(?:hqdefault|mqdefault|sddefault)\.jpg/,
    '$1/vi/$2/maxresdefault.jpg'
  );
};

const getYouTubeThumbnailFallback = (url: string | null) => {
  if (!url) return null;
  return url.replace(
    /(i\.ytimg\.com|img\.youtube\.com)\/vi\/([^/]+)\/maxresdefault\.jpg/,
    '$1/vi/$2/hqdefault.jpg'
  );
};

export const ChartSelect: React.FC<ChartSelectProps> = ({
  onSelect,
  onClose,
  refreshToken,
  isAdmin = false,
  isLoggedIn = false,
  chartStatus = 'approved',
  onContribute,
}) => {
  const requestControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const [allCharts, setAllCharts] = useState<ApiChart[]>([]);
  const [charts, setCharts] = useState<ApiChart[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'title' | 'author'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedChart, setSelectedChart] = useState<ApiChart | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isDetailExpanded, setIsDetailExpanded] = useState<boolean>(false);
  const [isCardGridCompact] = useState<boolean>(false);
  const [adminDifficultyValue, setAdminDifficultyValue] = useState<string>('');
  const [isDifficultyMenuOpen, setIsDifficultyMenuOpen] = useState<boolean>(false);
  const [isSavingAdminDifficulty, setIsSavingAdminDifficulty] = useState<boolean>(false);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const chartsPerPage = 12;
  const [thumbnailAspectRatios, setThumbnailAspectRatios] = useState<Record<string, number>>({});

  // leaderboards
  const [perChartScores, setPerChartScores] = useState<ApiScore[]>([]);
  const [globalScores, setGlobalScores] = useState<ApiScore[]>([]);
  const [perUserScores, setPerUserScores] = useState<ApiUserAggregate[]>([]);
  const [leaderboardStatus, setLeaderboardStatus] =
    useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  // YouTube preview player (BGA용)
  const bgaContainerRef = useRef<HTMLDivElement | null>(null);
  const previewPlayerHostRef = useRef<HTMLDivElement | null>(null);
  const previewPlayerRef = useRef<any>(null);
  const currentVideoIdRef = useRef<string | null>(null); // 현재 로드된 videoId 추적
  const previewLoopTimerRef = useRef<number | NodeJS.Timeout | null>(null);
  const fadeIntervalRef = useRef<number | NodeJS.Timeout | null>(null);
  const [bgaOpacity, setBgaOpacity] = useState<number>(0);
  const [previewBgaUrl, setPreviewBgaUrl] = useState<string | null>(null);

  useEffect(() => {
    // React 18 StrictMode에서 effect가 즉시 clean-up 되더라도 다시 true로 세팅
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (requestControllerRef.current) {
        requestControllerRef.current.abort();
      }
      // Preview player cleanup
      if (previewLoopTimerRef.current) {
        clearInterval(previewLoopTimerRef.current);
        previewLoopTimerRef.current = null;
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      if (previewPlayerRef.current) {
        try {
          previewPlayerRef.current.pauseVideo?.();
          previewPlayerRef.current.destroy?.();
        } catch (e) {
          // 무시
        }
      }
      if (previewPlayerHostRef.current && previewPlayerHostRef.current.parentNode) {
        previewPlayerHostRef.current.parentNode.removeChild(previewPlayerHostRef.current);
      }
    };
  }, []);

  // 검색 디바운스
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const normalizeCharts = useCallback((loadedCharts: ApiChart[]) => {
    return loadedCharts.map((chart: ApiChart) => {
      let chartData: any = {};
      try {
        chartData = JSON.parse(chart.data_json || '{}');
      } catch {
        chartData = {};
      }

      // author badge info
      const authorChess =
        chart.author_role === 'admin'
          ? '♛'
          : chart.author_role === 'moderator'
          ? '♝'
          : '♟';
      const authorLabel =
        chart.author_nickname ||
        chart.author ||
        chart.author_email_prefix ||
        '알 수 없음';

      // preview image
      let preview = chart.preview_image || null;
      let previewFallback = preview;
      if (!preview) {
        const youtubeUrl: string = chartData.youtubeUrl || chart.youtube_url || '';
        const youtubeVideoId: string | null =
          chartData.youtubeVideoId || (youtubeUrl ? extractYouTubeVideoId(youtubeUrl) : null);
        if (youtubeVideoId) {
          previewFallback = `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`;
          preview = `https://i.ytimg.com/vi/${youtubeVideoId}/maxresdefault.jpg`;
        }
      } else {
        const highResolutionPreview = preferHighResolutionYouTubeThumbnail(preview);
        const maxresFallback = getYouTubeThumbnailFallback(preview);
        previewFallback =
          highResolutionPreview !== preview
            ? preview
            : maxresFallback !== preview
            ? maxresFallback
            : null;
        preview = highResolutionPreview;
      }

      const notes = Array.isArray(chartData.notes) ? chartData.notes : [];
      const holdCount = notes.filter((note: any) => note?.type === 'hold' || Number(note?.duration) > 0).length;
      const subtitleCount = Array.isArray(chartData.subtitles) ? chartData.subtitles.length : 0;
      const bgaEventCount = Array.isArray(chartData.bgaVisibilityIntervals)
        ? chartData.bgaVisibilityIntervals.length
        : 0;
      const isWipChart = chartData.wip?.enabled === true;
      const displayDifficulty = getDisplayChartDifficulty(
        chart.difficulty,
        typeof chartData.adminDifficulty === 'string' ? chartData.adminDifficulty : chart.admin_difficulty
      );

      return {
        ...chart,
        preview_image: preview,
        _previewFallbackImage: previewFallback,
        _authorChess: authorChess,
        _authorLabel: authorLabel,
        _isAdmin: chart.author_role === 'admin',
        _isModerator: chart.author_role === 'moderator',
        _noteCount: notes.length,
        _holdCount: holdCount,
        _subtitleCount: subtitleCount,
        _bgaEventCount: bgaEventCount,
        _hasSubtitles: subtitleCount > 0,
        _hasBgaEvents: bgaEventCount > 0,
        _isWip: isWipChart,
        _wipNote: typeof chartData.wip?.note === 'string' ? chartData.wip.note : '',
        _wipParentChartId: typeof chartData.wip?.parentChartId === 'string' ? chartData.wip.parentChartId : null,
        _adminDifficulty:
          typeof chartData.adminDifficulty === 'string' ? chartData.adminDifficulty : chart.admin_difficulty ?? null,
        _displayDifficulty: displayDifficulty,
      };
    });
  }, []);

  const handleThumbnailLoad = useCallback(
    (chartId: string, event: React.SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

      const nextRatio = image.naturalWidth / image.naturalHeight;
      if (!Number.isFinite(nextRatio) || nextRatio <= 0) return;

      setThumbnailAspectRatios((prev) => {
        if (Math.abs((prev[chartId] ?? 0) - nextRatio) < 0.01) return prev;
        return { ...prev, [chartId]: nextRatio };
      });
    },
    []
  );

  const fetchAllCharts = useCallback(
    async (showLoading: boolean = true) => {
      if (requestControllerRef.current) {
        requestControllerRef.current.abort();
      }
      const controller = new AbortController();
      requestControllerRef.current = controller;

      if (showLoading) setStatus('loading');
      setError(null);

      try {
        const { charts } = await api.getCharts({
          search: searchQuery || undefined,
          sortBy,
          sortOrder,
          limit: 500,
          offset: 0,
          status: chartStatus,
        });
        const normalizedCharts = normalizeCharts(charts as ApiChart[]);
        if (!isMountedRef.current) return;
        setAllCharts(normalizedCharts);
        setStatus('success');
      } catch (error: any) {
        const message = error?.message || '';
        if (error?.name === 'AbortError' || message.toLowerCase().includes('abort')) {
          return;
        }
        console.error('Failed to load charts:', error);
        if (!isMountedRef.current) return;
        setStatus('error');
        setError(message || '채보 목록을 불러오는데 실패했습니다.');
        setAllCharts([]);
        setCharts([]);
        setHasMore(false);
        setTotalCount(0);
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
        setIsLoadingMore(false);
      }
    },
    [normalizeCharts, searchQuery, sortBy, sortOrder, chartStatus]
  );

  const fetchLeaderboards = useCallback(
    async (chartId?: string) => {
      setLeaderboardStatus('loading');
      setLeaderboardError(null);
      try {
        const data = await api.getLeaderboard(chartId);
        setPerChartScores(data.perChart || []);
        setGlobalScores(data.global || []);
        setPerUserScores(data.perUser || []);
        setLeaderboardStatus('success');
      } catch (e: any) {
        console.error('Failed to load leaderboard:', e);
        setPerChartScores([]);
        setGlobalScores([]);
        setPerUserScores([]);
        setLeaderboardStatus('error');
        setLeaderboardError(e?.message || '리더보드를 불러오지 못했습니다.');
      }
    },
    []
  );

  // 최초 로드 및 새로고침 버튼/외부 트리거 시 호출
  useEffect(() => {
    fetchAllCharts(true);
    if (chartStatus === 'approved') {
      fetchLeaderboards();
    } else {
      setPerChartScores([]);
      setGlobalScores([]);
      setPerUserScores([]);
      setLeaderboardStatus('success');
      setLeaderboardError(null);
    }
  }, [fetchAllCharts, fetchLeaderboards, chartStatus]);

  // 외부 트리거로 새로고침
  useEffect(() => {
    if (refreshToken === undefined) return;
    fetchAllCharts(true);
    if (chartStatus === 'approved') {
      fetchLeaderboards(selectedChart?.id);
    }
  }, [refreshToken, fetchAllCharts, fetchLeaderboards, selectedChart?.id, chartStatus]);

  // 검색/정렬 변경 시 페이지 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, sortOrder]);

  const filteredCharts = useMemo(() => {
    const keyword = searchQuery.toLowerCase();
    let list = allCharts;
    if (keyword) {
      list = list.filter(
        (c) =>
          c.title?.toLowerCase().includes(keyword) ||
          c.author?.toLowerCase().includes(keyword) ||
          c.description?.toLowerCase?.().includes(keyword)
      );
    }
    const sorted = [...list].sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title) * dir;
      }
      return ((a as any)._authorLabel || a.author || '').localeCompare(
        (b as any)._authorLabel || b.author || ''
      ) * dir;
    });
    return sorted;
  }, [allCharts, searchQuery, sortBy, sortOrder]);

  // 페이지네이션 적용
  useEffect(() => {
    const slice = filteredCharts.slice(0, currentPage * chartsPerPage);
    setCharts(slice);
    setTotalCount(filteredCharts.length);
    setHasMore(slice.length < filteredCharts.length);
    if (status === 'idle') {
      setStatus('success');
    }
  }, [filteredCharts, currentPage, chartsPerPage, status]);

  useEffect(() => {
    if (!selectedChart) return;
    const refreshedSelectedChart = allCharts.find((chart) => chart.id === selectedChart.id);
    if (!refreshedSelectedChart) return;
    if (refreshedSelectedChart === selectedChart) return;
    if (
      refreshedSelectedChart.data_json === selectedChart.data_json &&
      refreshedSelectedChart.preview_image === selectedChart.preview_image &&
      refreshedSelectedChart.updated_at === selectedChart.updated_at
    ) {
      return;
    }
    setSelectedChart(refreshedSelectedChart);
  }, [allCharts, selectedChart]);

  useEffect(() => {
    // when selected chart changes, load per-chart leaderboard
    if (chartStatus !== 'approved') {
      setPerChartScores([]);
      return;
    }
    if (selectedChart) {
      fetchLeaderboards(selectedChart.id);
    } else {
      setPerChartScores([]);
    }
  }, [selectedChart, fetchLeaderboards, chartStatus]);

  useEffect(() => {
    const handleLeaderboardUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ chartId?: string }>;
      const updatedChartId = customEvent.detail?.chartId;
      if (chartStatus !== 'approved') return;
      fetchLeaderboards(selectedChart?.id ?? updatedChartId);
    };

    window.addEventListener('userhythm:leaderboard-updated', handleLeaderboardUpdated as EventListener);
    return () => {
      window.removeEventListener('userhythm:leaderboard-updated', handleLeaderboardUpdated as EventListener);
    };
  }, [fetchLeaderboards, selectedChart, chartStatus]);

  useEffect(() => {
    if (!selectedChart) {
      setAdminDifficultyValue('');
      setIsDifficultyMenuOpen(false);
      return;
    }
    setAdminDifficultyValue(((selectedChart as any)._adminDifficulty as string | null) || '');
    setIsDifficultyMenuOpen(false);
    setIsDetailExpanded(false);
  }, [selectedChart]);

  const handleSaveAdminDifficulty = useCallback(async () => {
    if (!selectedChart || !isAdmin || isSavingAdminDifficulty) return;

    setIsSavingAdminDifficulty(true);
    try {
      const parsed = JSON.parse(selectedChart.data_json || '{}');
      if (adminDifficultyValue.trim()) {
        parsed.adminDifficulty = adminDifficultyValue.trim();
      } else {
        delete parsed.adminDifficulty;
      }

      const result = await api.updateChart(selectedChart.id, {
        title: selectedChart.title,
        bpm: selectedChart.bpm,
        dataJson: JSON.stringify(parsed),
        youtubeUrl: selectedChart.youtube_url ?? undefined,
        description: selectedChart.description ?? undefined,
        difficulty: selectedChart.difficulty ?? undefined,
        previewImage: selectedChart.preview_image ?? undefined,
      });

      const [nextChart] = normalizeCharts([result.chart as ApiChart]);
      if (!nextChart) return;

      setAllCharts((prev) => prev.map((chart) => (chart.id === nextChart.id ? nextChart : chart)));
      setCharts((prev) => prev.map((chart) => (chart.id === nextChart.id ? nextChart : chart)));
      setSelectedChart(nextChart);
    } catch (error) {
      console.error('Failed to save admin difficulty:', error);
      alert('관리자 난이도 저장에 실패했습니다.');
    } finally {
      setIsSavingAdminDifficulty(false);
    }
  }, [adminDifficultyValue, isAdmin, isSavingAdminDifficulty, normalizeCharts, selectedChart]);

  // 플레이어로 미리듣기 시작하는 함수
  const startPreviewPlayback = (player: any, previewStartSec: number, previewEndSec: number) => {
    // 기존 타이머 정리
    if (previewLoopTimerRef.current) {
      clearInterval(previewLoopTimerRef.current);
      previewLoopTimerRef.current = null;
    }
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    try {
      player.setVolume?.(PREVIEW_VOLUME);
      player.unMute?.();
      player.seekTo(previewStartSec, true);
      player.playVideo();

      // BGA 페이드 인
      setBgaOpacity(PREVIEW_BGA_OPACITY);

      previewLoopTimerRef.current = setInterval(() => {
        try {
          const currentTime = player.getCurrentTime?.();
          if (currentTime === undefined) return;

          // 루프 시점
          if (currentTime >= previewEndSec - 0.05) {
            player.seekTo(previewStartSec, true);
            player.setVolume?.(PREVIEW_VOLUME);
            player.unMute?.();
            player.playVideo?.();
          }
        } catch (e) {
          // 무시
        }
      }, 50);
    } catch (e) {
      console.warn('Preview player 설정 실패:', e);
    }
  };

  // YouTube preview player 초기화 및 하이라이트 루프
  useEffect(() => {
    // 기존 타이머 정리
    if (previewLoopTimerRef.current) {
      clearInterval(previewLoopTimerRef.current);
      previewLoopTimerRef.current = null;
    }

    // 기존 재생 정지
    if (previewPlayerRef.current) {
      try {
        previewPlayerRef.current.pauseVideo?.();
      } catch (e) {
        // 무시
      }
    }

    if (!selectedChart) {
      // 페이드 아웃 후 정리
      setBgaOpacity(0);
      setPreviewBgaUrl(null);
      return;
    }

    try {
      const chartData = JSON.parse(selectedChart.data_json);
      const youtubeVideoId = chartData.youtubeVideoId || (chartData.youtubeUrl ? extractYouTubeVideoId(chartData.youtubeUrl) : null);

      if (!youtubeVideoId) {
        setBgaOpacity(0);
        setPreviewBgaUrl(null);
        return;
      }

      // BGA 배경 이미지 설정 (YouTube 썸네일) - 영상 로딩 전 fallback
      setPreviewBgaUrl(`https://i.ytimg.com/vi/${youtubeVideoId}/maxresdefault.jpg`);

      // 하이라이트 구간 파싱
      const beatsPerMeasure = Number(chartData.beatsPerMeasure ?? chartData.timeSignatures?.[0]?.beatsPerMeasure ?? 4);
      const bpmChanges = Array.isArray(chartData.bpmChanges) ? chartData.bpmChanges : [];
      const previewStartMeasure = Math.max(1, Number(chartData.previewStartMeasure ?? 1));
      const previewEndMeasure = Math.max(previewStartMeasure + 1, Number(chartData.previewEndMeasure ?? (previewStartMeasure + 4)));

      // measure를 ms로 변환
      const previewStartMs = measureToTime(previewStartMeasure, selectedChart.bpm, bpmChanges, beatsPerMeasure);
      let previewEndMs = measureToTime(previewEndMeasure, selectedChart.bpm, bpmChanges, beatsPerMeasure);
      if (previewEndMs <= previewStartMs) {
        previewEndMs = previewStartMs + 15000;
      }

      const previewStartSec = previewStartMs / 1000;
      const previewEndSec = previewEndMs / 1000;

      // 같은 videoId면 기존 플레이어 재사용
      if (currentVideoIdRef.current === youtubeVideoId && previewPlayerRef.current) {
        startPreviewPlayback(previewPlayerRef.current, previewStartSec, previewEndSec);
        return;
      }

      // 다른 videoId면 기존 플레이어 destroy
      if (previewPlayerRef.current && currentVideoIdRef.current !== youtubeVideoId) {
        try {
          previewPlayerRef.current.destroy?.();
        } catch (e) {
          // 무시
        }
        previewPlayerRef.current = null;
        currentVideoIdRef.current = null;
      }

      // YouTube API 대기 후 플레이어 초기화
      waitForYouTubeAPI().then(() => {
        if (!window.YT || !window.YT.Player) {
          console.error('YouTube IFrame API를 로드하지 못했습니다.');
          return;
        }

        // BGA 컨테이너가 있으면 그 안에 플레이어 생성 (화면에 표시되도록)
        // 없으면 fallback으로 숨김 host 생성
        if (!bgaContainerRef.current) {
          if (!previewPlayerHostRef.current) {
            const hostDiv = document.createElement('div');
            hostDiv.style.position = 'absolute';
            hostDiv.style.left = '-10000px';
            hostDiv.style.top = '-10000px';
            hostDiv.style.width = '1px';
            hostDiv.style.height = '1px';
            hostDiv.style.overflow = 'hidden';
            hostDiv.style.pointerEvents = 'none';
            document.body.appendChild(hostDiv);
            previewPlayerHostRef.current = hostDiv;
          }
        }

        const container = bgaContainerRef.current || previewPlayerHostRef.current;
        if (!container) return;

        const mountNode = document.createElement('div');
        mountNode.id = `preview-youtube-player-${Date.now()}`;
        container.innerHTML = '';
        container.appendChild(mountNode);

        try {
          new window.YT.Player(mountNode as any, {
            videoId: youtubeVideoId,
            host: YOUTUBE_EMBED_HOST,
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: 0,
              controls: 0,
              mute: 0,
              enablejsapi: 1,
              modestbranding: 1,
              rel: 0,
              showinfo: 0,
              iv_load_policy: 3, // 주석 숨기기
            },
            events: {
              onReady: (event: any) => {
                const player = event.target;
                previewPlayerRef.current = player;
                currentVideoIdRef.current = youtubeVideoId;
                try {
                  player.setVolume?.(PREVIEW_VOLUME);
                  player.unMute?.();
                } catch {
                  // ignore
                }

                // iframe 크기 100%로 설정
                const iframe = player.getIframe?.();
                if (iframe) {
                  iframe.style.width = '100%';
                  iframe.style.height = '100%';
                }

                startPreviewPlayback(player, previewStartSec, previewEndSec);
              },
            },
          } as any);
        } catch (e) {
          console.error('Preview player 생성 실패:', e);
        }
      });
    } catch (error) {
      console.error('Preview 초기화 실패:', error);
    }

    return () => {
      // cleanup - 타이머만 정리, 플레이어는 유지 (재사용을 위해)
      if (previewLoopTimerRef.current) {
        clearInterval(previewLoopTimerRef.current);
        previewLoopTimerRef.current = null;
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      if (previewPlayerRef.current) {
        try {
          previewPlayerRef.current.pauseVideo?.();
        } catch (e) {
          // 무시
        }
      }
    };
  }, [selectedChart]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    const next = currentPage + 1;
    setCurrentPage(next);
  }, [currentPage, hasMore, isLoadingMore]);

  const handleSelectChart = (chart: ApiChart) => {
    // Preview 플레이어 정리 - 게임에서 새 플레이어를 생성하므로 여기서 파괴
    if (previewLoopTimerRef.current) {
      clearInterval(previewLoopTimerRef.current);
      previewLoopTimerRef.current = null;
    }
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    if (previewPlayerRef.current) {
      try {
        previewPlayerRef.current.pauseVideo?.();
        previewPlayerRef.current.destroy?.();
      } catch (e) {
        // 무시
      }
      previewPlayerRef.current = null;
    }

    try {
      const chartData = JSON.parse(chart.data_json);

      // YouTube 정보 정규화
      const youtubeUrl: string = chartData.youtubeUrl || chart.youtube_url || '';
      let youtubeVideoId: string | null = chartData.youtubeVideoId || null;

      // 예전 채보처럼 videoId가 없고 URL만 있는 경우, URL에서 ID를 추출
      if (!youtubeVideoId && youtubeUrl) {
        youtubeVideoId = extractYouTubeVideoId(youtubeUrl);
      }

      const playableNotes = Array.isArray(chartData.notes) ? validateNotes(chartData.notes) : [];

      onSelect({
        notes: playableNotes,
        bpm: chart.bpm,
        timeSignatures: chartData.timeSignatures || [{ id: 0, beatIndex: 0, beatsPerMeasure: 4 }],
        timeSignatureOffset: chartData.timeSignatureOffset || 0,
        speedChanges: chartData.speedChanges || [],
        bgaVisibilityIntervals: chartData.bgaVisibilityIntervals || [],
        subtitles: chartData.subtitles || [],
        subtitleTracks: chartData.subtitleTracks || [],
        timelineExtraMs: typeof chartData.timelineExtraMs === 'number' ? chartData.timelineExtraMs : 0,
        audioOffsetMs: typeof chartData.audioOffsetMs === 'number' ? chartData.audioOffsetMs : 0,
        startDelayMs: typeof chartData.startDelayMs === 'number' ? Math.max(0, Math.round(chartData.startDelayMs)) : undefined,
        beatsPerMeasure: typeof chartData.beatsPerMeasure === 'number' ? chartData.beatsPerMeasure : 4,
        youtubeVideoId,
        youtubeUrl,
        playbackSpeed: chartData.playbackSpeed || 1,
        chartId: chartStatus === 'approved' ? chart.id : undefined,
        sourceChartId: chart.id,
        isWorkInProgress: chartStatus === 'wip',
        chartTitle: chart.title,
        chartAuthor: (chart as any)._authorLabel || chart.author,
      });
    } catch (error) {
      console.error('Failed to parse chart data:', error);
      alert('채보 데이터를 불러오는데 실패했습니다.');
    }
  };

  const hasSelectedChart = Boolean(selectedChart);
  const currentDifficultyDisplay = adminDifficultyValue || ((selectedChart as any)?._displayDifficulty as string | undefined) || '미지정';
  const currentDifficultyColor = getChartDifficultyColor(currentDifficultyDisplay === '미지정' ? 'Normal' : currentDifficultyDisplay);
  const currentDifficultyVisual = getDifficultyBadgeVisual(currentDifficultyDisplay === '미지정' ? 'Normal' : currentDifficultyDisplay);
  const leaderboardHint =
    chartStatus === 'wip'
      ? '제작 중인 채보는 테스트 플레이만 가능하며 리더보드와 플레이 횟수에 반영되지 않습니다.'
      : leaderboardStatus === 'error'
      ? leaderboardError || '리더보드를 불러오지 못했습니다.'
      : !isLoggedIn
      ? '로그인 후 일반 플레이를 완료해야 기록이 반영됩니다.'
      : '일반 플레이 완료 기록만 반영됩니다. 에디터/관리자 테스트는 제외됩니다.';

  const renderDifficultyFact = () => (
    <div className="chart-select-detail-panel__fact">
      <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '8px' }}>난이도</div>
      {isAdmin ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <button
              type="button"
              onClick={() => setIsDifficultyMenuOpen((prev) => !prev)}
              style={{
                width: '100%',
                padding: '10px 13px',
                borderRadius: '14px',
                border: currentDifficultyVisual.border,
                background: currentDifficultyVisual.background,
                color: '#f8fafc',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                boxShadow: currentDifficultyVisual.shadow,
                textShadow: currentDifficultyVisual.textShadow,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '999px',
                    background: currentDifficultyColor,
                    boxShadow: `0 0 12px ${currentDifficultyColor}`,
                  }}
                />
                {currentDifficultyDisplay}
              </span>
              <span style={{ fontSize: '11px', opacity: 0.9 }}>{isDifficultyMenuOpen ? '▲' : '▼'}</span>
            </button>
            {isDifficultyMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  padding: '8px',
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  background: 'rgba(8, 12, 24, 0.98)',
                  boxShadow: CHART_EDITOR_THEME.shadowSoft,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
                  gap: '6px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAdminDifficultyValue('');
                    setIsDifficultyMenuOpen(false);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: CHART_EDITOR_THEME.buttonGhostBg,
                    color: CHART_EDITOR_THEME.textSecondary,
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  미지정
                </button>
                {ADMIN_CHART_DIFFICULTY_OPTIONS.map((value) => {
                  const visual = getDifficultyBadgeVisual(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setAdminDifficultyValue(value);
                        setIsDifficultyMenuOpen(false);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '12px',
                        border: visual.border,
                        background: visual.background,
                        color: '#f8fafc',
                        cursor: 'pointer',
                        fontWeight: 900,
                        letterSpacing: '0.03em',
                        boxShadow: visual.shadow,
                        textShadow: visual.textShadow,
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            onClick={handleSaveAdminDifficulty}
            disabled={isSavingAdminDifficulty}
            style={{
              padding: '9px 12px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: 'none',
              background: CHART_EDITOR_THEME.buttonPrimaryBg,
              color: CHART_EDITOR_THEME.buttonPrimaryText,
              cursor: isSavingAdminDifficulty ? 'wait' : 'pointer',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {isSavingAdminDifficulty ? '저장 중' : '저장'}
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 13px',
            borderRadius: 999,
            border: currentDifficultyVisual.border,
            background: currentDifficultyVisual.background,
            color: '#f8fafc',
            fontSize: '15px',
            fontWeight: 900,
            boxShadow: currentDifficultyVisual.shadow,
            textShadow: currentDifficultyVisual.textShadow,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '999px',
              background: currentDifficultyColor,
              boxShadow: `0 0 12px ${currentDifficultyColor}`,
            }}
          />
          {currentDifficultyDisplay}
        </div>
      )}
    </div>
  );

  const renderWipNote = () => {
    const wipNote = ((selectedChart as any)?._wipNote || '').trim();
    if (chartStatus !== 'wip' || !wipNote) return null;
    return (
      <div
        className="chart-select-detail-panel__fact chart-select-detail-panel__fact--wide"
        style={{
          marginTop: '12px',
          padding: '14px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          border: '1px solid rgba(251, 191, 36, 0.32)',
          background: 'rgba(251, 191, 36, 0.1)',
        }}
      >
        <div style={{ color: '#fde68a', fontSize: '12px', marginBottom: '8px', letterSpacing: '0.08em', fontWeight: 800 }}>WIP MEMO</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px', lineHeight: 1.6 }}>
          {wipNote}
        </div>
      </div>
    );
  };

  const renderDetailFacts = () => (
    <div
      className="chart-select-detail-panel__facts"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))',
        gap: '8px',
      }}
    >
      <div className="chart-select-detail-panel__fact">
        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>작성자</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span>{(selectedChart as any)?._authorChess || '♟'}</span>
          <span
            style={{
              fontWeight: (selectedChart as any)?._isAdmin ? 'bold' : undefined,
              color: (selectedChart as any)?._isAdmin ? '#f87171' : undefined,
            }}
          >
            {(selectedChart as any)?._authorLabel || selectedChart?.author}
          </span>
          {(selectedChart as any)?._isAdmin && (
            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', backgroundColor: '#b91c1c', color: '#fff' }}>
              ADMIN
            </span>
          )}
        </div>
      </div>
      <div className="chart-select-detail-panel__fact">
        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>BPM</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px' }}>{selectedChart?.bpm}</div>
      </div>
      {renderDifficultyFact()}
      <div className="chart-select-detail-panel__fact">
        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>플레이 횟수</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px' }}>{selectedChart?.play_count}</div>
      </div>
      <div className="chart-select-detail-panel__fact">
        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>노트 수</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px' }}>
          {(selectedChart as any)?._noteCount ?? 0}
        </div>
      </div>
      <div className="chart-select-detail-panel__fact">
        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>롱노트</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px' }}>
          {(selectedChart as any)?._holdCount ?? 0}
        </div>
      </div>
      <div className="chart-select-detail-panel__fact">
        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>자막</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px' }}>
          {(selectedChart as any)?._subtitleCount > 0
            ? `${(selectedChart as any)?._subtitleCount}개`
            : '없음'}
        </div>
      </div>
      <div className="chart-select-detail-panel__fact">
        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>BGA 연출</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px' }}>
          {(selectedChart as any)?._bgaEventCount > 0
            ? `${(selectedChart as any)?._bgaEventCount}개`
            : '없음'}
        </div>
      </div>
      {selectedChart?.youtube_url && (
        <div className="chart-select-detail-panel__fact chart-select-detail-panel__fact--wide">
          <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>YouTube</div>
          <a
            href={selectedChart.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: CHART_EDITOR_THEME.accentStrong, fontSize: '14px', wordBreak: 'break-all' }}
          >
            링크 열기
          </a>
        </div>
      )}
      <div className="chart-select-detail-panel__fact">
        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '4px' }}>업로드 일시</div>
        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '12px' }}>
          {selectedChart?.created_at
            ? new Date(selectedChart.created_at).toLocaleString('ko-KR')
            : '정보 없음'}
        </div>
      </div>
    </div>
  );

  const renderDetailLeaderboard = () => (
    <div className="chart-select-leaderboard" style={{ marginTop: '20px' }}>
      <h3 className="chart-select-leaderboard__title" style={{ color: CHART_EDITOR_THEME.textPrimary, marginBottom: '10px' }}>정확도 리더보드</h3>
      <div style={{ color: leaderboardStatus === 'error' ? '#fca5a5' : CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '10px' }}>
        {leaderboardHint}
      </div>
      <div className="chart-select-leaderboard__grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <div>
          <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '6px' }}>
            곡별 상위 기록 (현재 선택)
          </div>
          <LeaderboardList scores={perChartScores} emptyText={leaderboardStatus === 'loading' ? '불러오는 중...' : '데이터 없음'} />
        </div>
        <div>
          <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '6px' }}>
            글로벌 상위 기록
          </div>
          <LeaderboardList scores={globalScores} emptyText={leaderboardStatus === 'loading' ? '불러오는 중...' : '데이터 없음'} />
        </div>
        <div>
          <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '6px' }}>
            사용자별 평균 정확도
          </div>
          <UserLeaderboardList entries={perUserScores} emptyText={leaderboardStatus === 'loading' ? '불러오는 중...' : '데이터 없음'} />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="chart-select-screen"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--ur-stage-background)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
        overflow: 'hidden',
      }}
    >
      {/* 미리듣기 BGA 배경 (YouTube 영상) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          opacity: bgaOpacity,
          transition: `opacity ${PREVIEW_TRANSITION_DURATION_MS}ms ease-in-out`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {/* YouTube 플레이어 컨테이너 */}
        <div
          ref={bgaContainerRef}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '177.78vh', // 16:9 비율 유지
            height: '100vh',
            minWidth: '100%',
            minHeight: '56.25vw',
          }}
        />
        {/* 영상 로딩 전 fallback 이미지 */}
        {previewBgaUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${previewBgaUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              zIndex: -1,
            }}
          />
        )}
      </div>

      {/* 백그라운드 네온 패턴 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.08), transparent 22%), radial-gradient(circle at 80% 10%, rgba(129,140,248,0.1), transparent 24%), radial-gradient(circle at 70% 80%, rgba(34,211,238,0.06), transparent 22%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(120deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 40%, transparent 60%), linear-gradient(0deg, rgba(255,255,255,0.03) 0%, transparent 50%)',
          mixBlendMode: 'screen',
          opacity: 0.7,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* 헤더 */}
      <div
        className="chart-select-header"
        style={{
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          padding: '20px',
          borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          boxShadow: CHART_EDITOR_THEME.shadowSoft,
          position: 'relative',
          overflow: 'hidden',
          zIndex: 2,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(129,140,248,0.12))',
            opacity: 0.7,
            pointerEvents: 'none', // 인터랙션 막지 않도록
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', position: 'relative', zIndex: 1 }}>
          <div>
            <h1
              className="chart-select-title"
              style={{
                color: CHART_EDITOR_THEME.textPrimary,
                fontSize: '24px',
                margin: 0,
                letterSpacing: '0.05em',
                textShadow: CHART_EDITOR_THEME.titleGlow,
              }}
            >
              {chartStatus === 'wip' ? '제작 중인 채보' : '채보 선택하기'}
            </h1>
            {chartStatus === 'wip' && (
              <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginTop: '6px' }}>
                완성 전 채보를 플레이해 보고 이어 만들 수 있는 목록입니다.
              </div>
            )}
          </div>
          <span
            className="chart-select-count"
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: CHART_EDITOR_THEME.buttonGhostBgHover,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              color: CHART_EDITOR_THEME.textSecondary,
              fontSize: '12px',
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
            }}
          >
            {chartStatus === 'wip' ? 'WIP' : '승인됨'} {totalCount}곡
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="chart-select-toolbar-button"
              onClick={() => {
                setCurrentPage(1);
                setHasMore(true);
                fetchAllCharts(true);
              }}
              disabled={status === 'loading'}
              title="최신 데이터 불러오기"
              style={{
                padding: '10px 14px',
                fontSize: '13px',
                background: CHART_EDITOR_THEME.buttonGhostBg,
                color: CHART_EDITOR_THEME.textSecondary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                cursor: status === 'loading' ? 'wait' : 'pointer',
                transition: 'all 0.15s ease-out',
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
                opacity: status === 'loading' ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (status !== 'loading') e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBg;
              }}
            >
              🔄 새로고침
            </button>
            <button
              className="chart-select-toolbar-button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                fontSize: '13px',
                background: CHART_EDITOR_THEME.buttonGhostBg,
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                cursor: 'pointer',
                transition: 'all 0.15s ease-out',
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBg;
              }}
            >
              닫기
            </button>
          </div>
        </div>

      </div>

      {/* 메인 컨텐츠 */}
      <div className="chart-select-main" style={{ flex: 1, overflow: 'hidden', position: 'relative', zIndex: 2 }}>
        <div
          className="chart-select-list-panel"
          style={{
            height: '100%',
            overflowY: 'hidden',
            padding: '24px 28px 36px',
            background: 'linear-gradient(180deg, rgba(15,23,42,0.45), rgba(15,23,42,0.8))',
            transition: 'background 0.6s ease',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1560px',
              margin: '0 auto',
              height: '100%',
              display: 'grid',
              gridTemplateColumns: hasSelectedChart ? 'minmax(0, 1fr) minmax(340px, 400px)' : 'minmax(0, 1fr)',
              gap: hasSelectedChart ? '20px' : '0',
              minHeight: 0,
              alignItems: 'stretch',
            }}
          >
            <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div
              className="chart-select-filter"
              style={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: '10px',
                alignItems: 'center',
                marginBottom: '18px',
                padding: '10px',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                border: '1px solid rgba(59,130,246,0.12)',
                background: 'linear-gradient(135deg, rgba(8,12,24,0.7), rgba(20,33,61,0.54))',
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
              }}
            >
              <button
                type="button"
                aria-label="검색"
                onClick={() => setIsSearchOpen((prev) => !prev)}
                style={{
                  width: '42px',
                  height: '42px',
                  flex: '0 0 42px',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${isSearchOpen || searchQuery ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle}`,
                  background: isSearchOpen || searchQuery ? 'rgba(34,211,238,0.16)' : CHART_EDITOR_THEME.buttonGhostBg,
                  color: CHART_EDITOR_THEME.textPrimary,
                  cursor: 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                }}
              >
                🔍
              </button>
              {isSearchOpen && (
                <input
                  className="chart-select-search"
                  type="text"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="제목 또는 작성자"
                  autoFocus
                  style={{
                    width: 'min(360px, 42vw)',
                    padding: '12px 14px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
                    backgroundColor: CHART_EDITOR_THEME.inputBg,
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '14px',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  }}
                />
              )}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flex: '0 0 auto' }}>
                <div>
                  <select
                    className="chart-select-sort"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as any);
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: '12px 12px',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
                      backgroundColor: CHART_EDITOR_THEME.inputBg,
                      color: CHART_EDITOR_THEME.textPrimary,
                      fontSize: '14px',
                    }}
                  >
                    <option value="title">제목순</option>
                    <option value="author">작성자순</option>
                  </select>
                </div>
                <button
                  className="chart-select-sort-order"
                  onClick={() => {
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '12px 15px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    backgroundColor: CHART_EDITOR_THEME.buttonGhostBg,
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-out',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBgHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBg;
                  }}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
              <div style={{ marginLeft: 'auto', color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px' }}>
                총 {(totalCount || charts.length)}개의 채보
              </div>
            </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              paddingRight: hasSelectedChart ? '10px' : '6px',
              paddingBottom: '20px',
            }}
          >
          {status === 'loading' ? (
            <div className="chart-list-loading" role="status" aria-live="polite">
              <div className="chart-list-loading__orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <strong>곡 목록 동기화 중</strong>
              <p>
                Railway 서버에서 최신 {chartStatus === 'wip' ? '제작 중인' : '공개'} 채보를 불러오고 있습니다.
              </p>
            </div>
          ) : error ? (
            <div className="chart-select-empty chart-select-empty--error" style={{ color: CHART_EDITOR_THEME.danger, textAlign: 'center', padding: '40px' }}>
              <div style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 'bold', color: CHART_EDITOR_THEME.textPrimary }}>
                오류가 발생했습니다
              </div>
              <div style={{ marginBottom: '20px', fontSize: '14px', color: CHART_EDITOR_THEME.textSecondary }}>
                {error}
              </div>
              <button
                className="chart-select-retry-button"
                onClick={() => fetchAllCharts(true)}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  background: CHART_EDITOR_THEME.buttonPrimaryBg,
                  color: CHART_EDITOR_THEME.buttonPrimaryText,
                  border: 'none',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  cursor: 'pointer',
                  boxShadow: CHART_EDITOR_THEME.shadowSoft,
                }}
              >
                다시 시도
              </button>
            </div>
          ) : charts.length === 0 ? (
            <div className="chart-select-empty" style={{ color: CHART_EDITOR_THEME.textSecondary, textAlign: 'center', padding: '40px' }}>
              {searchQuery
                ? '검색 결과가 없습니다.'
                : chartStatus === 'wip'
                ? '제작 중인 채보가 없습니다.'
                : '공개된 채보가 없습니다.'}
            </div>
          ) : (
            <div
              className="chart-select-list-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: isCardGridCompact
                  ? 'repeat(auto-fill, minmax(220px, 1fr))'
                  : 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: isCardGridCompact ? '12px' : '16px',
                overflowY: 'visible',
              }}
            >
              {charts.map((chart, index) => {
                const displayDifficulty = (chart as any)._displayDifficulty || chart.difficulty || 'Normal';
                const difficultyVisual = getDifficultyBadgeVisual(displayDifficulty);
                return (
                <div
                  key={chart.id}
                  className={`chart-select-card${selectedChart?.id === chart.id ? ' chart-select-card--selected' : ''}`}
                  onClick={() => {
                    setSelectedChart(chart);
                  }}
                  style={{
                    animationDelay: `${Math.min(index, 11) * 36}ms`,
                    background: selectedChart?.id === chart.id
                      ? 'linear-gradient(145deg, rgba(34,211,238,0.18), rgba(129,140,248,0.16))'
                      : 'rgba(2,6,23,0.38)',
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    padding: '0',
                    cursor: 'pointer',
                    border: selectedChart?.id === chart.id
                      ? `1px solid ${CHART_EDITOR_THEME.accentStrong}`
                      : `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    transition: 'all 0.2s ease-out',
                    boxShadow: selectedChart?.id === chart.id
                      ? CHART_EDITOR_THEME.shadowStrong
                      : '0 16px 34px rgba(0,0,0,0.24)',
                    minHeight: 'auto',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedChart?.id !== chart.id) {
                      e.currentTarget.style.background = 'rgba(15,23,42,0.56)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedChart?.id !== chart.id) {
                      e.currentTarget.style.background = 'rgba(2,6,23,0.38)';
                    }
                  }}
                >
                  {selectedChart?.id === chart.id && (
                    <div className="chart-select-card__now" aria-hidden="true">
                      <span>PREVIEW</span>
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                  {chart.preview_image ? (
                    <div
                      className="chart-select-card__thumb"
                      style={{
                        width: '100%',
                        aspectRatio: String(
                          thumbnailAspectRatios[chart.id] ?? DEFAULT_THUMBNAIL_ASPECT_RATIO
                        ),
                        marginBottom: 0,
                        borderRadius: 0,
                        overflow: 'hidden',
                        backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                      }}
                    >
                      <img
                        className="chart-select-card__image"
                        src={chart.preview_image}
                        alt={chart.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          filter: selectedChart?.id === chart.id ? 'saturate(1.12)' : 'saturate(0.9)',
                        }}
                        loading="lazy"
                        onLoad={(e) => handleThumbnailLoad(chart.id, e)}
                        onError={(e) => {
                          const fallbackSrc = (chart as any)._previewFallbackImage;
                          if (fallbackSrc && e.currentTarget.src !== fallbackSrc) {
                            e.currentTarget.src = fallbackSrc;
                            return;
                          }
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="chart-select-card__thumb chart-select-card__thumb--empty"
                      style={{
                        width: '100%',
                          height: isCardGridCompact ? '132px' : '180px',
                          marginBottom: 0,
                          borderRadius: 0,
                          background:
                            'linear-gradient(135deg, rgba(56, 189, 248, 0.16), rgba(129, 140, 248, 0.12))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                          color: CHART_EDITOR_THEME.textSecondary,
                          fontSize: '12px',
                          border: `1px dashed ${CHART_EDITOR_THEME.borderSubtle}`,
                      }}
                    >
                      이미지 없음
                    </div>
                  )}
                  <div
                    className="chart-select-card__overlay"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      padding: '46px 14px 13px',
                      background: [
                        'linear-gradient(180deg, transparent 0%, rgba(2,6,23,0.38) 34%, rgba(2,6,23,0.84) 78%, rgba(2,6,23,0.96) 100%)',
                        'linear-gradient(90deg, rgba(0,0,0,0.52), transparent 58%)',
                      ].join(', '),
                      display: 'block',
                      textShadow: '0 2px 10px rgba(0,0,0,0.85)',
                    }}
                  >
                    <div
                      style={{
                        color: CHART_EDITOR_THEME.textPrimary,
                        fontSize: isCardGridCompact ? '13px' : '15px',
                        fontWeight: 900,
                        lineHeight: 1.18,
                        minWidth: 0,
                        maxWidth: 'calc(100% - 58px)',
                        padding: '7px 9px 8px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, rgba(2,6,23,0.68), rgba(15,23,42,0.34))',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'keep-all',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {chart.title}
                    </div>
                    <span
                        style={{
                          position: 'absolute',
                          right: 14,
                          bottom: 13,
                          flex: '0 0 auto',
                          minWidth: '46px',
                          padding: '7px 10px',
                          background: difficultyVisual.compactBackground,
                          border: difficultyVisual.border,
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 950,
                          letterSpacing: '0.03em',
                          textAlign: 'center',
                          boxShadow: difficultyVisual.shadow,
                          textShadow: difficultyVisual.textShadow,
                        }}
                      >
                        {displayDifficulty}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* 더 보기 버튼 (무한스크롤 대체) */}
          <div
            className="chart-select-load-more"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '10px',
              marginTop: isCardGridCompact ? '18px' : '30px',
              paddingBottom: '20px',
            }}
          >
            {hasMore && (
              <button
                className="chart-select-load-more__button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  background: CHART_EDITOR_THEME.buttonPrimaryBg,
                  color: CHART_EDITOR_THEME.buttonPrimaryText,
                  border: 'none',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  cursor: isLoadingMore ? 'wait' : 'pointer',
                  boxShadow: CHART_EDITOR_THEME.shadowSoft,
                  opacity: isLoadingMore ? 0.7 : 1,
                }}
              >
                {isLoadingMore ? '불러오는 중...' : '더 보기'}
              </button>
            )}
          </div>
          </div>
          </div>
          {selectedChart ? (
            <aside
              className="chart-select-detail-panel"
              key={selectedChart.id}
              style={{
                position: 'relative',
                height: '100%',
                minHeight: 0,
                backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: '28px',
                overflow: 'hidden',
                boxShadow: CHART_EDITOR_THEME.shadowSoft,
                zIndex: 2,
                backdropFilter: 'blur(16px)',
              }}
            >
              {selectedChart.preview_image && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: `url(${selectedChart.preview_image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(24px)',
                    transform: 'scale(1.08)',
                    opacity: 0.12,
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                />
              )}
              <div
                className="chart-select-detail-panel__content"
                style={{
                  position: 'relative',
                  zIndex: 1,
                  padding: '18px 18px 22px',
                  overflowY: 'auto',
                  height: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '14px',
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 10px',
                      borderRadius: '999px',
                      background: 'rgba(8, 12, 24, 0.42)',
                      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      color: CHART_EDITOR_THEME.accentStrong,
                      fontSize: '10px',
                      fontWeight: 800,
                      letterSpacing: '0.14em',
                    }}
                  >
                    LIVE PREVIEW
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedChart(null)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '12px',
                      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      background: CHART_EDITOR_THEME.buttonGhostBg,
                      color: CHART_EDITOR_THEME.textSecondary,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    닫기
                  </button>
                </div>

                {selectedChart.preview_image && (
                  <div
                    className="chart-select-detail-panel__preview"
                    style={{
                      width: '100%',
                      marginBottom: '16px',
                      borderRadius: '18px',
                      overflow: 'hidden',
                      backgroundColor: CHART_EDITOR_THEME.surface,
                      boxShadow: `0 0 0 1px ${CHART_EDITOR_THEME.borderSubtle}`,
                    }}
                  >
                    <img
                      src={selectedChart.preview_image}
                      alt={selectedChart.title}
                      style={{
                        width: '100%',
                        aspectRatio: String(
                          thumbnailAspectRatios[selectedChart.id] ?? DEFAULT_THUMBNAIL_ASPECT_RATIO
                        ),
                        objectFit: 'cover',
                        display: 'block',
                        maxHeight: '220px',
                      }}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <h2 className="chart-select-detail-panel__title" style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '28px', marginBottom: '14px', marginTop: 0 }}>
                  {selectedChart.title}
                </h2>

                <div
                  className="chart-select-detail-panel__sticky-action"
                  style={{
                    marginBottom: '12px',
                  }}
                >
                  <button
                    className="chart-select-play-button"
                    onClick={() => handleSelectChart(selectedChart)}
                    style={{
                      width: '100%',
                      padding: '15px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      background: CHART_EDITOR_THEME.buttonPrimaryBg,
                      color: CHART_EDITOR_THEME.buttonPrimaryText,
                      border: 'none',
                      borderRadius: CHART_EDITOR_THEME.radiusMd,
                      cursor: 'pointer',
                      boxShadow: CHART_EDITOR_THEME.shadowSoft,
                      transition: 'all 0.15s ease-out',
                    }}
                  >
                    {chartStatus === 'wip' ? '이 WIP 채보로 테스트' : '🎮 이 채보로 플레이'}
                  </button>
                  {chartStatus === 'wip' && onContribute && (
                    <button
                      className="chart-select-contribute-button"
                      onClick={() => onContribute(selectedChart)}
                      style={{
                        width: '100%',
                        marginTop: '10px',
                        padding: '13px',
                        fontSize: '15px',
                        fontWeight: 'bold',
                        background: 'rgba(251, 191, 36, 0.18)',
                        color: '#fde68a',
                        border: '1px solid rgba(251, 191, 36, 0.35)',
                        borderRadius: CHART_EDITOR_THEME.radiusMd,
                        cursor: 'pointer',
                      }}
                    >
                      이어 만들기
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  {[
                    ['BPM', selectedChart.bpm],
                    ['NOTES', (selectedChart as any)?._noteCount ?? 0],
                    ['PLAY', selectedChart.play_count],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        padding: '8px 10px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        background: 'rgba(8, 12, 24, 0.52)',
                      }}
                    >
                      <div style={{ color: CHART_EDITOR_THEME.textMuted, fontSize: '10px', fontWeight: 800 }}>{label}</div>
                      <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', fontWeight: 800 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsDetailExpanded((prev) => !prev)}
                  style={{
                    width: '100%',
                    marginBottom: isDetailExpanded ? '14px' : 0,
                    padding: '10px 12px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: CHART_EDITOR_THEME.buttonGhostBg,
                    color: CHART_EDITOR_THEME.textPrimary,
                    cursor: 'pointer',
                    fontWeight: 800,
                  }}
                >
                  {isDetailExpanded ? '간단히 보기' : '자세히 보기'}
                </button>

                {isDetailExpanded && (
                  <>
                    {selectedChart.description && (
                      <div
                        className="chart-select-detail-panel__fact chart-select-detail-panel__fact--wide"
                        style={{
                          padding: '12px',
                          marginBottom: '10px',
                          borderRadius: CHART_EDITOR_THEME.radiusMd,
                          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                          background: 'rgba(8, 12, 24, 0.46)',
                        }}
                      >
                        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '10px', marginBottom: '6px', letterSpacing: '0.08em' }}>DESCRIPTION</div>
                        <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '13px', lineHeight: 1.55 }}>
                          {selectedChart.description}
                        </div>
                      </div>
                    )}
                    {renderWipNote()}
                    {renderDetailFacts()}
                    {renderDetailLeaderboard()}
                  </>
                )}
              </div>
            </aside>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const LeaderboardList: React.FC<{ scores: ApiScore[]; emptyText?: string }> = ({ scores, emptyText }) => {
  if (!scores || scores.length === 0) {
    return <div className="chart-select-leaderboard__empty" style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px' }}>{emptyText || '데이터 없음'}</div>;
  }
  return (
    <div className="chart-select-leaderboard__list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {scores.map((s, idx) => (
        <div
          className="chart-select-leaderboard__row"
          key={s.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px',
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            color: CHART_EDITOR_THEME.textPrimary,
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: CHART_EDITOR_THEME.textSecondary, width: '20px' }}>{idx + 1}</span>
            <span>
              {s.user?.nickname || s.user?.email?.split('@')[0] || '알 수 없음'}
              {s.user?.role === 'admin' && (
                <span style={{ fontSize: '10px', marginLeft: '6px', padding: '2px 6px', borderRadius: '999px', background: '#b91c1c', color: '#fff' }}>
                  ADMIN
                </span>
              )}
            </span>
          </div>
          <div style={{ fontWeight: 'bold', color: '#facc15' }}>{s.accuracy.toFixed(2)}%</div>
        </div>
      ))}
    </div>
  );
};

const UserLeaderboardList: React.FC<{ entries: ApiUserAggregate[]; emptyText?: string }> = ({ entries, emptyText }) => {
  if (!entries || entries.length === 0) {
    return <div className="chart-select-leaderboard__empty" style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px' }}>{emptyText || '데이터 없음'}</div>;
  }
  return (
    <div className="chart-select-leaderboard__list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {entries.map((e, idx) => (
        <div
          className="chart-select-leaderboard__row"
          key={e.user_id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px',
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            color: CHART_EDITOR_THEME.textPrimary,
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: CHART_EDITOR_THEME.textSecondary, width: '20px' }}>{idx + 1}</span>
            <span>
              {e.user?.nickname || e.user?.email?.split('@')[0] || '알 수 없음'}
              {e.user?.role === 'admin' && (
                <span style={{ fontSize: '10px', marginLeft: '6px', padding: '2px 6px', borderRadius: '999px', background: '#b91c1c', color: '#fff' }}>
                  ADMIN
                </span>
              )}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: '#facc15' }}>avg {e.avg_accuracy?.toFixed?.(2) ?? '-' }%</span>
            <span style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px' }}>max {e.max_accuracy?.toFixed?.(2) ?? '-' }%</span>
            <span style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px' }}>plays {e.play_count}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
