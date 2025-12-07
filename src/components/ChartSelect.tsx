import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api, ApiChart, ApiScore, ApiUserAggregate } from '../lib/api';
import { extractYouTubeVideoId } from '../utils/youtube';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

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

  useEffect(() => {
    // React 18 StrictMode에서 effect가 즉시 clean-up 되더라도 다시 true로 세팅
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (requestControllerRef.current) {
        requestControllerRef.current.abort();
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
        try {
          const data = JSON.parse(chart.data_json || '{}');
          const youtubeUrl: string = data.youtubeUrl || chart.youtube_url || '';
          const youtubeVideoId: string | null =
            data.youtubeVideoId || (youtubeUrl ? extractYouTubeVideoId(youtubeUrl) : null);
          if (youtubeVideoId) {
            preview = `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`;
          }
        } catch {
          // ignore parse error
        }
      }

      return {
        ...chart,
        preview_image: preview,
        _authorChess: authorChess,
        _authorLabel: authorLabel,
        _isAdmin: chart.author_role === 'admin',
        _isModerator: chart.author_role === 'moderator',
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

  const toggleInsaneMode = () => {
    setIsInsaneMode((prev) => !prev);
    setInsaneOnly((prev) => !prev);
  };

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    const next = currentPage + 1;
    setCurrentPage(next);
  }, [currentPage, hasMore, isLoadingMore]);

  const handleSelectChart = (chart: ApiChart) => {
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
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: CHART_EDITOR_THEME.backgroundGradient,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
        overflow: 'hidden',
      }}
    >
      {/* 백그라운드 네온 패턴 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.08), transparent 22%), radial-gradient(circle at 80% 10%, rgba(129,140,248,0.1), transparent 24%), radial-gradient(circle at 70% 80%, rgba(34,211,238,0.06), transparent 22%)',
          pointerEvents: 'none',
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
        }}
      />

      {/* 헤더 */}
      <div
        style={{
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          padding: '20px',
          borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          boxShadow: CHART_EDITOR_THEME.shadowSoft,
          position: 'relative',
          overflow: 'hidden',
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
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            background: isInsaneMode
              ? 'linear-gradient(135deg, rgba(239,68,68,0.35), rgba(248,113,113,0.2))'
              : 'none',
            padding: '8px',
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            border: isInsaneMode ? '1px solid rgba(248,113,113,0.4)' : 'none',
          }}
        >
          <input
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
            onClick={toggleInsaneMode}
            style={{
              padding: '10px 12px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${isInsaneMode ? '#ef4444' : CHART_EDITOR_THEME.borderSubtle}`,
              backgroundColor: isInsaneMode ? '#7f1d1d' : CHART_EDITOR_THEME.buttonGhostBg,
              color: isInsaneMode ? '#fecaca' : CHART_EDITOR_THEME.textPrimary,
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isInsaneMode) e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBgHover;
            }}
            onMouseLeave={(e) => {
              if (!isInsaneMode) e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBg;
            }}
          >
            {isInsaneMode ? 'INSANE 모드 ON' : 'INSANE 모드'}
          </button>
          <button
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
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 채보 목록 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            background: isInsaneMode
              ? 'linear-gradient(180deg, rgba(127,29,29,0.45), rgba(69,10,10,0.85))'
              : 'linear-gradient(180deg, rgba(15,23,42,0.45), rgba(15,23,42,0.8))',
          }}
        >
          {status === 'loading' ? (
            <div style={{ color: CHART_EDITOR_THEME.textSecondary, textAlign: 'center', padding: '40px' }}>
              로딩 중...
            </div>
          ) : error ? (
            <div style={{ color: CHART_EDITOR_THEME.danger, textAlign: 'center', padding: '40px' }}>
              <div style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 'bold', color: CHART_EDITOR_THEME.textPrimary }}>
                오류가 발생했습니다
              </div>
              <div style={{ marginBottom: '20px', fontSize: '14px', color: CHART_EDITOR_THEME.textSecondary }}>
                {error}
              </div>
              <button
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
            <div style={{ color: CHART_EDITOR_THEME.textSecondary, textAlign: 'center', padding: '40px' }}>
              {searchQuery ? '검색 결과가 없습니다.' : '공개된 채보가 없습니다.'}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px',
              }}
            >
              {charts.map((chart) => (
                <div
                  key={chart.id}
                  onClick={() => setSelectedChart(chart)}
                  style={{
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
                  {chart.preview_image ? (
                    <div
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
                        src={chart.preview_image}
                        alt={chart.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                        loading="lazy"
                        onError={(e) => {
                          console.error('이미지 로드 실패:', chart.preview_image);
                          // 이미지 로드 실패 시 숨김
                          e.currentTarget.style.display = 'none';
                        }}
                        onLoad={() => {
                          console.log('이미지 로드 성공:', chart.preview_image);
                        }}
                      />
                    </div>
                  ) : (
                    <div
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
                  <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                    {chart.title}
                  </div>
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '13px', marginBottom: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
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
                  </div>
                  {chart.description && (
                    <div
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
            style={{
              width: '400px',
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              borderLeft: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              overflowY: 'auto',
              padding: '20px',
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
            }}
          >
            <h2 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '20px', marginBottom: '20px' }}>
              {selectedChart.title}
            </h2>

            {selectedChart.preview_image && (
              <div
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
              <div>
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
              <div>
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>BPM</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.bpm}</div>
              </div>
              {selectedChart.difficulty && (
                <div>
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>난이도</div>
                  <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.difficulty}</div>
                </div>
              )}
              <div>
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>플레이 횟수</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.play_count}</div>
              </div>
              <div>
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>노트 수</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>
                  {(() => {
                    try {
                      const data = JSON.parse(selectedChart.data_json);
                      return data.notes?.length || 0;
                    } catch {
                      return '?';
                    }
                  })()}
                </div>
              </div>
              {selectedChart.description && (
                <div>
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>설명</div>
                  <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', lineHeight: 1.5 }}>
                    {selectedChart.description}
                  </div>
                </div>
              )}
              {selectedChart.youtube_url && (
                <div>
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
              <div>
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>업로드 일시</div>
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px' }}>
                  {selectedChart.created_at
                    ? new Date(selectedChart.created_at).toLocaleString('ko-KR')
                    : '정보 없음'}
                </div>
              </div>
            </div>

            <button
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
              }}
            >
              🎮 이 채보로 플레이
            </button>

            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, marginBottom: '10px' }}>정확도 리더보드</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
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
        )}
      </div>
    </div>
  );
};

const LeaderboardList: React.FC<{ scores: ApiScore[]; emptyText?: string }> = ({ scores, emptyText }) => {
  if (!scores || scores.length === 0) {
    return <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px' }}>{emptyText || '데이터 없음'}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {scores.map((s, idx) => (
        <div
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
    return <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px' }}>{emptyText || '데이터 없음'}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {entries.map((e, idx) => (
        <div
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

