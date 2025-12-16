import React from 'react';
import { CHART_EDITOR_THEME } from './constants';
import { TimeSignatureEvent } from '../../types/game';
import { timeToMeasure, beatIndexToTime } from '../../utils/bpmUtils';

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
  beatsPerMeasure: number;
  onTimeSignatureChange: (beats: number) => void;
  gridDivision: number;
  onGridDivisionChange: (division: number) => void;
  timeSignatureOffset: number;
  timelineExtraMs: number;
  onTimeSignatureOffsetChange: (offset: number) => void;
  onTimelineExtraChange: (updater: (prev: number) => number) => void;
  beatDuration: number;
  // 박자 변경
  timeSignatures?: TimeSignatureEvent[];
  bpm?: number;
  bpmChanges?: any[];
  onAddTimeSignatureChangeAtCurrent?: () => void;
  onEditTimeSignatureChange?: (ts: TimeSignatureEvent) => void;
  onDeleteTimeSignatureChange?: (id: number) => void;
}

export const ChartEditorSidebarLeft: React.FC<ChartEditorSidebarLeftProps> = ({
  zoom,
  onZoomChange,
  playbackSpeed,
  playbackSpeedOptions,
  onPlaybackSpeedChange,
  volume,
  onVolumeChange,
  hitSoundVolume,
  onHitSoundVolumeChange,
  beatsPerMeasure,
  onTimeSignatureChange,
  gridDivision,
  onGridDivisionChange,
  timeSignatureOffset,
  timelineExtraMs,
  onTimeSignatureOffsetChange,
  onTimelineExtraChange,
  beatDuration,
  timeSignatures = [],
  bpm = 120,
  bpmChanges = [],
  onAddTimeSignatureChangeAtCurrent,
  onEditTimeSignatureChange,
  onDeleteTimeSignatureChange,
}) => {
  const gridCellMs = beatDuration / Math.max(1, gridDivision);
  const offsetInCells = timeSignatureOffset / gridCellMs;
  const displayOffset =
    offsetInCells === 0
      ? '0'
      : `${offsetInCells > 0 ? '+' : ''}${offsetInCells
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
      style={{
        width: '240px',
        backgroundColor: CHART_EDITOR_THEME.sidebarBackground,
        padding: '10px 8px',
        borderRight: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        color: CHART_EDITOR_THEME.textPrimary,
      }}
    >
      <h3
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
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          줌: {zoom.toFixed(2)}x
        </label>
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.1"
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
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
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          재생 속도: {playbackSpeed}x
        </label>
        <input
          type="range"
          min={minPlaybackSpeed}
          max={maxPlaybackSpeed}
          step={0.05}
          value={playbackSpeed}
          onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
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
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          볼륨: {volume}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={volume}
          onChange={(e) => onVolumeChange(parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
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
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          키음 볼륨: {hitSoundVolume}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={hitSoundVolume}
          onChange={(e) => onHitSoundVolumeChange(parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

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
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          박자표: {beatsPerMeasure}/4
        </label>
        <select
          value={beatsPerMeasure}
          onChange={(e) => onTimeSignatureChange(parseInt(e.target.value))}
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
        {onAddTimeSignatureChangeAtCurrent && (
          <div style={{ marginTop: 6 }}>
            <button
              onClick={onAddTimeSignatureChangeAtCurrent}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid #fbbf24`,
                backgroundColor: 'rgba(251,191,36,0.12)',
                color: '#fbbf24',
                cursor: 'pointer',
              }}
            >
              + 현재 위치에 박자 변경 추가
            </button>
          </div>
        )}
        {timeSignatures && timeSignatures.length > 1 && onEditTimeSignatureChange && onDeleteTimeSignatureChange && (
          <div style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto' }}>
            {timeSignatures.slice(1).map((ts) => {
              const timeMs = beatIndexToTime(ts.beatIndex, bpm, bpmChanges);
              const measure = timeToMeasure(timeMs, bpm, bpmChanges, beatsPerMeasure);
              return (
                <div
                  key={ts.id}
                  style={{
                    padding: '4px 6px',
                    marginBottom: 4,
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    fontSize: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: CHART_EDITOR_THEME.textSecondary }}>
                    {measure}마디: {ts.beatsPerMeasure}/4
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => onEditTimeSignatureChange(ts)}
                      style={{
                        padding: '2px 4px',
                        fontSize: '9px',
                        borderRadius: 3,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        backgroundColor: 'transparent',
                        color: CHART_EDITOR_THEME.textSecondary,
                        cursor: 'pointer',
                      }}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => onDeleteTimeSignatureChange(ts.id)}
                      style={{
                        padding: '2px 4px',
                        fontSize: '9px',
                        borderRadius: 3,
                        border: `1px solid ${CHART_EDITOR_THEME.danger}`,
                        backgroundColor: 'transparent',
                        color: CHART_EDITOR_THEME.danger,
                        cursor: 'pointer',
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          그리드 분할: 1/{gridDivision}
        </label>
        <select
          value={gridDivision}
          onChange={(e) => onGridDivisionChange(parseInt(e.target.value))}
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
            display: 'block',
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
            onClick={() => handleOffsetAdjust(-1)}
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
            onClick={() => handleOffsetAdjust(1)}
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
            {timelineExtraMs >= 0 ? '+' : ''}
            {(timelineExtraMs / 1000).toFixed(0)}초
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
          }}
        >
          <button
            onClick={() => onTimelineExtraChange((prev) => prev - 5000)}
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
            -5초
          </button>
          <button
            onClick={() => onTimelineExtraChange((prev) => prev + 5000)}
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
            +5초
          </button>
        </div>
      </div>
    </div>
  );
};

