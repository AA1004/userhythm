import React, { useState, useEffect, useCallback } from 'react';
import { api, ApiChart } from '../lib/api';
import { extractYouTubeVideoId } from '../utils/youtube';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

interface ChartAdminProps {
  onClose: () => void;
  onTestChart?: (chartData: any) => void;
}

type ChartListStatus = 'pending' | 'approved' | 'rejected' | 'all';

export const ChartAdmin: React.FC<ChartAdminProps> = ({ onClose, onTestChart }) => {
  const [chartList, setChartList] = useState<ApiChart[]>([]);
  const [listStatus, setListStatus] = useState<ChartListStatus>('approved');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedChart, setSelectedChart] = useState<ApiChart | null>(null);
  const [adminToken, setAdminToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);

  const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'admin123';
  
  // localhost:5173에서 접속하면 자동으로 ADMIN 인증
  const isLocalhostDev = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port === '5173';

  const loadCharts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPendingCharts(listStatus);
      setChartList(res.charts);
    } catch (error) {
      console.error('Failed to load pending charts:', error);
      alert('채보 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [listStatus]);

  // localhost:5173이면 자동으로 인증
  useEffect(() => {
    if (isLocalhostDev) {
      setIsAuthenticated(true);
    }
  }, [isLocalhostDev]);

  useEffect(() => {
    if (isAuthenticated) {
      loadCharts();
    }
  }, [isAuthenticated, loadCharts]);

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
      await api.updateChartStatus(chartId, 'approved', reviewComment);
      alert('채보가 승인되었습니다!');
      setReviewComment('');
      setSelectedChart(null);
      await loadCharts();
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
      await api.updateChartStatus(chartId, 'rejected', reviewComment);
      alert('채보가 거절되었습니다.');
      setReviewComment('');
      setSelectedChart(null);
      await loadCharts();
    } catch (error) {
      console.error('Rejection failed:', error);
      alert('거절에 실패했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (chartId: string) => {
    if (!confirm('이 맵을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.')) return;

    setProcessing(true);
    try {
      await api.deleteChart(chartId);
      alert('맵이 삭제되었습니다.');
      setReviewComment('');
      setSelectedChart(null);
      await loadCharts();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('맵 삭제에 실패했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const normalizeChart = (chart: ApiChart) => {
    try {
      const data = JSON.parse(chart.data_json || '{}');
      const youtubeUrl: string = data.youtubeUrl || chart.youtube_url || '';
      let youtubeVideoId: string | null = data.youtubeVideoId || null;
      if (!youtubeVideoId && youtubeUrl) {
        youtubeVideoId = extractYouTubeVideoId(youtubeUrl);
      }
      const notesLength = Array.isArray(data.notes) ? data.notes.length : '?';
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
      return {
        ...chart,
        _data: data,
        _youtubeVideoId: youtubeVideoId,
        _youtubeUrl: youtubeUrl,
        _notesLength: notesLength,
        _authorChess: authorChess,
        _authorLabel: authorLabel,
        _isAdmin: chart.author_role === 'admin',
        _isModerator: chart.author_role === 'moderator',
      };
    } catch {
      return {
        ...chart,
        _data: null,
        _youtubeVideoId: null,
        _youtubeUrl: null,
        _notesLength: '?',
        _authorChess: '♟',
        _authorLabel: chart.author,
        _isAdmin: chart.author_role === 'admin',
        _isModerator: chart.author_role === 'moderator',
      };
    }
  };

  const handleTestChart = (chart: ApiChart) => {
    const normalized = normalizeChart(chart);
    try {
      if (onTestChart) {
        onTestChart({
          notes: normalized._data?.notes || [],
          startTimeMs: 0,
          youtubeVideoId: normalized._youtubeVideoId,
          youtubeUrl: normalized._youtubeUrl,
          playbackSpeed: normalized._data?.playbackSpeed || 1,
          bpm: normalized.bpm,
          speedChanges: normalized._data?.speedChanges || [],
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
          background: CHART_EDITOR_THEME.overlayScrim,
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
            maxWidth: '400px',
            width: '90%',
            boxShadow: CHART_EDITOR_THEME.shadowSoft,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          }}
        >
          <h2 style={{ color: CHART_EDITOR_THEME.textPrimary, marginBottom: '20px', textAlign: 'center' }}>
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
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
              backgroundColor: CHART_EDITOR_THEME.inputBg,
              color: CHART_EDITOR_THEME.textPrimary,
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
                background: CHART_EDITOR_THEME.buttonGhostBg,
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
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
                background: CHART_EDITOR_THEME.buttonPrimaryBg,
                color: CHART_EDITOR_THEME.buttonPrimaryText,
                border: 'none',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
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
          background: CHART_EDITOR_THEME.backgroundGradient,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          padding: '20px',
          borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '24px', margin: 0 }}>
          채보 관리자 패널
        </h1>
        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            background: CHART_EDITOR_THEME.buttonGhostBg,
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
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
            backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
            borderRight: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '18px', margin: 0 }}>
              채보 목록 ({chartList.length})
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={listStatus}
                onChange={(e) => {
                  const nextStatus = e.target.value as ChartListStatus;
                  setListStatus(nextStatus);
                  setSelectedChart(null);
                }}
                disabled={loading}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  background: CHART_EDITOR_THEME.inputBg,
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                <option value="approved">승인됨</option>
                <option value="pending">대기중</option>
                <option value="rejected">거절됨</option>
                <option value="all">전체</option>
              </select>
              <button
                onClick={loadCharts}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: CHART_EDITOR_THEME.buttonGhostBg,
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? '로딩...' : '새로고침'}
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ color: CHART_EDITOR_THEME.textSecondary, textAlign: 'center', padding: '20px' }}>
              로딩 중...
            </div>
          ) : chartList.length === 0 ? (
            <div style={{ color: CHART_EDITOR_THEME.textSecondary, textAlign: 'center', padding: '20px' }}>
              선택한 조건의 채보가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {chartList.map((chart) => {
                const normalized = normalizeChart(chart);
                return (
                <div
                  key={chart.id}
                  onClick={() => setSelectedChart(normalized)}
                  style={{
                    padding: '15px',
                    backgroundColor: selectedChart?.id === chart.id ? CHART_EDITOR_THEME.surface : '#020617',
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    cursor: 'pointer',
                    border: selectedChart?.id === chart.id
                      ? `1px solid ${CHART_EDITOR_THEME.accentStrong}`
                      : `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
                    {chart.title}
                  </div>
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '8px' }}>
                      <span>{normalized._authorChess} </span>
                      <span style={{ fontWeight: normalized._isAdmin ? 'bold' : undefined, color: normalized._isAdmin ? '#f87171' : undefined }}>
                        {normalized._authorLabel}
                      </span>
                      {normalized._isAdmin && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', backgroundColor: '#b91c1c', color: '#fff', marginLeft: '6px' }}>
                          ADMIN
                        </span>
                      )}
                      <span> | {chart.status} | BPM: {chart.bpm} | 난이도: {chart.difficulty}</span>
                  </div>
                  <div style={{ color: CHART_EDITOR_THEME.textMuted, fontSize: '11px' }}>
                    {chart.created_at ? new Date(chart.created_at).toLocaleString('ko-KR') : '정보 없음'}
                  </div>
                </div>
                );
              })}
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
              <h2 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '22px', marginBottom: '20px' }}>
                {selectedChart.title}
              </h2>

              <div
                style={{
                  backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                  padding: '20px',
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
                  marginBottom: '20px',
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
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
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '999px',
                            backgroundColor: '#b91c1c',
                            color: '#fff',
                          }}
                        >
                          ADMIN
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>BPM</div>
                    <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.bpm}</div>
                  </div>
                  <div>
                    <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>난이도</div>
                    <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px' }}>{selectedChart.difficulty}</div>
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
                </div>

                {selectedChart.description && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>설명</div>
                    <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '14px', lineHeight: 1.5 }}>
                      {selectedChart.description}
                    </div>
                  </div>
                )}

                {selectedChart.youtube_url && (
                  <div style={{ marginTop: '15px' }}>
                    <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>YouTube URL</div>
                    <a
                      href={selectedChart.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#38bdf8', fontSize: '14px', wordBreak: 'break-all' }}
                    >
                      {selectedChart.youtube_url}
                    </a>
                  </div>
                )}

                <div style={{ marginTop: '15px' }}>
                  <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '5px' }}>업로드 일시</div>
                <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '14px' }}>
                  {selectedChart.created_at
                    ? new Date(selectedChart.created_at).toLocaleString('ko-KR')
                    : '정보 없음'}
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
                    background: CHART_EDITOR_THEME.buttonPrimaryBg,
                    color: CHART_EDITOR_THEME.buttonPrimaryText,
                    border: 'none',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
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
                  backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                  padding: '20px',
                  borderRadius: CHART_EDITOR_THEME.radiusMd,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              >
                <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '16px', marginBottom: '15px' }}>
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
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.inputBorder}`,
                    backgroundColor: CHART_EDITOR_THEME.inputBg,
                    color: CHART_EDITOR_THEME.textPrimary,
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
                      backgroundColor: processing ? '#4b1212' : CHART_EDITOR_THEME.danger,
                      color: '#fff',
                      border: 'none',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
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
                      backgroundColor: processing ? '#14532d' : CHART_EDITOR_THEME.success,
                      color: '#fff',
                      border: 'none',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      cursor: processing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {processing ? '처리 중...' : '✅ 승인'}
                  </button>
                </div>
                <button
                  onClick={() => handleDelete(selectedChart.id)}
                  disabled={processing}
                  style={{
                    width: '100%',
                    marginTop: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    backgroundColor: processing ? '#3f3f46' : '#7f1d1d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    cursor: processing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {processing ? '처리 중...' : '🗑 맵 삭제'}
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: CHART_EDITOR_THEME.textSecondary,
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




