import React, { useState, useEffect, useCallback } from 'react';
import { chartAPI, Chart, isSupabaseConfigured } from '../lib/supabaseClient';
import { extractYouTubeVideoId } from '../utils/youtube';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

interface ChartSelectProps {
  onSelect: (chartData: any) => void;
  onClose: () => void;
}

export const ChartSelect: React.FC<ChartSelectProps> = ({ onSelect, onClose }) => {
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

  const loadCharts = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase 환경 변수가 설정되지 않았습니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { charts: loadedCharts, total } = await chartAPI.getApprovedCharts({
        search: searchQuery,
        sortBy,
        sortOrder,
        limit: chartsPerPage,
        offset: (currentPage - 1) * chartsPerPage,
      });
      // 디버깅: preview_image 확인
      console.log('로드된 채보:', loadedCharts.map(chart => ({
        id: chart.id,
        title: chart.title,
        preview_image: chart.preview_image
      })));
      setCharts(loadedCharts);
      setTotalCount(total);
    } catch (error: any) {
      console.error('Failed to load charts:', error);
      const errorMessage = error?.message || '채보 목록을 불러오는데 실패했습니다.';
      setError(errorMessage);
      setCharts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
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
        timeSignatures:
          chartData.timeSignatures || [
            { id: 0, beatIndex: 0, beatsPerMeasure: 4 },
          ],
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
        background: CHART_EDITOR_THEME.backgroundGradient,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          backgroundColor: '#020617',
          padding: '18px 20px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h1 style={{ color: '#e5e7eb', fontSize: '22px', margin: 0 }}>
            채보 선택하기
          </h1>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              background:
                'linear-gradient(135deg, #38bdf8, #818cf8)',
              color: '#020617',
              border: 'none',
              borderRadius: 999,
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
              padding: '9px 10px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.6)',
              backgroundColor: '#020617',
              color: '#e5e7eb',
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
              padding: '9px 10px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.6)',
              backgroundColor: '#020617',
              color: '#e5e7eb',
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
              padding: '9px 12px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.6)',
              backgroundColor: '#020617',
              color: '#e5e7eb',
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
            padding: '18px 20px',
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '18px',
                alignItems: 'stretch',
              }}
            >
              {charts.map((chart) => (
                <div
                  key={chart.id}
                  onClick={() => setSelectedChart(chart)}
                  style={{
                    background:
                      'radial-gradient(circle at top left, rgba(56,189,248,0.18), transparent 55%), #020617',
                    borderRadius: 14,
                    padding: '18px',
                    cursor: 'pointer',
                    border:
                      selectedChart?.id === chart.id
                        ? '1px solid rgba(129, 230, 217, 0.9)'
                        : '1px solid rgba(51, 65, 85, 0.9)',
                    boxShadow:
                      selectedChart?.id === chart.id
                        ? '0 0 0 1px rgba(34, 211, 238, 0.9), 0 18px 40px rgba(15, 23, 42, 0.9)'
                        : '0 10px 24px rgba(15, 23, 42, 0.9)',
                    transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out, border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {chart.preview_image ? (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '16 / 9',
                        marginBottom: '12px',
                        borderRadius: 10,
                        overflow: 'hidden',
                        backgroundColor: '#020617',
                        boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.4)',
                        position: 'relative',
                      }}
                    >
                      <img
                        src={chart.preview_image}
                        alt={chart.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
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
                        aspectRatio: '16 / 9',
                        marginBottom: '12px',
                        borderRadius: 10,
                        background:
                          'linear-gradient(135deg, rgba(56, 189, 248, 0.16), rgba(129, 140, 248, 0.08))',
                        border: '1px dashed rgba(148, 163, 184, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9CA3AF',
                        fontSize: '12px',
                      }}
                    >
                      이미지 없음
                    </div>
                  )}
                  <div style={{ color: '#e5e7eb', fontSize: '17px', fontWeight: 'bold', marginBottom: '6px' }}>
                    {chart.title}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '10px' }}>
                    작성자: {chart.author}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'rgba(15,23,42,0.9)',
                        borderRadius: '4px',
                        color: '#e5e7eb',
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
                        color: '#9ca3af',
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

