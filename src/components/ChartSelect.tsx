import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api, ApiChart, ApiScore, ApiUserAggregate } from '../lib/api';
import { extractYouTubeVideoId, waitForYouTubeAPI } from '../utils/youtube';
import { measureToTime } from '../utils/bpmUtils';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { PREVIEW_FADE_DURATION_MS, PREVIEW_TRANSITION_DURATION_MS, PREVIEW_VOLUME, PREVIEW_BGA_OPACITY } from '../constants/gameConstants';

const INTERACTIVE_SHORTCUT_TARGET_SELECTOR =
  'input, textarea, select, button, a[href], [role="button"], [contenteditable], [tabindex]:not([tabindex="-1"])';

const isInteractiveShortcutTarget = (target: EventTarget | null): boolean => {
  return target instanceof HTMLElement && target.closest(INTERACTIVE_SHORTCUT_TARGET_SELECTOR) !== null;
};

const isControlKeyShortcut = (event: KeyboardEvent): boolean => {
  return event.key === 'Control' && !event.repeat && !event.altKey && !event.metaKey && !event.shiftKey;
};

interface ChartSelectProps {
  onSelect: (chartData: any) => void;
  onClose: () => void;
  refreshToken?: number; // 외부에서 강제 새로고침 트리거
}

export const ChartSelect: React.FC<ChartSelectProps> = ({ onSelect, onClose, refreshToken }) => {
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
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const chartsPerPage = 12;
  const [isInsaneMode, setIsInsaneMode] = useState<boolean>(false);
  const [insaneOnly, setInsaneOnly] = useState<boolean>(false);

  // leaderboards
  const [perChartScores, setPerChartScores] = useState<ApiScore[]>([]);
  const [globalScores, setGlobalScores] = useState<ApiScore[]>([]);
  const [perUserScores, setPerUserScores] = useState<ApiUserAggregate[]>([]);

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
      if (!preview) {
        const youtubeUrl: string = chartData.youtubeUrl || chart.youtube_url || '';
        const youtubeVideoId: string | null =
          chartData.youtubeVideoId || (youtubeUrl ? extractYouTubeVideoId(youtubeUrl) : null);
        if (youtubeVideoId) {
          preview = `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`;
        }
      }

      const notes = Array.isArray(chartData.notes) ? chartData.notes : [];
      const holdCount = notes.filter((note: any) => note?.type === 'hold' || Number(note?.duration) > 0).length;
      const subtitleCount = Array.isArray(chartData.subtitles) ? chartData.subtitles.length : 0;
      const bgaEventCount = Array.isArray(chartData.bgaVisibilityIntervals)
        ? chartData.bgaVisibilityIntervals.length
        : 0;

      return {
        ...chart,
        preview_image: preview,
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
      };
    });
  }, []);

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
    [normalizeCharts, searchQuery, sortBy, sortOrder]
  );

  const fetchLeaderboards = useCallback(
    async (chartId?: string) => {
      try {
        const data = await api.getLeaderboard(chartId);
        setPerChartScores(data.perChart || []);
        setGlobalScores(data.global || []);
        setPerUserScores(data.perUser || []);
      } catch (e: any) {
        console.error('Failed to load leaderboard:', e);
        setPerChartScores([]);
        setGlobalScores([]);
        setPerUserScores([]);
      }
    },
    []
  );

  // 최초 로드 및 새로고침 버튼/외부 트리거 시 호출
  useEffect(() => {
    fetchAllCharts(true);
    fetchLeaderboards();
  }, [fetchAllCharts]);

  // 외부 트리거로 새로고침
  useEffect(() => {
    if (refreshToken === undefined) return;
    fetchAllCharts(true);
    fetchLeaderboards(selectedChart?.id);
  }, [refreshToken, fetchAllCharts]);

  // 검색/정렬 변경 시 페이지 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, sortOrder]);

  const filteredCharts = useMemo(() => {
    const keyword = searchQuery.toLowerCase();
    let list = allCharts;
    if (insaneOnly || isInsaneMode) {
      list = list.filter((c) => (c.difficulty || '').toUpperCase() === 'INSANE');
    }
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
    // when selected chart changes, load per-chart leaderboard
    if (selectedChart) {
      fetchLeaderboards(selectedChart.id);
    } else {
      setPerChartScores([]);
    }
  }, [selectedChart, fetchLeaderboards]);

  // 플레이어로 미리듣기 시작하는 함수
  const startPreviewPlayback = (player: any, previewStartSec: number, previewEndSec: number) => {
    // 기존 타이머 정리
    if (previewLoopTimerRef.current) {
      clearInterval(previewLoopTimerRef.current);
      previewLoopTimerRef.current = null;
    }

    try {
      // 페이드 인: 볼륨 0에서 시작
      player.setVolume(0);
      player.seekTo(previewStartSec, true);
      player.playVideo();

      // BGA 페이드 인 (360ms)
      setBgaOpacity(PREVIEW_BGA_OPACITY);

      // 오디오 페이드 인 애니메이션
      const fadeSteps = 10;
      const fadeStepDuration = PREVIEW_FADE_DURATION_MS / fadeSteps;
      let currentStep = 0;
      const fadeInInterval = setInterval(() => {
        currentStep++;
        const volume = (currentStep / fadeSteps) * PREVIEW_VOLUME;
        try { player.setVolume(volume); } catch (e) { /* 무시 */ }
        if (currentStep >= fadeSteps) {
          clearInterval(fadeInInterval);
        }
      }, fadeStepDuration);

      // 루프 타이머 시작 (페이드 아웃/인 포함)
      const fadeOutStartSec = previewEndSec - (PREVIEW_FADE_DURATION_MS / 1000);

      previewLoopTimerRef.current = setInterval(() => {
        try {
          const currentTime = player.getCurrentTime?.();
          if (currentTime === undefined) return;

          // 페이드 아웃 시작 시점 체크
          if (currentTime >= fadeOutStartSec && currentTime < previewEndSec) {
            const remaining = previewEndSec - currentTime;
            const fadeProgress = 1 - (remaining / (PREVIEW_FADE_DURATION_MS / 1000));
            const volume = PREVIEW_VOLUME * (1 - fadeProgress);
            player.setVolume(Math.max(0, volume));
          }

          // 루프 시점
          if (currentTime >= previewEndSec - 0.05) {
            player.seekTo(previewStartSec, true);
            player.setVolume(0);

            // 페이드 인 다시 시작
            let step = 0;
            const fadeIn = setInterval(() => {
              step++;
              const vol = (step / fadeSteps) * PREVIEW_VOLUME;
              try { player.setVolume(vol); } catch (e) { /* 무시 */ }
              if (step >= fadeSteps) clearInterval(fadeIn);
            }, fadeStepDuration);
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
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: 0,
              controls: 0,
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

  const toggleInsaneMode = () => {
    setIsInsaneMode((prev) => !prev);
    setInsaneOnly((prev) => !prev);
  };

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    const next = currentPage + 1;
    setCurrentPage(next);
  }, [currentPage, hasMore, isLoadingMore]);

  const handleSelectChart = useCallback((chart: ApiChart) => {
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

      onSelect({
        notes: chartData.notes || [],
        bpm: chart.bpm,
        timeSignatures: chartData.timeSignatures || [{ id: 0, beatIndex: 0, beatsPerMeasure: 4 }],
        timeSignatureOffset: chartData.timeSignatureOffset || 0,
        speedChanges: chartData.speedChanges || [],
        bgaVisibilityIntervals: chartData.bgaVisibilityIntervals || [],
        subtitles: chartData.subtitles || [],
        youtubeVideoId,
        youtubeUrl,
        playbackSpeed: chartData.playbackSpeed || 1,
        chartId: chart.id,
        chartTitle: chart.title,
        chartAuthor: (chart as any)._authorLabel || chart.author,
      });
    } catch (error) {
      console.error('Failed to parse chart data:', error);
      alert('채보 데이터를 불러오는데 실패했습니다.');
    }
  }, [onSelect]);

  useEffect(() => {
    if (!selectedChart) return;

    const handleControlStart = (event: KeyboardEvent) => {
      if (!isControlKeyShortcut(event) || isInteractiveShortcutTarget(event.target)) return;
      event.preventDefault();
      handleSelectChart(selectedChart);
    };

    window.addEventListener('keydown', handleControlStart);
    return () => window.removeEventListener('keydown', handleControlStart);
  }, [handleSelectChart, selectedChart]);

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
            채보 선택하기
          </h1>
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
            총 {totalCount}곡
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

        {/* 검색 및 필터 */}
        <div
          className={`chart-select-filter${isInsaneMode ? ' chart-select-filter--insane' : ''}`}
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            background: isInsaneMode
              ? 'linear-gradient(135deg, rgba(239,68,68,0.35), rgba(248,113,113,0.2))'
              : 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(56,189,248,0.05))',
            padding: '8px',
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            border: isInsaneMode ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(59,130,246,0.12)',
            transition: 'background 0.6s ease, border 0.6s ease',
          }}
        >
          <input
            className="chart-select-search"
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="제목 또는 작성자로 검색..."
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
              backgroundColor: CHART_EDITOR_THEME.inputBg,
              color: CHART_EDITOR_THEME.textPrimary,
              fontSize: '14px',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.border = `1px solid ${CHART_EDITOR_THEME.inputBorderFocused}`;
              e.currentTarget.style.boxShadow = CHART_EDITOR_THEME.shadowSoft;
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = `1px solid ${CHART_EDITOR_THEME.inputBorder}`;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <select
            className="chart-select-sort"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              setCurrentPage(1);
            }}
            style={{
              padding: '10px',
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
          <button
            className={`chart-select-insane-toggle${isInsaneMode ? ' chart-select-insane-toggle--active' : ''}`}
            onClick={toggleInsaneMode}
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              border: isInsaneMode
                ? '1px solid rgba(248,113,113,0.9)'
                : '1px solid rgba(59,130,246,0.35)',
              background: isInsaneMode
                ? 'linear-gradient(135deg, #991b1b 0%, #b91c1c 45%, #ef4444 100%)'
                : 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(56,189,248,0.12))',
              color: isInsaneMode ? '#ffe4e6' : '#e5edff',
              fontSize: '14px',
              fontWeight: 800,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              textShadow: isInsaneMode ? '0 0 10px rgba(248,113,113,0.7)' : '0 0 6px rgba(59,130,246,0.5)',
              cursor: 'pointer',
              boxShadow: isInsaneMode
                ? '0 0 18px rgba(248,113,113,0.55), 0 0 32px rgba(239,68,68,0.35)'
                : '0 0 12px rgba(59,130,246,0.25)',
              transform: isInsaneMode ? 'translateZ(0) scale(1.02)' : 'translateZ(0)',
              transition: 'all 0.25s ease',
            }}
            onMouseEnter={(e) => {
              if (!isInsaneMode) {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(56,189,248,0.2))';
                e.currentTarget.style.boxShadow = '0 0 16px rgba(59,130,246,0.35)';
              } else {
                e.currentTarget.style.boxShadow = '0 0 22px rgba(248,113,113,0.7), 0 0 44px rgba(239,68,68,0.5)';
                e.currentTarget.style.transform = 'translateZ(0) scale(1.04)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isInsaneMode) {
                e.currentTarget.style.background =
                  'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(56,189,248,0.12))';
                e.currentTarget.style.boxShadow = '0 0 12px rgba(59,130,246,0.25)';
                e.currentTarget.style.transform = 'translateZ(0)';
              } else {
                e.currentTarget.style.boxShadow = '0 0 16px rgba(248,113,113,0.45), 0 0 32px rgba(239,68,68,0.35)';
                e.currentTarget.style.transform = 'translateZ(0) scale(1.02)';
              }
            }}
          >
            {isInsaneMode ? '🔥 INSANE ON' : '🔥 INSANE 모드'}
          </button>
          <button
            className="chart-select-sort-order"
            onClick={() => {
              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              setCurrentPage(1);
            }}
            style={{
              padding: '10px 15px',
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

        <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginTop: '10px' }}>
          총 {(totalCount || charts.length)}개의 채보
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="chart-select-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 2 }}>
        {/* 채보 목록 */}
        <div
          className="chart-select-list-panel"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            background: isInsaneMode
              ? 'linear-gradient(180deg, rgba(127,29,29,0.45), rgba(69,10,10,0.85))'
              : 'linear-gradient(180deg, rgba(15,23,42,0.45), rgba(15,23,42,0.8))',
            transition: 'background 0.6s ease',
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
              <p>Railway 서버에서 최신 공개 채보를 불러오고 있습니다.</p>
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
              {searchQuery ? '검색 결과가 없습니다.' : '공개된 채보가 없습니다.'}
            </div>
          ) : (
            <div
              className="chart-select-list-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px',
              }}
            >
              {charts.map((chart, index) => (
                <div
                  key={chart.id}
                  className={`chart-select-card${selectedChart?.id === chart.id ? ' chart-select-card--selected' : ''}`}
                  onClick={() => setSelectedChart(chart)}
                  style={{
                    animationDelay: `${Math.min(index, 11) * 36}ms`,
                    background: selectedChart?.id === chart.id
                      ? 'linear-gradient(145deg, rgba(34,211,238,0.18), rgba(129,140,248,0.16))'
                      : CHART_EDITOR_THEME.surface,
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    padding: '20px',
                    cursor: 'pointer',
                    border: selectedChart?.id === chart.id
                      ? `1px solid ${CHART_EDITOR_THEME.accentStrong}`
                      : `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    transition: 'all 0.2s ease-out',
                    boxShadow: selectedChart?.id === chart.id
                      ? CHART_EDITOR_THEME.shadowStrong
                      : CHART_EDITOR_THEME.shadowSoft,
                  }}
                  onMouseEnter={(e) => {
                    if (selectedChart?.id !== chart.id) {
                      e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBgHover;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedChart?.id !== chart.id) {
                      e.currentTarget.style.background = CHART_EDITOR_THEME.surface;
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
                        height: '180px',
                        marginBottom: '12px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        overflow: 'hidden',
                        backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 0 0 1px ${CHART_EDITOR_THEME.borderSubtle}`,
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
                        }}
                        loading="lazy"
                        onError={(e) => {
                          // 이미지 로드 실패 시 숨김
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      className="chart-select-card__thumb chart-select-card__thumb--empty"
                      style={{
                        width: '100%',
                          height: '180px',
                          marginBottom: '12px',
                          borderRadius: CHART_EDITOR_THEME.radiusSm,
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
                  <div className="chart-select-card__title" style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                    {chart.title}
                  </div>
                  <div className="chart-select-card__author" style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '13px', marginBottom: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span>{(chart as any)._authorChess || '♟'}</span>
                    <span
                      style={{
                        fontWeight: (chart as any)._isAdmin ? 'bold' : undefined,
                        color: (chart as any)._isAdmin ? '#f87171' : undefined,
                      }}
                    >
                      {(chart as any)._authorLabel || chart.author}
                    </span>
                    {(chart as any)._isAdmin && (
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', backgroundColor: '#b91c1c', color: '#fff' }}>
                        ADMIN
                      </span>
                    )}
                  </div>
                  <div className="chart-select-card__badges" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor: CHART_EDITOR_THEME.buttonGhostBgHover,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        color: CHART_EDITOR_THEME.textPrimary,
                        fontSize: '11px',
                      }}
                    >
                      BPM {chart.bpm}
                    </span>
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor: CHART_EDITOR_THEME.buttonGhostBgHover,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        color: CHART_EDITOR_THEME.textPrimary,
                        fontSize: '11px',
                      }}
                    >
                      NOTES {(chart as any)._noteCount ?? 0}
                    </span>
                    {chart.difficulty && (
                      <span
                        style={{
                          padding: '4px 8px',
                          backgroundColor: getDifficultyColor(chart.difficulty),
                          borderRadius: CHART_EDITOR_THEME.radiusSm,
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                      >
                        {chart.difficulty}
                      </span>
                    )}
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor: CHART_EDITOR_THEME.buttonGhostBgHover,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        color: CHART_EDITOR_THEME.textPrimary,
                        fontSize: '11px',
                      }}
                    >
                      ▶ {chart.play_count}
                    </span>
                    {(chart as any)._hasSubtitles && (
                      <span
                        className="chart-select-card__feature-badge"
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'rgba(167,139,250,0.18)',
                          borderRadius: CHART_EDITOR_THEME.radiusSm,
                          color: '#ddd6fe',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        SUB
                      </span>
                    )}
                    {(chart as any)._hasBgaEvents && (
                      <span
                        className="chart-select-card__feature-badge"
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'rgba(244,114,182,0.16)',
                          borderRadius: CHART_EDITOR_THEME.radiusSm,
                          color: '#fbcfe8',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        BGA FX
                      </span>
                    )}
                  </div>
                  {chart.description && (
                    <div
                      className="chart-select-card__description"
                      style={{
                        color: CHART_EDITOR_THEME.textSecondary,
                        fontSize: '12px',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {chart.description}
                    </div>
                  )}
                </div>
              ))}
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
              marginTop: '30px',
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

        {/* 상세 정보 패널 */}
        {selectedChart && (
          <div
            className="chart-select-detail-panel"
            key={selectedChart.id}
            style={{
              width: '400px',
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              borderLeft: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              overflowY: 'auto',
              padding: '20px',
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
              position: 'relative',
            }}
          >
            {/* 블러 배경 */}
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
                  filter: 'blur(18px)',
                  transform: 'scale(1.12)',
                  opacity: 0.3,
                  zIndex: 0,
                  pointerEvents: 'none',
                }}
              />
            )}
            <div className="chart-select-detail-panel__content" style={{ position: 'relative', zIndex: 1 }}>
            <h2 className="chart-select-detail-panel__title" style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '20px', marginBottom: '20px' }}>
              {selectedChart.title}
            </h2>

            <div
              className="chart-select-detail-panel__sticky-action"
              style={{
                marginBottom: '20px',
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
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.buttonPrimaryBgHover;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = CHART_EDITOR_THEME.buttonPrimaryBg;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                🎮 이 채보로 플레이 <span style={{ opacity: 0.72, fontSize: '12px' }}>(Ctrl)</span>
              </button>
            </div>

            {selectedChart.preview_image && (
              <div
                className="chart-select-detail-panel__preview"
                style={{
                  width: '100%',
                  marginBottom: '20px',
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
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
                    height: 'auto',
                    display: 'block',
                  }}
                  loading="lazy"
                  onError={(e) => {
                    // 이미지 로드 실패 시 숨김
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="chart-select-detail-panel__facts" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
              <div className="chart-select-detail-panel__fact">
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>작성자</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span>{(selectedChart as any)._authorChess || '♟'}</span>
                  <span
                    style={{
                      fontWeight: (selectedChart as any)._isAdmin ? 'bold' : undefined,
                      color: (selectedChart as any)._isAdmin ? '#f87171' : undefined,
                    }}
                  >
                    {(selectedChart as any)._authorLabel || selectedChart.author}
                  </span>
                  {(selectedChart as any)._isAdmin && (
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', backgroundColor: '#b91c1c', color: '#fff' }}>
                      ADMIN
                    </span>
                  )}
                </div>
              </div>
              <div className="chart-select-detail-panel__fact">
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>BPM</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.bpm}</div>
              </div>
              {selectedChart.difficulty && (
                <div className="chart-select-detail-panel__fact">
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>난이도</div>
                  <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.difficulty}</div>
                </div>
              )}
              <div className="chart-select-detail-panel__fact">
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>플레이 횟수</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.play_count}</div>
              </div>
              <div className="chart-select-detail-panel__fact">
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>노트 수</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>
                  {(selectedChart as any)._noteCount ?? 0}
                </div>
              </div>
              <div className="chart-select-detail-panel__fact">
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>롱노트</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>
                  {(selectedChart as any)._holdCount ?? 0}
                </div>
              </div>
              <div className="chart-select-detail-panel__fact">
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>자막</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>
                  {(selectedChart as any)._subtitleCount > 0
                    ? `${(selectedChart as any)._subtitleCount}개`
                    : '없음'}
                </div>
              </div>
              <div className="chart-select-detail-panel__fact">
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>BGA 연출</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>
                  {(selectedChart as any)._bgaEventCount > 0
                    ? `${(selectedChart as any)._bgaEventCount}개`
                    : '없음'}
                </div>
              </div>
              {selectedChart.description && (
                <div className="chart-select-detail-panel__fact chart-select-detail-panel__fact--wide">
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>설명</div>
                  <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', lineHeight: 1.5 }}>
                    {selectedChart.description}
                  </div>
                </div>
              )}
              {selectedChart.youtube_url && (
                <div className="chart-select-detail-panel__fact chart-select-detail-panel__fact--wide">
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>YouTube</div>
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
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>업로드 일시</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px' }}>
                  {selectedChart.created_at
                    ? new Date(selectedChart.created_at).toLocaleString('ko-KR')
                    : '정보 없음'}
                </div>
              </div>
            </div>

            <div className="chart-select-leaderboard" style={{ marginTop: '20px' }}>
              <h3 className="chart-select-leaderboard__title" style={{ color: CHART_EDITOR_THEME.textPrimary, marginBottom: '10px' }}>정확도 리더보드</h3>
              <div className="chart-select-leaderboard__grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                <div>
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '6px' }}>
                    곡별 상위 기록 (현재 선택)
                  </div>
                  <LeaderboardList scores={perChartScores} emptyText="데이터 없음" />
                </div>
                <div>
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '6px' }}>
                    글로벌 상위 기록
                  </div>
                  <LeaderboardList scores={globalScores} emptyText="데이터 없음" />
                </div>
                <div>
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '6px' }}>
                    사용자별 평균 정확도
                  </div>
                  <UserLeaderboardList entries={perUserScores} emptyText="데이터 없음" />
                </div>
              </div>
            </div>
            </div>
          </div>
        )}
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

function getDifficultyColor(difficulty: string): string {
  switch (difficulty.toLowerCase()) {
    case 'easy':
      return '#4CAF50';
    case 'normal':
      return '#2196F3';
    case 'hard':
      return '#FF9800';
    case 'expert':
      return '#f44336';
    case 'insane':
      return '#b91c1c';
    default:
      return '#616161';
  }
}
