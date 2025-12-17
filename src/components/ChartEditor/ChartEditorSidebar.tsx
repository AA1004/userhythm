import React from 'react';
import { CHART_EDITOR_THEME } from './constants';
import { SpeedChange, BPMChange, BgaVisibilityInterval } from '../../types/game';
import { timeToMeasure, beatIndexToTime, timeToBeatIndex } from '../../utils/bpmUtils';

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
  isSelectionMode: boolean;
  onToggleSelectionMode: () => void;
  isMoveMode: boolean;
  onToggleMoveMode: () => void;
  onMirrorNotes?: () => void;
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
  // BGA 가림 구간
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  onAddBgaInterval: () => void;
  onUpdateBgaInterval: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  onDeleteBgaInterval: (id: string) => void;
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
  isSelectionMode,
  onToggleSelectionMode,
  isMoveMode,
  onToggleMoveMode,
  onMirrorNotes,
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
  bgaVisibilityIntervals,
  onAddBgaInterval,
  onUpdateBgaInterval,
  onDeleteBgaInterval,
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
          max="6"
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
          <option value={7}>7/8</option>
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

      {/* 선택 모드 */}
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
            onToggleSelectionMode();
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
              isSelectionMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
            }`,
            background: isSelectionMode
              ? 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.05))'
              : 'transparent',
            color: isSelectionMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          영역 선택 모드
        </button>
      </div>

      {/* 선택 영역 이동 모드 */}
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
            onToggleMoveMode();
            e.currentTarget.blur();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            border: `1px solid ${
              isMoveMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
            }`,
            background: isMoveMode
              ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))'
              : 'transparent',
            color: isMoveMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '8px',
          }}
        >
          선택 영역 이동 모드
        </button>
        {onMirrorNotes && (
          <button
            onClick={(e) => {
              onMirrorNotes();
              e.currentTarget.blur();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              background: 'transparent',
              color: CHART_EDITOR_THEME.textPrimary,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBg;
              e.currentTarget.style.borderColor = CHART_EDITOR_THEME.accentStrong;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = CHART_EDITOR_THEME.borderSubtle;
            }}
          >
            🔄 선대칭 반전
          </button>
        )}
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
                        const beatIdx = (measure - 1) * beatsPerMeasure;
                        const timeMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
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
                        const beatIdx = (measure - 1) * beatsPerMeasure;
                        const timeMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
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

      {/* 채보 레인 숨김 구간 */}
      <div
        style={{
          marginBottom: '18px',
          padding: '12px',
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>간주 구간 (채보 레인 숨김)</span>
          <button
            onClick={onAddBgaInterval}
            style={{
              padding: '3px 7px',
              fontSize: '11px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
              backgroundColor: 'rgba(34,211,238,0.12)',
              color: CHART_EDITOR_THEME.accentStrong,
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
        {bgaVisibilityIntervals.length === 0 ? (
          <div style={{ fontSize: 11, color: CHART_EDITOR_THEME.textMuted }}>구간 없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {bgaVisibilityIntervals.map((it) => {
              // 시간을 비트 인덱스로 변환 후 마디.박 계산
              const startBeatIdx = timeToBeatIndex(it.startTimeMs, bpm, bpmChanges);
              const endBeatIdx = timeToBeatIndex(it.endTimeMs, bpm, bpmChanges);
              
              const startMeasureNum = Math.floor(startBeatIdx / beatsPerMeasure);
              const startBeat = Math.floor(startBeatIdx % beatsPerMeasure) + 1;
              const endMeasureNum = Math.floor(endBeatIdx / beatsPerMeasure);
              const endBeat = Math.floor(endBeatIdx % beatsPerMeasure) + 1;

              return (
                <div
                  key={it.id}
                  style={{
                    padding: '6px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${it.mode === 'hidden' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}`,
                    backgroundColor: 'rgba(15,23,42,0.4)',
                  }}
                >
                  {/* 첫 줄: 구간 범위 (마디.박) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <input
                      type="text"
                      placeholder="마디"
                      value={startMeasureNum + 1}
                      onChange={(e) => {
                        const m = Math.max(0, (parseInt(e.target.value) || 1) - 1);
                        const beatIdx = m * beatsPerMeasure + (startBeat - 1);
                        const newMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                        onUpdateBgaInterval(it.id, { startTimeMs: newMs });
                      }}
                      style={{
                        width: 32,
                        padding: '3px 4px',
                        fontSize: 11,
                        textAlign: 'center',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textSecondary }}>.</span>
                    <input
                      type="text"
                      placeholder="박"
                      value={startBeat}
                      onChange={(e) => {
                        const b = Math.max(1, Math.min(beatsPerMeasure, parseInt(e.target.value) || 1));
                        const beatIdx = startMeasureNum * beatsPerMeasure + (b - 1);
                        const newMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                        onUpdateBgaInterval(it.id, { startTimeMs: newMs });
                      }}
                      style={{
                        width: 28,
                        padding: '3px 4px',
                        fontSize: 11,
                        textAlign: 'center',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textMuted, margin: '0 2px' }}>~</span>
                    <input
                      type="text"
                      placeholder="마디"
                      value={endMeasureNum + 1}
                      onChange={(e) => {
                        const m = Math.max(0, (parseInt(e.target.value) || 1) - 1);
                        const beatIdx = m * beatsPerMeasure + (endBeat - 1);
                        const newMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                        onUpdateBgaInterval(it.id, { endTimeMs: newMs });
                      }}
                      style={{
                        width: 32,
                        padding: '3px 4px',
                        fontSize: 11,
                        textAlign: 'center',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textSecondary }}>.</span>
                    <input
                      type="text"
                      placeholder="박"
                      value={endBeat}
                      onChange={(e) => {
                        const b = Math.max(1, Math.min(beatsPerMeasure, parseInt(e.target.value) || 1));
                        const beatIdx = endMeasureNum * beatsPerMeasure + (b - 1);
                        const newMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                        onUpdateBgaInterval(it.id, { endTimeMs: newMs });
                      }}
                      style={{
                        width: 28,
                        padding: '3px 4px',
                        fontSize: 11,
                        textAlign: 'center',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={() => onDeleteBgaInterval(it.id)}
                      style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: `1px solid ${CHART_EDITOR_THEME.danger}`,
                        backgroundColor: 'rgba(239,68,68,0.12)',
                        color: CHART_EDITOR_THEME.danger,
                        cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {/* 둘째 줄: 모드 + 페이드 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => onUpdateBgaInterval(it.id, { mode: it.mode === 'hidden' ? 'visible' : 'hidden' })}
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: `1px solid ${it.mode === 'hidden' ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'}`,
                        backgroundColor: it.mode === 'hidden' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                        color: it.mode === 'hidden' ? '#fca5a5' : '#86efac',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {it.mode === 'hidden' ? '레인 숨김' : '레인 표시'}
                    </button>
                    <span style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>F-in</span>
                    <input
                      type="number"
                      min={0}
                      value={Math.round(it.fadeInMs ?? 0)}
                      onChange={(e) =>
                        onUpdateBgaInterval(it.id, { fadeInMs: Math.max(0, Number(e.target.value) || 0) })
                      }
                      style={{
                        width: 42,
                        padding: '2px 4px',
                        fontSize: 10,
                        textAlign: 'center',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <span style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>F-out</span>
                    <input
                      type="number"
                      min={0}
                      value={Math.round(it.fadeOutMs ?? 0)}
                      onChange={(e) =>
                        onUpdateBgaInterval(it.id, { fadeOutMs: Math.max(0, Number(e.target.value) || 0) })
                      }
                      style={{
                        width: 42,
                        padding: '2px 4px',
                        fontSize: 10,
                        textAlign: 'center',
                        backgroundColor: '#020617',
                        color: CHART_EDITOR_THEME.textPrimary,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                      }}
                    />
                    <button
                      onClick={() => onUpdateBgaInterval(it.id, { fadeInMs: 0, fadeOutMs: 0 })}
                      title="페이드 제거 (하드컷)"
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        backgroundColor: 'rgba(148,163,184,0.12)',
                        color: CHART_EDITOR_THEME.textSecondary,
                        cursor: 'pointer',
                      }}
                    >
                      즉시
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

