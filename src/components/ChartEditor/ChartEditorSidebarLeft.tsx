import React from 'react';
import { CHART_EDITOR_THEME } from './constants';
import { EditorNumberInput } from './EditorNumberInput';

interface ChartEditorSidebarLeftProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  playbackSpeed: number;
  playbackSpeedOptions: readonly number[];
  onPlaybackSpeedChange: (speed: number) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  hitSoundVolume: number;
  onHitSoundVolumeChange: (volume: number) => void;
  metronomeEnabled: boolean;
  onMetronomeEnabledChange: (enabled: boolean) => void;
  metronomeVolume: number;
  onMetronomeVolumeChange: (volume: number) => void;
  beatsPerMeasure: number;
  onTimeSignatureChange: (beats: number) => void;
  gridDivision: number;
  onGridDivisionChange: (division: number) => void;
  timeSignatureOffset: number;
  timelineExtraMs: number;
  audioOffsetMs: number;
  startDelayMs: number;
  onTimeSignatureOffsetChange: (offset: number) => void;
  onTimelineExtraChange: (updater: (prev: number) => number) => void;
  onAudioOffsetChange: (updater: (prev: number) => number) => void;
  onStartDelayChange: (updater: (prev: number) => number) => void;
  beatDuration: number;
}

const groupLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  margin: '10px 2px 6px',
  color: CHART_EDITOR_THEME.textSecondary,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const valueBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 34,
  padding: '2px 6px',
  borderRadius: 999,
  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
  backgroundColor: 'rgba(15,23,42,0.72)',
  color: CHART_EDITOR_THEME.accentStrong,
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1,
};

const SidebarGroupLabel: React.FC<{ label: string; detail?: string }> = ({ label, detail }) => (
  <div style={groupLabelStyle}>
    <span>{label}</span>
    {detail && <span style={{ color: CHART_EDITOR_THEME.textMuted, letterSpacing: '0.04em' }}>{detail}</span>}
  </div>
);

const ValueBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={valueBadgeStyle}>{children}</span>
);

const ChartEditorSidebarLeftInner: React.FC<ChartEditorSidebarLeftProps> = ({
  zoom,
  onZoomChange,
  playbackSpeed,
  playbackSpeedOptions,
  onPlaybackSpeedChange,
  volume,
  onVolumeChange,
  hitSoundVolume,
  onHitSoundVolumeChange,
  metronomeEnabled,
  onMetronomeEnabledChange,
  metronomeVolume,
  onMetronomeVolumeChange,
  beatsPerMeasure,
  onTimeSignatureChange,
  gridDivision,
  onGridDivisionChange,
  timeSignatureOffset,
  timelineExtraMs,
  audioOffsetMs,
  startDelayMs,
  onTimeSignatureOffsetChange,
  onTimelineExtraChange,
  onAudioOffsetChange,
  onStartDelayChange,
  beatDuration,
}) => {
  const gridCellMs = beatDuration / Math.max(1, gridDivision);
  const offsetInCells = timeSignatureOffset / gridCellMs;
  const timelineExtraCells = timelineExtraMs / gridCellMs;
  const displayAudioOffsetSeconds = (audioOffsetMs / 1000)
    .toFixed(3)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
  const displayStartDelaySeconds = (startDelayMs / 1000)
    .toFixed(3)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
  const displayOffset =
    offsetInCells === 0
      ? '0'
      : `${offsetInCells > 0 ? '+' : ''}${offsetInCells
          .toFixed(2)
          .replace(/\.0+$/, '')
          .replace(/(\.\d*?)0+$/, '$1')}`;
  const displayTimelineExtra =
    timelineExtraCells === 0
      ? '0'
      : `${timelineExtraCells > 0 ? '+' : ''}${timelineExtraCells
          .toFixed(2)
          .replace(/\.0+$/, '')
          .replace(/(\.\d*?)0+$/, '$1')}`;

  // 재생 속도 슬라이더용 보조 값
  const minPlaybackSpeed = Math.min(...playbackSpeedOptions);
  const maxPlaybackSpeed = Math.max(...playbackSpeedOptions);
  const midPlaybackSpeed = 1;
  const clampedMid =
    Math.min(Math.max(midPlaybackSpeed, minPlaybackSpeed), maxPlaybackSpeed);
  const midPlaybackPercent =
    ((clampedMid - minPlaybackSpeed) / (maxPlaybackSpeed - minPlaybackSpeed || 1)) *
    100;

  const handleOffsetAdjust = (direction: -1 | 1) => {
    const next = timeSignatureOffset + direction * gridCellMs;
    onTimeSignatureOffsetChange(next);
  };

  return (
    <div
      className="chart-editor-left-panel"
      style={{
        width: '240px',
        flexShrink: 0,
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        overscrollBehavior: 'contain',
        backgroundColor: CHART_EDITOR_THEME.sidebarBackground,
        padding: '10px 8px',
        borderRight: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        color: CHART_EDITOR_THEME.textPrimary,
      }}
    >
      <h3
        className="chart-editor-panel-title"
        style={{
          marginTop: 0,
          marginBottom: '8px',
          fontSize: '14px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: CHART_EDITOR_THEME.textSecondary,
        }}
      >
        설정
      </h3>

      <SidebarGroupLabel label="View" />

      {/* 줌 조절 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <span>줌</span>
          <ValueBadge>{zoom.toFixed(2)}x</ValueBadge>
        </label>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.1"
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          onMouseUp={(e) => e.currentTarget.blur()}
          onTouchEnd={(e) => e.currentTarget.blur()}
          style={{ width: '100%' }}
        />
      </div>

      {/* 재생 속도 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <span>재생 속도</span>
          <ValueBadge>{playbackSpeed}x</ValueBadge>
        </label>
        <input
          type="range"
          min={minPlaybackSpeed}
          max={maxPlaybackSpeed}
          step={0.05}
          value={playbackSpeed}
          onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
          onMouseUp={(e) => e.currentTarget.blur()}
          onTouchEnd={(e) => e.currentTarget.blur()}
          style={{ width: '100%' }}
        />
        <div
          style={{
            position: 'relative',
            marginTop: '4px',
            fontSize: '11px',
            color: CHART_EDITOR_THEME.textSecondary,
            height: '14px',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              transform: 'translateX(0%)',
            }}
          >
            {minPlaybackSpeed}x
          </span>
          <span
            style={{
              position: 'absolute',
              left: `${midPlaybackPercent}%`,
              transform: 'translateX(-50%)',
            }}
          >
            1.0x
          </span>
          <span
            style={{
              position: 'absolute',
              right: 0,
              transform: 'translateX(0%)',
            }}
          >
            {maxPlaybackSpeed}x
          </span>
        </div>
      </div>

      <SidebarGroupLabel label="Audio" />

      {/* 볼륨 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <span>볼륨</span>
          <ValueBadge>{volume}%</ValueBadge>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={volume}
          onChange={(e) => onVolumeChange(parseInt(e.target.value))}
          onMouseUp={(e) => e.currentTarget.blur()}
          onTouchEnd={(e) => e.currentTarget.blur()}
          style={{ width: '100%' }}
        />
      </div>

      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            오디오 시작 보정
          </span>
          <ValueBadge>{displayAudioOffsetSeconds}초</ValueBadge>
        </div>
        <div
          style={{
            marginBottom: 6,
            fontSize: 10,
            color: CHART_EDITOR_THEME.textMuted,
          }}
        >
          +면 노래가 늦게, -면 노래가 빨리 시작됩니다.
        </div>
        <EditorNumberInput
          value={audioOffsetMs / 1000}
          onCommit={(nextSeconds) => {
            if (nextSeconds == null) return;
            onAudioOffsetChange(() => Math.round(nextSeconds * 1000));
          }}
          ariaLabel="오디오 시작 보정 초"
          style={{ marginBottom: 6 }}
        />
        <div
          style={{
            display: 'flex',
            gap: 6,
          }}
        >
          <button
            data-editor-transient-action="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              onAudioOffsetChange((prev) => prev - 100);
            }}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(148,163,184,0.14)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            -0.1초
          </button>
          <button
            data-editor-transient-action="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              onAudioOffsetChange(() => 0);
            }}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(15,23,42,0.72)',
              color: CHART_EDITOR_THEME.textSecondary,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            0초
          </button>
          <button
            data-editor-transient-action="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              onAudioOffsetChange((prev) => prev + 100);
            }}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(34,211,238,0.14)',
              color: CHART_EDITOR_THEME.accentStrong,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            +0.1초
          </button>
        </div>
      </div>

      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            게임 시작 대기
          </span>
          <ValueBadge>{displayStartDelaySeconds}초</ValueBadge>
        </div>
        <div
          style={{
            marginBottom: 6,
            fontSize: 10,
            color: CHART_EDITOR_THEME.textMuted,
          }}
        >
          노트 타임라인 0초로 들어가기 전 대기 시간입니다. 시작부터 페이드가 있으면 0초로 둘 수 있습니다.
        </div>
        <EditorNumberInput
          value={startDelayMs / 1000}
          min={0}
          onCommit={(nextSeconds) => {
            if (nextSeconds == null) return;
            onStartDelayChange(() => Math.round(nextSeconds * 1000));
          }}
          ariaLabel="게임 시작 대기 초"
          style={{ marginBottom: 6 }}
        />
        <div
          style={{
            display: 'flex',
            gap: 6,
          }}
        >
          {[0, 2000, 4000].map((presetMs) => (
            <button
              key={presetMs}
              data-editor-transient-action="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.currentTarget.blur();
                onStartDelayChange(() => presetMs);
              }}
              style={{
                flex: 1,
                padding: '6px',
                backgroundColor:
                  presetMs === startDelayMs
                    ? 'rgba(34,211,238,0.18)'
                    : 'rgba(15,23,42,0.72)',
                color:
                  presetMs === startDelayMs
                    ? CHART_EDITOR_THEME.accentStrong
                    : CHART_EDITOR_THEME.textSecondary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              {presetMs / 1000}초
            </button>
          ))}
        </div>
      </div>

      {/* 키음 볼륨 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <span>키음 볼륨</span>
          <ValueBadge>{hitSoundVolume}%</ValueBadge>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={hitSoundVolume}
          onChange={(e) => onHitSoundVolumeChange(parseInt(e.target.value))}
          onMouseUp={(e) => e.currentTarget.blur()}
          onTouchEnd={(e) => e.currentTarget.blur()}
          style={{ width: '100%' }}
        />
      </div>

      {/* 메트로놈 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: metronomeEnabled
            ? 'rgba(34,211,238,0.08)'
            : CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${
            metronomeEnabled ? 'rgba(34,211,238,0.42)' : CHART_EDITOR_THEME.borderSubtle
          }`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>메트로놈</div>
            <div style={{ marginTop: 2, color: CHART_EDITOR_THEME.textMuted, fontSize: 9 }}>
              첫 박자는 높은 음으로 강조
            </div>
          </div>
          <button
            type="button"
            data-editor-transient-action="true"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              onMetronomeEnabledChange(!metronomeEnabled);
              event.currentTarget.blur();
            }}
            aria-pressed={metronomeEnabled}
            style={{
              minWidth: 48,
              padding: '5px 8px',
              borderRadius: 999,
              border: `1px solid ${
                metronomeEnabled ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
              }`,
              backgroundColor: metronomeEnabled
                ? 'rgba(34,211,238,0.18)'
                : 'rgba(15,23,42,0.72)',
              color: metronomeEnabled
                ? CHART_EDITOR_THEME.accentStrong
                : CHART_EDITOR_THEME.textMuted,
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            {metronomeEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 4,
            color: metronomeEnabled
              ? CHART_EDITOR_THEME.textSecondary
              : CHART_EDITOR_THEME.textMuted,
            fontSize: 10,
          }}
        >
          <span>볼륨</span>
          <ValueBadge>{metronomeVolume}%</ValueBadge>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={metronomeVolume}
          disabled={!metronomeEnabled}
          onChange={(event) => onMetronomeVolumeChange(parseInt(event.target.value, 10))}
          onMouseUp={(event) => event.currentTarget.blur()}
          onTouchEnd={(event) => event.currentTarget.blur()}
          aria-label="메트로놈 볼륨"
          style={{ width: '100%', opacity: metronomeEnabled ? 1 : 0.45 }}
        />
      </div>

      <SidebarGroupLabel label="Grid" detail={`${beatsPerMeasure}/4 · 1/${gridDivision}`} />

      {/* 박자표 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <span>박자표</span>
          <ValueBadge>{beatsPerMeasure}/4</ValueBadge>
        </label>
        <select
          value={beatsPerMeasure}
          onChange={(e) => {
            e.currentTarget.blur();
            onTimeSignatureChange(parseInt(e.target.value));
          }}
          style={{
            width: '100%',
            padding: '4px 6px',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            fontSize: '12px',
          }}
        >
          <option value={3}>3/4</option>
          <option value={4}>4/4</option>
          <option value={6}>6/8</option>
          <option value={7}>7/8</option>
        </select>
      </div>

      {/* 그리드 분할 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          <span>그리드 분할</span>
          <ValueBadge>1/{gridDivision}</ValueBadge>
        </label>
        <select
          value={gridDivision}
          onChange={(e) => {
            e.currentTarget.blur();
            onGridDivisionChange(parseInt(e.target.value));
          }}
          style={{
            width: '100%',
            padding: '4px 6px',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            fontSize: '12px',
          }}
        >
          <option value={1}>1/1</option>
          <option value={2}>1/2</option>
          <option value={3}>1/3 (셋잇단)</option>
          <option value={4}>1/4</option>
          <option value={6}>1/6</option>
          <option value={7}>1/7 (일곱잇단)</option>
          <option value={8}>1/8</option>
          <option value={16}>1/16</option>
        </select>
      </div>

      {/* 격자 위치 조정 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          격자 위치 조정
        </label>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <button
            data-editor-transient-action="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              handleOffsetAdjust(-1);
            }}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(148,163,184,0.14)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            당기기
          </button>
          <div
            style={{
              minWidth: '70px',
              textAlign: 'center',
              fontSize: '12px',
              color: CHART_EDITOR_THEME.textPrimary,
              fontWeight: 600,
            }}
          >
            {displayOffset}칸
          </div>
          <button
            data-editor-transient-action="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              handleOffsetAdjust(1);
            }}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(34,211,238,0.14)',
              color: CHART_EDITOR_THEME.accentStrong,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            밀기
          </button>
        </div>
      </div>

      {/* 타임라인 길이 조정 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: CHART_EDITOR_THEME.textSecondary,
            }}
          >
            타임라인 길이
          </span>
          <span
            style={{
              fontSize: 11,
              color: CHART_EDITOR_THEME.textPrimary,
            }}
          >
            {displayTimelineExtra}칸
          </span>
        </div>
        <div
          style={{
            marginBottom: 6,
            fontSize: 10,
            color: CHART_EDITOR_THEME.textMuted,
          }}
        >
          현재 그리드 기준 1칸 = {(gridCellMs / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}초
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
          }}
        >
          <button
            data-editor-transient-action="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              onTimelineExtraChange((prev) => Math.round(prev - gridCellMs));
            }}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(148,163,184,0.14)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            -1칸
          </button>
          <button
            data-editor-transient-action="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.currentTarget.blur();
              onTimelineExtraChange((prev) => Math.round(prev + gridCellMs));
            }}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(34,211,238,0.14)',
              color: CHART_EDITOR_THEME.accentStrong,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            +1칸
          </button>
        </div>
      </div>
    </div>
  );
};

export const ChartEditorSidebarLeft = React.memo(ChartEditorSidebarLeftInner);

