import React from 'react';
import { ApiChart } from '../../lib/api';
import { CHART_EDITOR_THEME } from './constants';

interface ChartEditorLoadExistingModalProps {
  isOpen: boolean;
  isLoading: boolean;
  error: string;
  charts: ApiChart[];
  search: string;
  onSearchChange: (value: string) => void;
  onReload: () => void;
  onLoadChart: (chart: ApiChart) => void;
  onClose: () => void;
}

export const ChartEditorLoadExistingModal: React.FC<ChartEditorLoadExistingModalProps> = ({
  isOpen,
  isLoading,
  error,
  charts,
  search,
  onSearchChange,
  onReload,
  onLoadChart,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(8px)',
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(780px, 92vw)',
          maxHeight: '84vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 18,
          borderRadius: 18,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          background:
            'linear-gradient(145deg, rgba(9,14,26,0.96), rgba(7,10,18,0.94))',
          color: CHART_EDITOR_THEME.textPrimary,
          boxShadow: '0 28px 72px rgba(0,0,0,0.42)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div
              style={{
                color: CHART_EDITOR_THEME.textSecondary,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Admin
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: 22 }}>기존 채보 불러오기</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 12px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              background: 'rgba(255,255,255,0.05)',
              color: CHART_EDITOR_THEME.textPrimary,
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="제목, 제작자, 난이도로 검색"
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              background: 'rgba(2, 6, 23, 0.88)',
              color: CHART_EDITOR_THEME.textPrimary,
            }}
          />
          <button
            type="button"
            onClick={onReload}
            style={{
              padding: '10px 14px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
              background: 'rgba(34,211,238,0.12)',
              color: CHART_EDITOR_THEME.accentStrong,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            새로고침
          </button>
        </div>

        <div
          style={{
            minHeight: 320,
            maxHeight: '56vh',
            overflowY: 'auto',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            background: 'rgba(15, 23, 42, 0.48)',
            padding: 10,
          }}
        >
          {isLoading ? (
            <div style={{ padding: 16, color: CHART_EDITOR_THEME.textMuted }}>채보 목록을 불러오는 중...</div>
          ) : error ? (
            <div style={{ padding: 16, color: '#fca5a5' }}>{error}</div>
          ) : charts.length === 0 ? (
            <div style={{ padding: 16, color: CHART_EDITOR_THEME.textMuted }}>표시할 채보가 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {charts.map((chart) => (
                <button
                  key={chart.id}
                  type="button"
                  onClick={() => onLoadChart(chart)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 10,
                    alignItems: 'center',
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: CHART_EDITOR_THEME.radiusMd,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: 'rgba(2, 6, 23, 0.66)',
                    color: CHART_EDITOR_THEME.textPrimary,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {chart.title}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: CHART_EDITOR_THEME.textSecondary }}>
                      {chart.author} · {chart.difficulty || '난이도 없음'} · {chart.status}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: 'rgba(34,211,238,0.14)',
                      color: CHART_EDITOR_THEME.accentStrong,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    불러오기
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
