import React, { useState, useEffect, useCallback } from 'react';
import { chartAPI, Chart } from '../lib/supabaseClient';
import { extractYouTubeVideoId } from '../utils/youtube';

interface ChartAdminProps {
  onClose: () => void;
  onTestChart?: (chartData: any) => void;
}

export const ChartAdmin: React.FC<ChartAdminProps> = ({ onClose, onTestChart }) => {
  const [pendingCharts, setPendingCharts] = useState<Chart[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedChart, setSelectedChart] = useState<Chart | null>(null);
  const [adminToken, setAdminToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);

  const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'admin123';

  const loadPendingCharts = useCallback(async () => {
    setLoading(true);
    try {
      const charts = await chartAPI.getPendingCharts();
      setPendingCharts(charts);
    } catch (error) {
      console.error('Failed to load pending charts:', error);
      alert('채보 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadPendingCharts();
    }
  }, [isAuthenticated, loadPendingCharts]);

  const handleLogin = () => {
    if (adminToken === ADMIN_TOKEN) {
      setIsAuthenticated(true);
    } else {
      alert('잘못된 관리자 토큰입니다.');
    }
  };

  const handleApprove = async (chartId: string) => {
    if (!confirm('이 채보를 승인하시겠습니까?')) return;
    
    setProcessing(true);
    try {
      await chartAPI.updateChartStatus(chartId, 'approved', 'admin', reviewComment);
      alert('채보가 승인되었습니다!');
      setReviewComment('');
      setSelectedChart(null);
      await loadPendingCharts();
    } catch (error) {
      console.error('Approval failed:', error);
      alert('승인에 실패했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (chartId: string) => {
    if (!confirm('이 채보를 거절하시겠습니까?')) return;
    
    setProcessing(true);
    try {
      await chartAPI.updateChartStatus(chartId, 'rejected', 'admin', reviewComment);
      alert('채보가 거절되었습니다.');
      setReviewComment('');
      setSelectedChart(null);
      await loadPendingCharts();
    } catch (error) {
      console.error('Rejection failed:', error);
      alert('거절에 실패했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const handleTestChart = (chart: Chart) => {
    try {
      const chartData = JSON.parse(chart.data_json);

      const youtubeUrl: string = chartData.youtubeUrl || chart.youtube_url || '';
      let youtubeVideoId: string | null = chartData.youtubeVideoId || null;

      if (!youtubeVideoId && youtubeUrl) {
        youtubeVideoId = extractYouTubeVideoId(youtubeUrl);
      }

      if (onTestChart) {
        onTestChart({
          notes: chartData.notes || [],
          startTimeMs: 0,
          youtubeVideoId,
          youtubeUrl,
          playbackSpeed: chartData.playbackSpeed || 1,
        });
      }
    } catch (error) {
      console.error('Failed to parse chart data:', error);
      alert('채보 데이터를 불러오는데 실패했습니다.');
    }
  };

  if (!isAuthenticated) {
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
            maxWidth: '400px',
            width: '90%',
          }}
        >
          <h2 style={{ color: '#fff', marginBottom: '20px', textAlign: 'center' }}>
            관리자 로그인
          </h2>
          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="관리자 토큰을 입력하세요"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #555',
              backgroundColor: '#1f1f1f',
              color: '#fff',
              fontSize: '14px',
              marginBottom: '15px',
            }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                fontSize: '14px',
                backgroundColor: '#616161',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              onClick={handleLogin}
              style={{
                flex: 1,
                padding: '12px',
                fontSize: '14px',
                fontWeight: 'bold',
                backgroundColor: '#2196F3',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              로그인
            </button>
          </div>
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
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1 style={{ color: '#fff', fontSize: '24px', margin: 0 }}>
          채보 관리자 패널
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

      {/* 메인 컨텐츠 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 채보 목록 */}
        <div
          style={{
            width: '400px',
            backgroundColor: '#2a2a2a',
            borderRight: '2px solid #444',
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ color: '#fff', fontSize: '18px', margin: 0 }}>
              대기 중인 채보 ({pendingCharts.length})
            </h2>
            <button
              onClick={loadPendingCharts}
              disabled={loading}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#424242',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '로딩...' : '새로고침'}
            </button>
          </div>

          {loading ? (
            <div style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
              로딩 중...
            </div>
          ) : pendingCharts.length === 0 ? (
            <div style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
              대기 중인 채보가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingCharts.map((chart) => (
                <div
                  key={chart.id}
                  onClick={() => setSelectedChart(chart)}
                  style={{
                    padding: '15px',
                    backgroundColor: selectedChart?.id === chart.id ? '#3a3a3a' : '#1f1f1f',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: selectedChart?.id === chart.id ? '2px solid #2196F3' : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
                    {chart.title}
                  </div>
                  <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '8px' }}>
                    작성자: {chart.author} | BPM: {chart.bpm} | 난이도: {chart.difficulty}
                  </div>
                  <div style={{ color: '#777', fontSize: '11px' }}>
                    {new Date(chart.created_at).toLocaleString('ko-KR')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 상세 정보 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          {selectedChart ? (
            <div>
              <h2 style={{ color: '#fff', fontSize: '22px', marginBottom: '20px' }}>
                {selectedChart.title}
              </h2>

              <div
                style={{
                  backgroundColor: '#2a2a2a',
                  padding: '20px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>작성자</div>
                    <div style={{ color: '#fff', fontSize: '16px' }}>{selectedChart.author}</div>
                  </div>
                  <div>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>BPM</div>
                    <div style={{ color: '#fff', fontSize: '16px' }}>{selectedChart.bpm}</div>
                  </div>
                  <div>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>난이도</div>
                    <div style={{ color: '#fff', fontSize: '16px' }}>{selectedChart.difficulty}</div>
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
                </div>

                {selectedChart.description && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>설명</div>
                    <div style={{ color: '#ddd', fontSize: '14px', lineHeight: 1.5 }}>
                      {selectedChart.description}
                    </div>
                  </div>
                )}

                {selectedChart.youtube_url && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>YouTube URL</div>
                    <a
                      href={selectedChart.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#2196F3', fontSize: '14px', wordBreak: 'break-all' }}
                    >
                      {selectedChart.youtube_url}
                    </a>
                  </div>
                )}

                <div style={{ marginTop: '15px' }}>
                  <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>업로드 일시</div>
                  <div style={{ color: '#ddd', fontSize: '14px' }}>
                    {new Date(selectedChart.created_at).toLocaleString('ko-KR')}
                  </div>
                </div>
              </div>

              {onTestChart && (
                <button
                  onClick={() => handleTestChart(selectedChart)}
                  style={{
                    padding: '12px 20px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    backgroundColor: '#4CAF50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginBottom: '20px',
                    width: '100%',
                  }}
                >
                  🎮 채보 테스트
                </button>
              )}

              <div
                style={{
                  backgroundColor: '#2a2a2a',
                  padding: '20px',
                  borderRadius: '8px',
                }}
              >
                <h3 style={{ color: '#fff', fontSize: '16px', marginBottom: '15px' }}>
                  승인/거절 처리
                </h3>

                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="검토 코멘트 (선택사항)"
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
                    marginBottom: '15px',
                  }}
                />

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleReject(selectedChart.id)}
                    disabled={processing}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      backgroundColor: processing ? '#424242' : '#f44336',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: processing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {processing ? '처리 중...' : '❌ 거절'}
                  </button>
                  <button
                    onClick={() => handleApprove(selectedChart.id)}
                    disabled={processing}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      backgroundColor: processing ? '#424242' : '#4CAF50',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: processing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {processing ? '처리 중...' : '✅ 승인'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#aaa',
                fontSize: '16px',
              }}
            >
              왼쪽에서 채보를 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
};




