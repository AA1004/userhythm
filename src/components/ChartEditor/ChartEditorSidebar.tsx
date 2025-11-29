import React from 'react';
import { CHART_EDITOR_THEME } from './constants';

interface ChartEditorSidebarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  playbackSpeed: number;
  playbackSpeedOptions: readonly number[];
  onPlaybackSpeedChange: (speed: number) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  beatsPerMeasure: number;
  onTimeSignatureChange: (beats: number) => void;
  gridDivision: number;
  onGridDivisionChange: (division: number) => void;
  timeSignatureOffset: number;
  onTimeSignatureOffsetChange: (offset: number) => void;
  isLongNoteMode: boolean;
  onToggleLongNoteMode: () => void;
  testStartInput: string;
  onTestStartInputChange: (input: string) => void;
  onSetTestStartToCurrent: () => void;
  onSetTestStartToZero: () => void;
  onTestChart: () => void;
  onShareClick: () => void;
}

export const ChartEditorSidebar: React.FC<ChartEditorSidebarProps> = ({
  zoom,
  onZoomChange,
  playbackSpeed,
  playbackSpeedOptions,
  onPlaybackSpeedChange,
  volume,
  onVolumeChange,
  beatsPerMeasure,
  onTimeSignatureChange,
  gridDivision,
  onGridDivisionChange,
  timeSignatureOffset,
  onTimeSignatureOffsetChange,
  isLongNoteMode,
  onToggleLongNoteMode,
  testStartInput,
  onTestStartInputChange,
  onSetTestStartToCurrent,
  onSetTestStartToZero,
  onTestChart,
  onShareClick,
}) => {
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
        <select
          value={playbackSpeed}
          onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
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
          {playbackSpeedOptions.map((speed) => (
            <option key={speed} value={speed}>
              {speed}x
            </option>
          ))}
        </select>
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

      {/* 타임시그니처 */}
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
          타임시그니처: {beatsPerMeasure}/4
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

      {/* 타임시그니처 오프셋 */}
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
          타임시그니처 오프셋: {timeSignatureOffset}ms
        </label>
        <input
          type="number"
          value={timeSignatureOffset}
          onChange={(e) => onTimeSignatureOffsetChange(parseInt(e.target.value) || 0)}
          style={{
            width: '100%',
            padding: '6px 8px',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            fontSize: '13px',
          }}
        />
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
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: '13px',
            cursor: 'pointer',
            gap: '8px',
          }}
        >
          <input
            type="checkbox"
            checked={isLongNoteMode}
            onChange={onToggleLongNoteMode}
          />
          롱노트 모드
        </label>
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

