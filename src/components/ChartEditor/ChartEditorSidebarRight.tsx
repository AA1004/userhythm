import React from 'react';
import { SpeedChange, BgaVisibilityInterval, BPMChange } from '../../types/game';
import { CHART_EDITOR_THEME } from './constants';
import { timeToMeasure, beatIndexToTime, timeToBeatIndex } from '../../utils/bpmUtils';

export interface ChartEditorSidebarRightProps {
  // 롱노트 모드
  isLongNoteMode: boolean;
  onToggleLongNoteMode: () => void;

  // 이동 모드
  isMoveMode: boolean;
  onToggleMoveMode: () => void;
  onMirrorNotes: () => void;

  // 변속 구간
  speedChanges: SpeedChange[];
  onAddSpeedChange: () => void;
  onUpdateSpeedChange: (id: number, patch: Partial<SpeedChange>) => void;
  onDeleteSpeedChange: (id: number) => void;

  // BGA 간주 구간
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  onAddBgaInterval: () => void;
  onUpdateBgaInterval: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  onDeleteBgaInterval: (id: string) => void;

  // 테스트
  testStartInput: string;
  onTestStartInputChange: (value: string) => void;
  currentTime: number;
  onTest: () => void;

  // 공유
  onShareClick: () => void;

  // BPM 관련
  bpm: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
}

export const ChartEditorSidebarRight: React.FC<ChartEditorSidebarRightProps> = ({
  isLongNoteMode,
  onToggleLongNoteMode,
  isMoveMode,
  onToggleMoveMode,
  onMirrorNotes,
  speedChanges,
  onAddSpeedChange,
  onUpdateSpeedChange,
  onDeleteSpeedChange,
  bgaVisibilityIntervals,
  onAddBgaInterval,
  onUpdateBgaInterval,
  onDeleteBgaInterval,
  testStartInput,
  onTestStartInputChange,
  currentTime,
  onTest,
  onShareClick,
  bpm,
  bpmChanges,
  beatsPerMeasure,
}: ChartEditorSidebarRightProps) => {
  const sortedBpmChanges = [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);

  return (
    <div
      style={{
        width: '240px',
        backgroundColor: CHART_EDITOR_THEME.sidebarBackground,
        padding: '10px 8px',
        borderLeft: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        color: CHART_EDITOR_THEME.textPrimary,
        overflowY: 'auto',
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
        편집
      </h3>

      {/* 롱노트 모드 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <button
          onClick={(e) => {
            onToggleLongNoteMode();
            e.currentTarget.blur();
          }}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            border: `1px solid ${
              isLongNoteMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
            }`,
            background: isLongNoteMode
              ? 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.05))'
              : 'transparent',
            color: isLongNoteMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          롱노트 모드
        </button>
      </div>

      {/* 선택 영역 이동 모드 */}
      <div
        style={{
          marginBottom: '10px',
          padding: '6px 8px',
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
          onMouseDown={(e) => e.preventDefault()}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            border: `1px solid ${
              isMoveMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
            }`,
            background: isMoveMode
              ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))'
              : 'transparent',
            color: isMoveMode ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.textPrimary,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '6px',
          }}
        >
          선택 영역 이동 모드
        </button>
        <button
          onClick={(e) => {
            onMirrorNotes();
            e.currentTarget.blur();
          }}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            background: 'transparent',
            color: CHART_EDITOR_THEME.textPrimary,
            fontSize: '12px',
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
          선대칭 반전
        </button>
      </div>

      {/* 변속 구간 */}
      <SpeedChangesSection
        speedChanges={speedChanges}
        onAdd={onAddSpeedChange}
        onUpdate={onUpdateSpeedChange}
        onDelete={onDeleteSpeedChange}
        bpm={bpm}
        bpmChanges={sortedBpmChanges}
        beatsPerMeasure={beatsPerMeasure}
        currentTime={currentTime}
      />

      {/* 간주 구간 */}
      <BgaIntervalsSection
        bgaVisibilityIntervals={bgaVisibilityIntervals}
        onAdd={onAddBgaInterval}
        onUpdate={onUpdateBgaInterval}
        onDelete={onDeleteBgaInterval}
        bpm={bpm}
        bpmChanges={sortedBpmChanges}
        beatsPerMeasure={beatsPerMeasure}
      />

      {/* 테스트 시작 위치 */}
      <div
        style={{
          marginBottom: '12px',
          padding: '8px',
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
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
            padding: '4px 6px',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            marginBottom: '6px',
            fontSize: '12px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => onTestStartInputChange(Math.floor(currentTime).toString())}
            style={{
              flex: 1,
              padding: '4px',
              backgroundColor: 'rgba(34,211,238,0.14)',
              color: CHART_EDITOR_THEME.accentStrong,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            현재 위치
          </button>
          <button
            onClick={() => onTestStartInputChange('0')}
            style={{
              flex: 1,
              padding: '4px',
              backgroundColor: 'rgba(148,163,184,0.14)',
              color: CHART_EDITOR_THEME.textPrimary,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            0
          </button>
        </div>
        <button
          onClick={onTest}
          style={{
            width: '100%',
            marginTop: '6px',
            padding: '6px',
            background: 'linear-gradient(135deg, #22c55e, #4ade80)',
            color: '#022c22',
            border: 'none',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '12px',
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
          padding: '6px',
          background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
          color: '#0b1120',
          border: 'none',
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '12px',
        }}
      >
        공유
      </button>
    </div>
  );
};

// 변속 구간 섹션
interface SpeedChangesSectionProps {
  speedChanges: SpeedChange[];
  onAdd: () => void;
  onUpdate: (id: number, patch: Partial<SpeedChange>) => void;
  onDelete: (id: number) => void;
  bpm: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
  currentTime: number;
}

const SpeedChangesSection: React.FC<SpeedChangesSectionProps> = ({
  speedChanges,
  onAdd,
  onUpdate,
  onDelete,
  bpm,
  bpmChanges,
  beatsPerMeasure,
  currentTime,
}) => (
  <div
    style={{
      marginBottom: '12px',
      padding: '8px',
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
        marginBottom: '6px',
      }}
    >
      <span style={{ fontSize: '12px', fontWeight: 600 }}>변속 구간</span>
      <button
        onClick={onAdd}
        style={{
          padding: '3px 6px',
          fontSize: '10px',
          borderRadius: CHART_EDITOR_THEME.radiusSm,
          border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
          backgroundColor: 'rgba(34,211,238,0.12)',
          color: CHART_EDITOR_THEME.accentStrong,
          cursor: 'pointer',
        }}
      >
        + 추가
      </button>
    </div>
    <div
      style={{
        fontSize: '10px',
        color: CHART_EDITOR_THEME.textSecondary,
        marginBottom: '4px',
      }}
    >
      기준 BPM은 상단 BPM 입력값이며, 변속 구간 BPM은 절대값입니다.
    </div>
    {speedChanges.length === 0 ? (
      <div style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textMuted }}>
        아직 변속 구간이 없습니다.
      </div>
    ) : (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          maxHeight: 140,
          overflowY: 'auto',
        }}
      >
        {speedChanges.map((sc) => {
          const startMeasure = timeToMeasure(sc.startTimeMs, bpm, bpmChanges, beatsPerMeasure);
          const endMeasure =
            sc.endTimeMs == null
              ? null
              : timeToMeasure(sc.endTimeMs, bpm, bpmChanges, beatsPerMeasure);
          const isCurrent =
            currentTime >= sc.startTimeMs &&
            (sc.endTimeMs == null || currentTime < sc.endTimeMs);

          return (
            <div
              key={sc.id}
              style={{
                padding: '6px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${
                  isCurrent ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle
                }`,
                backgroundColor: isCurrent ? 'rgba(34,211,238,0.12)' : 'transparent',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
              }}
            >
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>
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
                    onUpdate(sc.id, { startTimeMs: timeMs });
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
                <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>
                  마디
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>
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
                      onUpdate(sc.id, { endTimeMs: null });
                      return;
                    }
                    const measure = Math.max(1, parseInt(raw));
                    const beatIdx = (measure - 1) * beatsPerMeasure;
                    const timeMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                    onUpdate(sc.id, { endTimeMs: timeMs });
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
                <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>
                  마디
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>
                  BPM
                </span>
                <input
                  type="number"
                  min={1}
                  value={sc.bpm}
                  onChange={(e) =>
                    onUpdate(sc.id, {
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
                  onClick={() => onDelete(sc.id)}
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
);

// 간주 구간 섹션
interface BgaIntervalsSectionProps {
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  onDelete: (id: string) => void;
  bpm: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
}

const BgaIntervalsSection: React.FC<BgaIntervalsSectionProps> = ({
  bgaVisibilityIntervals,
  onAdd,
  onUpdate,
  onDelete,
  bpm,
  bpmChanges,
  beatsPerMeasure,
}) => (
  <div
    style={{
      marginBottom: '12px',
      padding: '8px',
      backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
      borderRadius: CHART_EDITOR_THEME.radiusMd,
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
      <span style={{ fontSize: 12, fontWeight: 600 }}>간주 구간 (채보 레인 숨김)</span>
      <button
        onClick={onAdd}
        style={{
          padding: '2px 6px',
          fontSize: '10px',
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
      <div style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>구간 없음</div>
    ) : (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          maxHeight: 140,
          overflowY: 'auto',
        }}
      >
        {bgaVisibilityIntervals.map((it) => {
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
                border: `1px solid ${
                  it.mode === 'hidden' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'
                }`,
                backgroundColor: 'rgba(15,23,42,0.4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <input
                  type="text"
                  placeholder="마디"
                  value={startMeasureNum + 1}
                  onChange={(e) => {
                    const m = Math.max(0, (parseInt(e.target.value) || 1) - 1);
                    const beatIdx = m * beatsPerMeasure + (startBeat - 1);
                    const newMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                    onUpdate(it.id, { startTimeMs: newMs });
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
                    onUpdate(it.id, { startTimeMs: newMs });
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
                <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textMuted, margin: '0 2px' }}>
                  ~
                </span>
                <input
                  type="text"
                  placeholder="마디"
                  value={endMeasureNum + 1}
                  onChange={(e) => {
                    const m = Math.max(0, (parseInt(e.target.value) || 1) - 1);
                    const beatIdx = m * beatsPerMeasure + (endBeat - 1);
                    const newMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                    onUpdate(it.id, { endTimeMs: newMs });
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
                    onUpdate(it.id, { endTimeMs: newMs });
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
                  onClick={() => onDelete(it.id)}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() =>
                    onUpdate(it.id, { mode: it.mode === 'hidden' ? 'visible' : 'hidden' })
                  }
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${
                      it.mode === 'hidden' ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'
                    }`,
                    backgroundColor:
                      it.mode === 'hidden' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
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
                    onUpdate(it.id, { fadeInMs: Math.max(0, Number(e.target.value) || 0) })
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
                    onUpdate(it.id, { fadeOutMs: Math.max(0, Number(e.target.value) || 0) })
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
                  onClick={() => onUpdate(it.id, { fadeInMs: 0, fadeOutMs: 0 })}
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
);
