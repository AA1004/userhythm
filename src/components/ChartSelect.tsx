import React, { useState, useEffect, useCallback, useRef } from 'react';
import { chartAPI, Chart, isSupabaseConfigured } from '../lib/supabaseClient';
import { extractYouTubeVideoId } from '../utils/youtube';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

interface ChartSelectProps {
  onSelect: (chartData: any) => void;
  onClose: () => void;
}

export const ChartSelect: React.FC<ChartSelectProps> = ({ onSelect, onClose }) => {
  const requestControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const [charts, setCharts] = useState<Chart[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'created_at' | 'play_count' | 'title'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedChart, setSelectedChart] = useState<Chart | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const chartsPerPage = 12;

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

  const normalizeCharts = useCallback((loadedCharts: Chart[]) => {
    return loadedCharts.map((chart: Chart) => {
      if (chart.preview_image) return chart;

      try {
        const data = JSON.parse(chart.data_json || '{}');
        const youtubeUrl: string = data.youtubeUrl || chart.youtube_url || '';
        const youtubeVideoId: string | null =
          data.youtubeVideoId || (youtubeUrl ? extractYouTubeVideoId(youtubeUrl) : null);

        if (youtubeVideoId) {
          const thumbnail = `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`;
          return { ...chart, preview_image: thumbnail };
        }
      } catch {
        // parsing 실패 시 원본 유지
      }

      return chart;
    });
  }, []);

  const loadCharts = useCallback(
    async (page: number = 1, append: boolean = false) => {
      if (!isSupabaseConfigured) {
        setError('Supabase 환경 변수가 설정되지 않았습니다.');
        setStatus('error');
        setHasMore(false);
        return;
      }

      // 이전 요청 취소
      if (requestControllerRef.current) {
        requestControllerRef.current.abort();
      }
      const controller = new AbortController();
      requestControllerRef.current = controller;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setStatus('loading');
      }
      setError(null);

      try {
        const { items, total, hasMore: more } = await chartAPI.getChartsPage({
          search: searchQuery || undefined,
          sortBy,
          sortOrder,
          page,
          limit: chartsPerPage,
          signal: controller.signal,
        });

        const normalizedCharts = normalizeCharts(items);

        if (!isMountedRef.current) return;

        if (append) {
          setCharts((prev) => {
            const map = new Map<string, Chart>();
            prev.forEach((c) => map.set(c.id, c));
            normalizedCharts.forEach((c) => map.set(c.id, c));
            return Array.from(map.values());
          });
        } else {
          setCharts(normalizedCharts);
        }

        setTotalCount(total);
        setHasMore(more);
        setStatus('success');
      } catch (error: any) {
        const message = error?.message || '';
        if (error?.name === 'AbortError' || message.toLowerCase().includes('abort')) {
          // React StrictMode 이펙트 클린업 등으로 발생하는 취소는 무시
          return;
        }
        console.error('Failed to load charts:', error);
        if (!isMountedRef.current) return;
        setStatus('error');
        setError(error?.message || '채보 목록을 불러오는데 실패했습니다.');
        if (!append) {
          setCharts([]);
          setTotalCount(0);
        }
        setHasMore(false);
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
        if (isMountedRef.current && append) {
          setIsLoadingMore(false);
        }
      }
    },
    [searchQuery, sortBy, sortOrder, chartsPerPage, normalizeCharts]
  );

  useEffect(() => {
    setCurrentPage(1);
    setHasMore(true);
    loadCharts(1, false);
  }, [loadCharts]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    const next = currentPage + 1;
    setCurrentPage(next);
    loadCharts(next, true);
  }, [currentPage, hasMore, isLoadingMore, loadCharts]);

  const handleSelectChart = (chart: Chart) => {
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
        chartAuthor: chart.author,
      });
      
      // Increment play count
      chartAPI.incrementPlayCount(chart.id).catch(console.error);
    } catch (error) {
      console.error('Failed to parse chart data:', error);
      alert('채보 데이터를 불러오는데 실패했습니다.');
    }
  };

  // 환경 변수가 설정되지 않은 경우 안내 화면 표시
  if (!isSupabaseConfigured) {
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
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}
      >
        <div
          style={{
            backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
            padding: '40px',
            borderRadius: CHART_EDITOR_THEME.radiusLg,
            maxWidth: '600px',
            width: '90%',
            textAlign: 'center',
            boxShadow: CHART_EDITOR_THEME.shadowSoft,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          }}
        >
          <h2 style={{ color: CHART_EDITOR_THEME.textPrimary, marginBottom: '20px', fontSize: '24px' }}>
            채보 선택 기능을 사용할 수 없습니다
          </h2>
          <p style={{ color: CHART_EDITOR_THEME.textSecondary, marginBottom: '20px', lineHeight: 1.6, fontSize: '14px' }}>
            채보 선택 기능을 사용하려면 Supabase 환경 변수가 설정되어야 합니다.
            <br />
            루트 디렉터리의 <strong style={{ color: CHART_EDITOR_THEME.textPrimary }}>CHART_SHARING_SETUP.md</strong> 파일을 참고하여
            <br />
            <strong style={{ color: CHART_EDITOR_THEME.textPrimary }}>VITE_SUPABASE_URL</strong>과 <strong style={{ color: CHART_EDITOR_THEME.textPrimary }}>VITE_SUPABASE_ANON_KEY</strong> 환경 변수를
            <br />
            설정한 뒤 개발 서버를 재시작해주세요.
          </p>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              background: CHART_EDITOR_THEME.buttonPrimaryBg,
              color: CHART_EDITOR_THEME.buttonPrimaryText,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
            }}
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

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
                loadCharts(1, false);
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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
            <option value="created_at">최신순</option>
            <option value="play_count">인기순</option>
            <option value="title">제목순</option>
          </select>
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
            background: 'linear-gradient(180deg, rgba(15,23,42,0.45), rgba(15,23,42,0.8))',
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
                onClick={() => loadCharts()}
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
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '13px', marginBottom: '12px' }}>
                    작성자: {chart.author}
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
            {hasMore ? (
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
            ) : (
              <span style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '13px' }}>
                모두 불러왔습니다
              </span>
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
                <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.author}</div>
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
                  {new Date(selectedChart.created_at).toLocaleString('ko-KR')}
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
          </div>
        )}
      </div>
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
    default:
      return '#616161';
  }
}

