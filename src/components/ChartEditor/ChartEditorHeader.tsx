import React from 'react';
import { BPMChange } from '../../types/game';

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
        backgroundColor: '#1a1a1a',
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      {/* 재생 컨트롤 */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={onRewind}
          style={{
            padding: '6px 12px',
            backgroundColor: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ⏮
        </button>
        <button
          onClick={onTogglePlayback}
          style={{
            padding: '6px 12px',
            backgroundColor: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={onStop}
          style={{
            padding: '6px 12px',
            backgroundColor: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ⏹
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isAutoScrollEnabled}
            onChange={onToggleAutoScroll}
          />
          <span style={{ fontSize: '12px' }}>자동 스크롤</span>
        </label>
      </div>

      {/* BPM 입력 */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '14px' }}>BPM:</span>
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
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px',
            }}
          />
        ) : (
          <button
            onClick={onToggleBpmInput}
            style={{
              padding: '4px 8px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {Math.round(bpm)}
          </button>
        )}
        <button
          onClick={onTapBpm}
          style={{
            padding: '4px 8px',
            backgroundColor: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Tap ({tapCount})
        </button>
        {tapConfidence !== undefined && (
          <span style={{ fontSize: '12px', color: '#aaa' }}>
            신뢰도: {(tapConfidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {/* YouTube URL 입력 */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: '200px' }}>
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
            padding: '6px',
            backgroundColor: '#2a2a2a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            fontSize: '12px',
          }}
        />
        <button
          onClick={onYoutubeSubmit}
          disabled={isLoadingYoutubeMeta}
          style={{
            padding: '6px 12px',
            backgroundColor: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoadingYoutubeMeta ? 'not-allowed' : 'pointer',
            opacity: isLoadingYoutubeMeta ? 0.5 : 1,
          }}
        >
          {isLoadingYoutubeMeta ? '로딩...' : '적용'}
        </button>
      </div>

      {/* 곡 정보 */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px', color: '#aaa' }}>
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
            backgroundColor: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
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
              backgroundColor: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: '6px',
              padding: '8px',
              minWidth: '150px',
              zIndex: 1000,
            }}
          >
            <button
              onClick={onLoad}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
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
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
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
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textAlign: 'left',
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
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              종료
            </button>
          </div>
        )}
      </div>

      {/* BPM 변속 관리 (간단한 표시만) */}
      {bpmChanges.length > 0 && (
        <div style={{ fontSize: '12px', color: '#aaa' }}>
          변속: {bpmChanges.length}개
        </div>
      )}
    </div>
  );
};

