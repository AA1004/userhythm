import React from 'react';
import { CHART_EDITOR_THEME } from './constants';
import { SpeedChange, BPMChange } from '../../types/game';
import { timeToMeasure, measureToTime } from '../../utils/bpmUtils';

interface ChartEditorSidebarProps {
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
  isLongNoteMode: boolean;
  onToggleLongNoteMode: () => void;
  testStartInput: string;
  onTestStartInputChange: (input: string) => void;
  onSetTestStartToCurrent: () => void;
  onSetTestStartToZero: () => void;
  onTestChart: () => void;
  onShareClick: () => void;
  // 변속(SpeedChange)
  currentTimeMs: number;
  speedChanges: SpeedChange[];
  onAddSpeedChangeAtCurrent: () => void;
  onUpdateSpeedChange: (id: number, patch: Partial<SpeedChange>) => void;
  onDeleteSpeedChange: (id: number) => void;
  // 마디 계산을 위한 추가 props
  bpm: number;
  bpmChanges: BPMChange[];
}

export const ChartEditorSidebar: React.FC<ChartEditorSidebarProps> = ({
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
  isLongNoteMode,
  onToggleLongNoteMode,
  testStartInput,
  onTestStartInputChange,
  onSetTestStartToCurrent,
  onSetTestStartToZero,
  onTestChart,
  onShareClick,
  currentTimeMs,
  speedChanges,
  onAddSpeedChangeAtCurrent,
  onUpdateSpeedChange,
  onDeleteSpeedChange,
  bpm,
  bpmChanges,
}) => {
  const gridCellMs = beatDuration / Math.max(1, gridDivision);
  const offsetInCells = timeSignatureOffset / gridCellMs;
  const displayOffset =
    offsetInCells === 0
      ? '0'
      : `${offsetInCells > 0 ? '+' : ''}${offsetInCells
          .toFixed(2)
          .replace(/\\.0+$/, '')
          .replace(/(\\.\\d*?)0+$/, '$1')}`;

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
        width: '280px',
        backgroundColor: CHART_EDITOR_THEME.sidebarBackground,
        padding: '16px 14px',
        overflowY: 'auto',
        borderRight: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        color: CHART_EDITOR_THEME.textPrimary,
      }}
    >
      <h3
        style={{
          marginTop: 0,
          marginBottom: '12px',
          fontSize: '16px',
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
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '13px',
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
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '13px',
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
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '13px',
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
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '13px',
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
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '13px',
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
            padding: '6px 8px',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            fontSize: '13px',
          }}
        >
          <option value={3}>3/4</option>
          <option value={4}>4/4</option>
          <option value={6}>6/8</option>
        </select>
      </div>

      {/* 그리드 분할 */}
      <div
        style={{
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '13px',
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
            padding: '6px 8px',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            fontSize: '13px',
          }}
        >
          <option value={1}>1/1</option>
          <option value={2}>1/2</option>
          <option value={4}>1/4</option>
          <option value={8}>1/8</option>
          <option value={16}>1/16</option>
        </select>
      </div>

      {/* 격자 위치 조정 */}
      <div
        style={{
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          격자 위치 조정
        </label>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            onClick={() => handleOffsetAdjust(-1)}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: 'rgba(148,163,184,0.14)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            당기기
          </button>
          <div
            style={{
              minWidth: '90px',
              textAlign: 'center',
              fontSize: '13px',
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
              padding: '8px',
              backgroundColor: 'rgba(34,211,238,0.14)',
              color: CHART_EDITOR_THEME.accentStrong,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '12px',
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
          marginBottom: '16px',
          padding: '10px 12px',
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
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: CHART_EDITOR_THEME.textSecondary,
            }}
          >
            타임라인 길이
          </span>
          <span
            style={{
              fontSize: 12,
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
            gap: 8,
          }}
        >
          <button
            onClick={() => onTimelineExtraChange((prev) => prev - 5000)}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: 'rgba(148,163,184,0.14)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            -5초
          </button>
          <button
            onClick={() => onTimelineExtraChange((prev) => prev + 5000)}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: 'rgba(34,211,238,0.14)',
              color: CHART_EDITOR_THEME.accentStrong,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
          }}
          >
            +5초
          </button>
        </div>
      </div>

      {/* 롱노트 모드 */}
      <div
        style={{
          marginBottom: '16px',
          padding: '10px 12px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <button
          onClick={(e) => {
            onToggleLongNoteMode();
            // 버튼에 포커스가 남아 키 입력이 막히는 것을 방지
            e.currentTarget.blur();
          }}
          onMouseDown={(e) => {
            // 클릭 시 포커스가 버튼에 머무르지 않도록 기본 포커스 행동 차단
            e.preventDefault();
          }}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            border: `1px solid ${
              isLongNoteMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
            }`,
            background: isLongNoteMode
              ? 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.05))'
              : 'transparent',
            color: isLongNoteMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          롱노트 모드
        </button>
      </div>

      {/* 변속 (Speed Changes) */}
      <div
        style={{
          marginBottom: '18px',
          padding: '12px',
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            변속 구간
          </span>
          <button
            onClick={onAddSpeedChangeAtCurrent}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
              backgroundColor: 'rgba(34,211,238,0.12)',
              color: CHART_EDITOR_THEME.accentStrong,
              cursor: 'pointer',
            }}
          >
            + 현재 위치에 추가
          </button>
        </div>
        <div
          style={{
            fontSize: '11px',
            color: CHART_EDITOR_THEME.textSecondary,
            marginBottom: '6px',
          }}
        >
          기준 BPM은 상단 BPM 입력값이며, 변속 구간 BPM은 절대값입니다.
        </div>
        {speedChanges.length === 0 ? (
          <div
            style={{
              fontSize: '12px',
              color: CHART_EDITOR_THEME.textMuted,
            }}
          >
            아직 변속 구간이 없습니다.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: 180,
              overflowY: 'auto',
            }}
          >
            {speedChanges.map((sc) => {
              const startMeasure = timeToMeasure(sc.startTimeMs, bpm, bpmChanges, beatsPerMeasure);
              const endMeasure = sc.endTimeMs == null ? null : timeToMeasure(sc.endTimeMs, bpm, bpmChanges, beatsPerMeasure);
              const isCurrent =
                currentTimeMs >= sc.startTimeMs &&
                (sc.endTimeMs == null || currentTimeMs < sc.endTimeMs);
              return (
                <div
                  key={sc.id}
                  style={{
                    padding: '8px 8px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${
                      isCurrent
                        ? CHART_EDITOR_THEME.accentStrong
                        : CHART_EDITOR_THEME.borderSubtle
                    }`,
                    backgroundColor: isCurrent
                      ? 'rgba(34,211,238,0.12)'
                      : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        color: CHART_EDITOR_THEME.textSecondary,
                      }}
                    >
                      시작
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={startMeasure}
                      onChange={(e) => {
                        const measure = Math.max(1, parseInt(e.target.value || '1'));
                        const timeMs = measureToTime(measure, bpm, bpmChanges, beatsPerMeasure);
                        onUpdateSpeedChange(sc.id, {
                          startTimeMs: timeMs,
                        });
                      }}
                      style={{
                        flex: 1,
                        padding: '2px 4px',
                        fontSize: '11px',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <span
                      style={{
                        fontSize: '11px',
                        color: CHART_EDITOR_THEME.textSecondary,
                      }}
                    >
                      마디
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        color: CHART_EDITOR_THEME.textSecondary,
                      }}
                    >
                      끝
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={endMeasure || ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) {
                          onUpdateSpeedChange(sc.id, { endTimeMs: null });
                          return;
                        }
                        const measure = Math.max(1, parseInt(raw));
                        const timeMs = measureToTime(measure, bpm, bpmChanges, beatsPerMeasure);
                        onUpdateSpeedChange(sc.id, { endTimeMs: timeMs });
                      }}
                      placeholder="끝까지"
                      style={{
                        flex: 1,
                        padding: '2px 4px',
                        fontSize: '11px',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <span
                      style={{
                        fontSize: '11px',
                        color: CHART_EDITOR_THEME.textSecondary,
                      }}
                    >
                      마디
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        color: CHART_EDITOR_THEME.textSecondary,
                      }}
                    >
                      BPM
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={sc.bpm}
                      onChange={(e) =>
                        onUpdateSpeedChange(sc.id, {
                          bpm: Math.max(1, parseFloat(e.target.value || '1')),
                        })
                      }
                      style={{
                        flex: 1,
                        padding: '2px 4px',
                        fontSize: '11px',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <button
                      onClick={() => onDeleteSpeedChange(sc.id)}
                      style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: 'none',
                        backgroundColor: 'rgba(248,113,113,0.18)',
                        color: '#fecaca',
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

      {/* 테스트 시작 위치 */}
      <div
        style={{
          marginBottom: '18px',
          padding: '12px',
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          테스트 시작 위치
        </label>
        <input
          type="text"
          value={testStartInput}
          onChange={(e) => onTestStartInputChange(e.target.value)}
          placeholder="ms"
          style={{
            width: '100%',
            padding: '6px 8px',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            marginBottom: '8px',
            fontSize: '13px',
          }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onSetTestStartToCurrent}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(34,211,238,0.14)',
              color: CHART_EDITOR_THEME.accentStrong,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            현재 위치
          </button>
          <button
            onClick={onSetTestStartToZero}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: 'rgba(148,163,184,0.14)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            0
          </button>
        </div>
        <button
          onClick={onTestChart}
          style={{
            width: '100%',
            marginTop: '8px',
            padding: '9px',
            background:
              'linear-gradient(135deg, #22c55e, #4ade80)',
            color: '#022c22',
            border: 'none',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13px',
          }}
        >
          테스트 실행
        </button>
      </div>

      {/* 공유 버튼 */}
      <button
        onClick={onShareClick}
        style={{
          width: '100%',
          padding: '10px',
          background:
            'linear-gradient(135deg, #38bdf8, #818cf8)',
          color: '#0b1120',
          border: 'none',
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '13px',
        }}
      >
        공유
      </button>
    </div>
  );
};

