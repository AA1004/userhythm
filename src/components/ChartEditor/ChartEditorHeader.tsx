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
  isMenuOpen: boolean;
  isPlaying: boolean;
  isAutoScrollEnabled: boolean;
  isBpmInputOpen: boolean;
  youtubeUrl: string;
  isLoadingYoutubeMeta: boolean;
  tapCount: number;
  tapConfidence?: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
  songInfo: SongInfo;
  onToggleMenu: () => void;
  onRewind: () => void;
  onTogglePlayback: () => void;
  onStop: () => void;
  onToggleAutoScroll: () => void;
  onLoad: () => void;
  onSave: () => void;
  onSubtitleClick?: () => void;
  onExit: () => void;
  onYoutubeUrlChange: (url: string) => void;
  onYoutubeSubmit: () => void;
  onYoutubePaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onToggleBpmInput: () => void;
  onBpmInput: (val: string) => void;
  onTapBpm: () => void;
  onAddBpmChange: () => void;
  onAddBpmChangeAtCurrent: () => void;
  onEditBpmChange: (change: BPMChange) => void;
  onDeleteBpmChange: (id: number) => void;
}

export const ChartEditorHeader: React.FC<ChartEditorHeaderProps> = ({
  bpm,
  isMenuOpen,
  isPlaying,
  isAutoScrollEnabled,
  isBpmInputOpen,
  youtubeUrl,
  isLoadingYoutubeMeta,
  tapCount,
  tapConfidence,
  bpmChanges,
  songInfo,
  onToggleMenu,
  onRewind,
  onTogglePlayback,
  onStop,
  onToggleAutoScroll,
  onLoad,
  onSave,
  onSubtitleClick,
  onExit,
  onYoutubeUrlChange,
  onYoutubeSubmit,
  onYoutubePaste,
  onToggleBpmInput,
  onBpmInput,
  onTapBpm,
}) => {
  return (
    <div
      style={{
        background:
          'linear-gradient(90deg, rgba(15,23,42,0.98), rgba(17,24,39,0.98))',
        padding: '10px 14px',
        borderRadius: CHART_EDITOR_THEME.radiusLg,
        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        boxShadow: CHART_EDITOR_THEME.shadowSoft,
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

      {/* YouTube URL 입력 */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flex: 1,
          minWidth: '240px',
        }}
      >
        <input
          type="text"
          value={youtubeUrl}
          onChange={(e) => onYoutubeUrlChange(e.target.value)}
          onPaste={onYoutubePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onYoutubeSubmit();
            }
          }}
          placeholder="YouTube URL"
          style={{
            flex: 1,
            padding: '6px 10px',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            fontSize: '12px',
          }}
        />
        <button
          onClick={onYoutubeSubmit}
          disabled={isLoadingYoutubeMeta}
          style={{
            padding: '6px 12px',
            backgroundColor: isLoadingYoutubeMeta
              ? 'rgba(31,41,55,0.9)'
              : 'rgba(34,211,238,0.14)',
            color: CHART_EDITOR_THEME.accentStrong,
            border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            cursor: isLoadingYoutubeMeta ? 'not-allowed' : 'pointer',
            opacity: isLoadingYoutubeMeta ? 0.5 : 1,
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          {isLoadingYoutubeMeta ? '로딩...' : '적용'}
        </button>
      </div>

      {/* 곡 정보 */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          fontSize: '11px',
          color: CHART_EDITOR_THEME.textSecondary,
          padding: '4px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: 'rgba(15,23,42,0.9)',
        }}
      >
        <span>길이: {songInfo.durationFormatted}</span>
        <span>비트: {songInfo.totalBeats.toFixed(1)}</span>
        {songInfo.hasBpmChanges && <span>BPM 변속: {bpmChanges.length}개</span>}
      </div>

      {/* 메뉴 */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={onToggleMenu}
          style={{
            padding: '6px 12px',
            backgroundColor: 'rgba(15,23,42,0.9)',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          메뉴
        </button>
        {isMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: '#020617',
              border: `1px solid ${CHART_EDITOR_THEME.borderStrong}`,
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              padding: '8px',
              minWidth: '150px',
              zIndex: 1000,
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
            }}
          >
            <button
              onClick={onLoad}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'transparent',
                color: CHART_EDITOR_THEME.textPrimary,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              불러오기
            </button>
            <button
              onClick={onSave}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'transparent',
                color: CHART_EDITOR_THEME.textPrimary,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              저장
            </button>
            {onSubtitleClick && (
              <button
                onClick={onSubtitleClick}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'transparent',
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                자막
              </button>
            )}
            <button
              onClick={onExit}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'transparent',
                color: CHART_EDITOR_THEME.danger,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              종료
            </button>
          </div>
        )}
      </div>

      {/* BPM 변속 관리 (간단한 표시만) */}
      {bpmChanges.length > 0 && (
        <div
          style={{
            fontSize: '11px',
            color: CHART_EDITOR_THEME.textSecondary,
            padding: '4px 8px',
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            backgroundColor: 'rgba(15,23,42,0.85)',
          }}
        >
          변속: {bpmChanges.length}개
        </div>
      )}
    </div>
  );
};

