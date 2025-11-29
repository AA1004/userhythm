import React from 'react';
import { BPMChange } from '../../types/game';
import { CHART_EDITOR_THEME } from './constants';

interface SongInfo {
  durationFormatted: string;
  totalBeats: number;
  formattedLength: string;
  hasBpmChanges: boolean;
  durationSeconds: number;
  baseBpm: number;
  bpmChanges: BPMChange[];
}

interface ChartEditorHeaderProps {
  bpm: number;
  isPlaying: boolean;
  isAutoScrollEnabled: boolean;
  isBpmInputOpen: boolean;
  youtubeVideoTitle?: string | null;
  isLoadingYoutubeMeta: boolean;
  tapCount: number;
  tapConfidence?: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
  songInfo: SongInfo;
  onRewind: () => void;
  onTogglePlayback: () => void;
  onStop: () => void;
  onToggleAutoScroll: () => void;
  onReset?: () => void;
  onSubtitleClick?: () => void;
  onExit: () => void;
  onYoutubePasteButton: () => void;
  onToggleBpmInput: () => void;
  onBpmInput: (val: string) => void;
  onTapBpm: () => void;
  onAddBpmChange: () => void;
  onAddBpmChangeAtCurrent: () => void;
  onEditBpmChange: (change: BPMChange) => void;
  onDeleteBpmChange: (id: number) => void;
  onExportJson?: () => void;
  onImportJson?: () => void;
}

export const ChartEditorHeader: React.FC<ChartEditorHeaderProps> = ({
  bpm,
  isPlaying,
  isAutoScrollEnabled,
  isBpmInputOpen,
  youtubeVideoTitle,
  isLoadingYoutubeMeta,
  tapCount,
  tapConfidence,
  bpmChanges,
  beatsPerMeasure,
  songInfo,
  onRewind,
  onTogglePlayback,
  onStop,
  onToggleAutoScroll,
  onReset,
  onSubtitleClick,
  onExit,
  onYoutubePasteButton,
  onToggleBpmInput,
  onBpmInput,
  onTapBpm,
  onAddBpmChange,
  onAddBpmChangeAtCurrent,
  onEditBpmChange,
  onDeleteBpmChange,
  onExportJson,
  onImportJson,
}) => {
  const measures = Math.max(1, Math.round(songInfo.totalBeats / beatsPerMeasure));
  const beatsRounded = Math.round(songInfo.totalBeats);

  const actionButtons = [
    ...(onImportJson ? [{ label: 'JSON 불러오기', onClick: onImportJson }] : []),
    ...(onExportJson ? [{ label: 'JSON 저장', onClick: onExportJson }] : []),
    ...(onReset ? [{ label: '초기화', onClick: onReset, variant: 'danger' as const }] : []),
    ...(onSubtitleClick ? [{ label: '자막', onClick: onSubtitleClick }] : []),
    { label: '종료', onClick: onExit, variant: 'danger' as const },
  ];

  return (
    <div
      style={{
        background:
          'linear-gradient(90deg, rgba(15,23,42,0.98), rgba(17,24,39,0.98))',
        padding: '12px 16px',
        borderRadius: CHART_EDITOR_THEME.radiusLg,
        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: CHART_EDITOR_THEME.shadowSoft,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          gap: '12px',
        }}
      >
        {/* 재생 컨트롤 */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            background:
              'radial-gradient(circle at top left, rgba(56,189,248,0.22), transparent 55%)',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={onRewind}
            style={{
              padding: '6px 10px',
              backgroundColor: 'rgba(15,23,42,0.9)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            ⏮
          </button>
          <button
            onClick={onTogglePlayback}
            style={{
              padding: '8px 14px',
              background:
                'linear-gradient(135deg, #22d3ee, #38bdf8)',
              color: '#0b1120',
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={onStop}
            style={{
              padding: '6px 10px',
              backgroundColor: 'rgba(15,23,42,0.9)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            ⏹
          </button>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              color: CHART_EDITOR_THEME.textSecondary,
            }}
          >
            <input
              type="checkbox"
              checked={isAutoScrollEnabled}
              onChange={onToggleAutoScroll}
            />
            <span>자동 스크롤</span>
          </label>
        </div>

        {/* BPM 입력 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            backgroundColor: 'rgba(15,23,42,0.95)',
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              color: CHART_EDITOR_THEME.textSecondary,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            BPM
          </span>
          {isBpmInputOpen ? (
            <input
              type="number"
              defaultValue={Math.round(bpm).toString()}
              onBlur={(e) => onBpmInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onBpmInput(e.currentTarget.value);
                }
              }}
              autoFocus
              style={{
                width: '60px',
                padding: '4px',
                backgroundColor: '#020617',
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderStrong}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                fontSize: '13px',
              }}
            />
          ) : (
            <button
              onClick={onToggleBpmInput}
              style={{
                padding: '4px 8px',
                backgroundColor: '#020617',
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {Math.round(bpm)}
            </button>
          )}
          <button
            onClick={onTapBpm}
            style={{
              padding: '4px 8px',
              backgroundColor: 'rgba(34,211,238,0.12)',
              color: CHART_EDITOR_THEME.accentStrong,
              border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            Tap ({tapCount})
          </button>
          {tapConfidence !== undefined && (
            <span
              style={{
                fontSize: '11px',
                color: CHART_EDITOR_THEME.textSecondary,
              }}
            >
              신뢰도: {(tapConfidence * 100).toFixed(0)}%
            </span>
          )}
        </div>

        {/* YouTube 메타 & 곡 정보 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flex: 1,
            minWidth: '240px',
            padding: '8px 12px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            backgroundColor: 'rgba(15,23,42,0.9)',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={onYoutubePasteButton}
            disabled={isLoadingYoutubeMeta}
            style={{
              flexShrink: 0,
              padding: '8px 10px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
              backgroundColor: isLoadingYoutubeMeta
                ? 'rgba(31,41,55,0.8)'
                : 'rgba(34,211,238,0.12)',
              color: CHART_EDITOR_THEME.accentStrong,
              cursor: isLoadingYoutubeMeta ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              opacity: isLoadingYoutubeMeta ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {isLoadingYoutubeMeta ? '로딩...' : 'YouTube 붙여넣기'}
          </button>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                color: CHART_EDITOR_THEME.textPrimary,
                fontWeight: 600,
                fontSize: '13px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={youtubeVideoTitle || ''}
            >
              {youtubeVideoTitle || '연결된 동영상이 없습니다'}
            </span>
            <span
              style={{
                color: CHART_EDITOR_THEME.textSecondary,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {songInfo.durationFormatted} · 길이: {measures}마디 ({beatsRounded}비트)
              {bpmChanges.length > 0 && ` · 변속 ${bpmChanges.length}개`}
            </span>
          </div>
        </div>

        {/* 주요 액션 */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {actionButtons.map((button) => (
            <button
              key={button.label}
              onClick={button.onClick}
              style={{
                padding: '6px 12px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${
                  button.variant === 'danger'
                    ? CHART_EDITOR_THEME.danger
                    : CHART_EDITOR_THEME.borderSubtle
                }`,
                backgroundColor:
                  button.variant === 'danger' ? 'rgba(248,113,113,0.12)' : 'rgba(15,23,42,0.85)',
                color:
                  button.variant === 'danger'
                    ? CHART_EDITOR_THEME.danger
                    : CHART_EDITOR_THEME.textPrimary,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>

      {/* 곡 정보 부가 표시 */}
      {/* 중복된 정보는 제거 */}
    </div>
  );
};

