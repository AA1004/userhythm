import React from 'react';

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
        width: '250px',
        backgroundColor: '#1a1a1a',
        padding: '16px',
        overflowY: 'auto',
        borderLeft: '1px solid #333',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>설정</h3>

      {/* 줌 조절 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>줌: {zoom.toFixed(2)}x</label>
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
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>재생 속도: {playbackSpeed}x</label>
        <select
          value={playbackSpeed}
          onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
          style={{
            width: '100%',
            padding: '6px',
            backgroundColor: '#2a2a2a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
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
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>볼륨: {volume}%</label>
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
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>타임시그니처: {beatsPerMeasure}/4</label>
        <select
          value={beatsPerMeasure}
          onChange={(e) => onTimeSignatureChange(parseInt(e.target.value))}
          style={{
            width: '100%',
            padding: '6px',
            backgroundColor: '#2a2a2a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
          }}
        >
          <option value={3}>3/4</option>
          <option value={4}>4/4</option>
          <option value={6}>6/8</option>
        </select>
      </div>

      {/* 그리드 분할 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>그리드 분할: 1/{gridDivision}</label>
        <select
          value={gridDivision}
          onChange={(e) => onGridDivisionChange(parseInt(e.target.value))}
          style={{
            width: '100%',
            padding: '6px',
            backgroundColor: '#2a2a2a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
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
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>타임시그니처 오프셋: {timeSignatureOffset}ms</label>
        <input
          type="number"
          value={timeSignatureOffset}
          onChange={(e) => onTimeSignatureOffsetChange(parseInt(e.target.value) || 0)}
          style={{
            width: '100%',
            padding: '6px',
            backgroundColor: '#2a2a2a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
          }}
        />
      </div>

      {/* 롱노트 모드 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isLongNoteMode}
            onChange={onToggleLongNoteMode}
            style={{ marginRight: '8px' }}
          />
          롱노트 모드
        </label>
      </div>

      {/* 테스트 시작 위치 */}
      <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#2a2a2a', borderRadius: '6px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>테스트 시작 위치</label>
        <input
          type="text"
          value={testStartInput}
          onChange={(e) => onTestStartInputChange(e.target.value)}
          placeholder="ms"
          style={{
            width: '100%',
            padding: '6px',
            backgroundColor: '#1a1a1a',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '4px',
            marginBottom: '8px',
          }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onSetTestStartToCurrent}
            style={{
              flex: 1,
              padding: '6px',
              backgroundColor: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
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
              backgroundColor: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
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
            padding: '10px',
            backgroundColor: '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
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
          backgroundColor: '#2196F3',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        공유
      </button>
    </div>
  );
};

