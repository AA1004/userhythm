import React, { useState, useEffect, useCallback, useRef } from 'react';
import { chartAPI, Chart, isSupabaseConfigured } from '../lib/supabaseClient';
import { extractYouTubeVideoId } from '../utils/youtube';

interface ChartSelectProps {
  onSelect: (chartData: any) => void;
  onClose: () => void;
}

export const ChartSelect: React.FC<ChartSelectProps> = ({ onSelect, onClose }) => {
  const CACHE_KEY = 'chart_select_cache_v1';
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const hasLoadedChartsRef = useRef(false);

  const [charts, setCharts] = useState<Chart[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'created_at' | 'play_count' | 'title'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedChart, setSelectedChart] = useState<Chart | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const chartsPerPage = 20;
  const isDefaultQuery =
    searchQuery.trim() === '' && sortBy === 'created_at' && sortOrder === 'desc' && currentPage === 1;

  const readCache = (): { charts: Chart[]; total: number } | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.charts) && typeof parsed?.total === 'number') {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  };

  const writeCache = (payload: { charts: Chart[]; total: number }) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota errors
    }
  };

  // 기본 쿼리라면 캐시를 먼저 보여줘서 차단/지연 시에도 리스트가 즉시 보이도록 함
  useEffect(() => {
    if (!isDefaultQuery) return;
    const cached = readCache();
    if (cached && isMountedRef.current) {
      setCharts(cached.charts);
      setTotalCount(cached.total);
      setLoading(false);
      setError(null);
      hasLoadedChartsRef.current = cached.charts.length > 0;
    }
  }, [isDefaultQuery]);

  useEffect(() => {
    // React 18 StrictMode에서 effect가 즉시 clean-up 되더라도 다시 true로 세팅
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
    };
  }, []);

  const loadCharts = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase 환경 변수가 설정되지 않았습니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    hasLoadedChartsRef.current = false;

    console.log('[ChartSelect] fetch charts start', {
      searchQuery,
      sortBy,
      sortOrder,
      currentPage,
      isDefaultQuery,
    });

    // 15초 이상 스피너에 머물지 않도록 안전 타임아웃
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setLoading(false);
      if (!hasLoadedChartsRef.current) {
        setError('채보 목록 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
      }
    }, 15000);

    try {
      // Supabase 응답이 지연될 때 추가 타임아웃(12초)으로 보호
      const timeoutPromise = new Promise<never>((_, reject) => {
        requestTimeoutRef.current = setTimeout(() => {
          reject(new Error('채보 목록 응답이 지연되고 있습니다.'));
        }, 12000);
      });

      const { charts: loadedCharts, total } = await Promise.race([
        chartAPI.getApprovedCharts({
          search: searchQuery,
          sortBy,
          sortOrder,
          limit: chartsPerPage,
          offset: (currentPage - 1) * chartsPerPage,
        }),
        timeoutPromise,
      ]);
      // 프리뷰 이미지가 없으면 YouTube 썸네일로 대체
      const normalizedCharts = loadedCharts.map((chart: Chart) => {
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

      // 디버깅: preview_image 확인
      console.log('로드된 채보:', normalizedCharts.map(chart => ({
        id: chart.id,
        title: chart.title,
        preview_image: chart.preview_image
      })));
      if (!isMountedRef.current) return;
      setCharts(normalizedCharts);
      hasLoadedChartsRef.current = normalizedCharts.length > 0;
      setTotalCount(total);
      if (isDefaultQuery) {
        writeCache({ charts: normalizedCharts, total });
      }
    } catch (error: any) {
      console.error('Failed to load charts:', error);
      const errorMessage = error?.message || '채보 목록을 불러오는데 실패했습니다.';
      if (isMountedRef.current) {
        // 차단/지연 시 기본 쿼리는 캐시로 대체해 빈 화면을 피함
        const cached = isDefaultQuery ? readCache() : null;
        if (cached) {
          setError(null);
          setCharts(cached.charts);
          setTotalCount(cached.total);
          hasLoadedChartsRef.current = cached.charts.length > 0;
        } else {
          setError(errorMessage);
          setCharts([]);
          setTotalCount(0);
        }
      }
    } finally {
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [searchQuery, sortBy, sortOrder, currentPage]);

  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

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

  const totalPages = Math.ceil(totalCount / chartsPerPage);

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
          backgroundColor: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}
      >
        <div
          style={{
            backgroundColor: '#2a2a2a',
            padding: '40px',
            borderRadius: '12px',
            maxWidth: '600px',
            width: '90%',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#fff', marginBottom: '20px', fontSize: '24px' }}>
            채보 선택 기능을 사용할 수 없습니다
          </h2>
          <p style={{ color: '#aaa', marginBottom: '20px', lineHeight: 1.6, fontSize: '14px' }}>
            채보 선택 기능을 사용하려면 Supabase 환경 변수가 설정되어야 합니다.
            <br />
            루트 디렉터리의 <strong style={{ color: '#fff' }}>CHART_SHARING_SETUP.md</strong> 파일을 참고하여
            <br />
            <strong style={{ color: '#fff' }}>VITE_SUPABASE_URL</strong>과 <strong style={{ color: '#fff' }}>VITE_SUPABASE_ANON_KEY</strong> 환경 변수를
            <br />
            설정한 뒤 개발 서버를 재시작해주세요.
          </p>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              backgroundColor: '#616161',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
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
        backgroundColor: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          backgroundColor: '#2a2a2a',
          padding: '20px',
          borderBottom: '2px solid #444',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h1 style={{ color: '#fff', fontSize: '24px', margin: 0 }}>
            채보 선택하기
          </h1>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#616161',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>

        {/* 검색 및 필터 */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="제목 또는 작성자로 검색..."
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #555',
              backgroundColor: '#1f1f1f',
              color: '#fff',
              fontSize: '14px',
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
              borderRadius: '6px',
              border: '1px solid #555',
              backgroundColor: '#1f1f1f',
              color: '#fff',
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
              borderRadius: '6px',
              border: '1px solid #555',
              backgroundColor: '#1f1f1f',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <div style={{ color: '#aaa', fontSize: '12px', marginTop: '10px' }}>
          총 {totalCount}개의 채보
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
          }}
        >
          {loading ? (
            <div style={{ color: '#aaa', textAlign: 'center', padding: '40px' }}>
              로딩 중...
            </div>
          ) : error ? (
            <div style={{ color: '#f44336', textAlign: 'center', padding: '40px' }}>
              <div style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 'bold' }}>
                오류가 발생했습니다
              </div>
              <div style={{ marginBottom: '20px', fontSize: '14px', color: '#aaa' }}>
                {error}
              </div>
              <button
                onClick={() => loadCharts()}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  backgroundColor: '#2196F3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                다시 시도
              </button>
            </div>
          ) : charts.length === 0 ? (
            <div style={{ color: '#aaa', textAlign: 'center', padding: '40px' }}>
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
                    backgroundColor: '#2a2a2a',
                    borderRadius: '8px',
                    padding: '20px',
                    cursor: 'pointer',
                    border: selectedChart?.id === chart.id ? '2px solid #2196F3' : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedChart?.id !== chart.id) {
                      e.currentTarget.style.backgroundColor = '#333';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedChart?.id !== chart.id) {
                      e.currentTarget.style.backgroundColor = '#2a2a2a';
                    }
                  }}
                >
                  {chart.preview_image ? (
                    <div
                      style={{
                        width: '100%',
                        height: '180px',
                        marginBottom: '12px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        backgroundColor: '#1f1f1f',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
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
                        borderRadius: '6px',
                        backgroundColor: '#1f1f1f',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666',
                        fontSize: '12px',
                      }}
                    >
                      이미지 없음
                    </div>
                  )}
                  <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                    {chart.title}
                  </div>
                  <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '12px' }}>
                    작성자: {chart.author}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#1f1f1f',
                        borderRadius: '4px',
                        color: '#ddd',
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
                          borderRadius: '4px',
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
                        backgroundColor: '#1f1f1f',
                        borderRadius: '4px',
                        color: '#ddd',
                        fontSize: '11px',
                      }}
                    >
                      ▶ {chart.play_count}
                    </span>
                  </div>
                  {chart.description && (
                    <div
                      style={{
                        color: '#999',
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

          {/* 페이지네이션 */}
          {totalPages > 1 && (
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
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: currentPage === 1 ? '#424242' : '#616161',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                이전
              </button>
              <span style={{ color: '#ddd', fontSize: '14px' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: currentPage === totalPages ? '#424242' : '#616161',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                다음
              </button>
            </div>
          )}
        </div>

        {/* 상세 정보 패널 */}
        {selectedChart && (
          <div
            style={{
              width: '400px',
              backgroundColor: '#2a2a2a',
              borderLeft: '2px solid #444',
              overflowY: 'auto',
              padding: '20px',
            }}
          >
            <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '20px' }}>
              {selectedChart.title}
            </h2>

            {selectedChart.preview_image && (
              <div
                style={{
                  width: '100%',
                  marginBottom: '20px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: '#1f1f1f',
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
                  onError={(e) => {
                    // 이미지 로드 실패 시 숨김
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
              <div>
                <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>작성자</div>
                <div style={{ color: '#fff', fontSize: '16px' }}>{selectedChart.author}</div>
              </div>
              <div>
                <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>BPM</div>
                <div style={{ color: '#fff', fontSize: '16px' }}>{selectedChart.bpm}</div>
              </div>
              {selectedChart.difficulty && (
                <div>
                  <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>난이도</div>
                  <div style={{ color: '#fff', fontSize: '16px' }}>{selectedChart.difficulty}</div>
                </div>
              )}
              <div>
                <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>플레이 횟수</div>
                <div style={{ color: '#fff', fontSize: '16px' }}>{selectedChart.play_count}</div>
              </div>
              <div>
                <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>노트 수</div>
                <div style={{ color: '#fff', fontSize: '16px' }}>
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
                  <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>설명</div>
                  <div style={{ color: '#ddd', fontSize: '14px', lineHeight: 1.5 }}>
                    {selectedChart.description}
                  </div>
                </div>
              )}
              {selectedChart.youtube_url && (
                <div>
                  <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>YouTube</div>
                  <a
                    href={selectedChart.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#2196F3', fontSize: '14px', wordBreak: 'break-all' }}
                  >
                    링크 열기
                  </a>
                </div>
              )}
              <div>
                <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>업로드 일시</div>
                <div style={{ color: '#ddd', fontSize: '14px' }}>
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
                backgroundColor: '#4CAF50',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
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

