import React, { useMemo } from 'react';
import { SpeedChange, BgaVisibilityInterval, BPMChange } from '../../types/game';
import { CHART_EDITOR_THEME } from './constants';
import { timeToMeasure, beatIndexToTime } from '../../utils/bpmUtils';
import {
  blurEditorTransientAction,
  preventTransientEditorActionFocus,
} from '../../utils/editorFocus';

export interface ChartEditorSidebarRightProps {
  speedChanges: SpeedChange[];
  onAddSpeedChange: () => void;
  onUpdateSpeedChange: (id: number, patch: Partial<SpeedChange>) => void;
  onDeleteSpeedChange: (id: number) => void;
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  isBgaPlacementMode: boolean;
  onToggleBgaPlacementMode: () => void;
  onAddBgaIntervalAtCurrent: () => void;
  onUpdateBgaInterval: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  onDeleteBgaInterval: (id: string) => void;
  testStartInput: string;
  onTestStartInputChange: (value: string) => void;
  currentTime: number;
  onSetTestStartToCurrent: () => void;
  onTest: () => void;
  onShareClick: () => void;
  isAdmin: boolean;
  onLoadExistingClick: () => void;
  bpm: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
}

const keepTransientButtonFromTakingFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
  preventTransientEditorActionFocus(event);
};

const blurTransientButton = (event: React.MouseEvent<HTMLButtonElement>) => {
  blurEditorTransientAction(event);
};

const panelSectionStyle: React.CSSProperties = {
  marginBottom: '10px',
  padding: '6px 8px',
  borderRadius: CHART_EDITOR_THEME.radiusMd,
  backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
};

const inputBaseStyle: React.CSSProperties = {
  backgroundColor: '#020617',
  color: CHART_EDITOR_THEME.textPrimary,
  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
  borderRadius: CHART_EDITOR_THEME.radiusSm,
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 7px',
  borderRadius: 999,
  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
  backgroundColor: 'rgba(15,23,42,0.72)',
  color: CHART_EDITOR_THEME.accentStrong,
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1,
};

const SectionHeader: React.FC<{
  label: string;
  description?: string;
  children?: React.ReactNode;
}> = ({ label, description, children }) => (
  <div style={{ margin: '10px 2px 6px' }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        color: CHART_EDITOR_THEME.textSecondary,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      <span>{label}</span>
      {children && <span style={{ display: 'inline-flex', gap: 4 }}>{children}</span>}
    </div>
    {description && (
      <div
        style={{
          marginTop: 3,
          color: CHART_EDITOR_THEME.textMuted,
          fontSize: 10,
          lineHeight: 1.35,
          letterSpacing: 0,
          textTransform: 'none',
        }}
      >
        {description}
      </div>
    )}
  </div>
);

const Badge: React.FC<{ tone?: 'accent' | 'green' | 'red' | 'muted'; children: React.ReactNode }> = ({
  tone = 'accent',
  children,
}) => {
  const color =
    tone === 'green'
      ? '#86efac'
      : tone === 'red'
        ? '#fca5a5'
        : tone === 'muted'
          ? CHART_EDITOR_THEME.textMuted
          : CHART_EDITOR_THEME.accentStrong;
  return <span style={{ ...badgeStyle, color }}>{children}</span>;
};

const ChartEditorSidebarRightInner: React.FC<ChartEditorSidebarRightProps> = ({
  speedChanges,
  onAddSpeedChange,
  onUpdateSpeedChange,
  onDeleteSpeedChange,
  bgaVisibilityIntervals,
  isBgaPlacementMode,
  onToggleBgaPlacementMode,
  onAddBgaIntervalAtCurrent,
  onUpdateBgaInterval,
  onDeleteBgaInterval,
  testStartInput,
  onTestStartInputChange,
  currentTime,
  onSetTestStartToCurrent,
  onTest,
  onShareClick,
  isAdmin,
  onLoadExistingClick,
  bpm,
  bpmChanges,
  beatsPerMeasure,
}) => {
  const sortedBpmChanges = useMemo(
    () => [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex),
    [bpmChanges]
  );

  return (
    <div
      className="chart-editor-right-panel"
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
        borderLeft: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
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
        편집
      </h3>

      <div
        style={{
          ...panelSectionStyle,
          marginBottom: '12px',
          padding: '8px',
        }}
      >
        <SectionHeader
          label="Timing FX"
          description="기준 BPM은 상단 BPM 입력값이며, 변속 구간 BPM은 절대값입니다."
        >
          <Badge>{speedChanges.length}개</Badge>
        </SectionHeader>
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
            data-editor-transient-action="true"
            onMouseDown={keepTransientButtonFromTakingFocus}
            onClick={(e) => {
              onAddSpeedChange();
              blurTransientButton(e);
            }}
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
              const startMeasure = timeToMeasure(sc.startTimeMs, bpm, sortedBpmChanges, beatsPerMeasure);
              const endMeasure = sc.endTimeMs == null
                ? null
                : timeToMeasure(sc.endTimeMs, bpm, sortedBpmChanges, beatsPerMeasure);
              const isCurrent = currentTime >= sc.startTimeMs && (sc.endTimeMs == null || currentTime < sc.endTimeMs);

              return (
                <div
                  key={sc.id}
                  style={{
                    padding: '6px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${isCurrent ? CHART_EDITOR_THEME.accentStrong : CHART_EDITOR_THEME.borderSubtle}`,
                    backgroundColor: isCurrent ? 'rgba(34,211,238,0.12)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>시작</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={startMeasure}
                      onChange={(e) => {
                        const measure = Math.max(1, parseInt(e.target.value || '1', 10));
                        const beatIdx = (measure - 1) * beatsPerMeasure;
                        const timeMs = beatIndexToTime(beatIdx, bpm, sortedBpmChanges);
                        onUpdateSpeedChange(sc.id, { startTimeMs: timeMs });
                      }}
                      style={{ ...inputBaseStyle, flex: 1, padding: '2px 4px', fontSize: '11px' }}
                    />
                    <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>마디</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>끝</span>
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
                        const measure = Math.max(1, parseInt(raw, 10));
                        const beatIdx = (measure - 1) * beatsPerMeasure;
                        const timeMs = beatIndexToTime(beatIdx, bpm, sortedBpmChanges);
                        onUpdateSpeedChange(sc.id, { endTimeMs: timeMs });
                      }}
                      placeholder="끝까지"
                      style={{ ...inputBaseStyle, flex: 1, padding: '2px 4px', fontSize: '11px' }}
                    />
                    <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>마디</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: CHART_EDITOR_THEME.textSecondary }}>BPM</span>
                    <input
                      type="number"
                      min={1}
                      value={sc.bpm}
                      onChange={(e) => onUpdateSpeedChange(sc.id, { bpm: Math.max(1, parseFloat(e.target.value || '1')) })}
                      style={{ ...inputBaseStyle, flex: 1, padding: '2px 4px', fontSize: '11px' }}
                    />
                    <button
                      data-editor-transient-action="true"
                      onMouseDown={keepTransientButtonFromTakingFocus}
                      onClick={(e) => {
                        onDeleteSpeedChange(sc.id);
                        blurTransientButton(e);
                      }}
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

      <BgaEventsSection
        bgaVisibilityIntervals={bgaVisibilityIntervals}
        isBgaPlacementMode={isBgaPlacementMode}
        onToggleBgaPlacementMode={onToggleBgaPlacementMode}
        onAddBgaIntervalAtCurrent={onAddBgaIntervalAtCurrent}
        onUpdateBgaInterval={onUpdateBgaInterval}
        onDeleteBgaInterval={onDeleteBgaInterval}
      />

      <div
        style={{
          ...panelSectionStyle,
          marginBottom: '12px',
          padding: '8px',
        }}
      >
        <SectionHeader
          label="Test"
          description="현재 채보를 1.0x로 실행합니다. 시작 위치만 여기서 바꿉니다."
        >
          <Badge>{testStartInput || '0'}ms</Badge>
        </SectionHeader>
        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
          테스트 시작 위치
        </label>
        <input
          type="text"
          inputMode="numeric"
          data-select-on-focus="true"
            value={testStartInput}
            onChange={(e) => onTestStartInputChange(e.target.value)}
            placeholder="ms"
          style={{
            ...inputBaseStyle,
            width: '100%',
            padding: '4px 6px',
            marginBottom: '6px',
            fontSize: '12px',
          }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
            <button
              data-editor-transient-action="true"
              onMouseDown={keepTransientButtonFromTakingFocus}
              onClick={(e) => {
                onSetTestStartToCurrent();
                blurTransientButton(e);
              }}
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
            data-editor-transient-action="true"
              onMouseDown={keepTransientButtonFromTakingFocus}
              onClick={(e) => {
                onTestStartInputChange('0');
                blurTransientButton(e);
              }}
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
          data-editor-transient-action="true"
          onMouseDown={keepTransientButtonFromTakingFocus}
          onClick={(e) => {
            onTest();
            blurTransientButton(e);
          }}
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

      <SectionHeader label="Share" />
      <button
        data-editor-transient-action="true"
        onMouseDown={keepTransientButtonFromTakingFocus}
        onClick={(e) => {
          onShareClick();
          blurTransientButton(e);
        }}
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
      {isAdmin && (
        <button
          data-editor-transient-action="true"
          onMouseDown={keepTransientButtonFromTakingFocus}
          onClick={(e) => {
            onLoadExistingClick();
            blurTransientButton(e);
          }}
          style={{
            width: '100%',
            marginTop: '8px',
            padding: '6px',
            background: 'linear-gradient(135deg, rgba(248,113,113,0.92), rgba(251,191,36,0.92))',
            color: '#1f1200',
            border: 'none',
            borderRadius: CHART_EDITOR_THEME.radiusLg,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '12px',
          }}
        >
          기존 채보 편집
        </button>
      )}
    </div>
  );
};

interface BgaEventsSectionProps {
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  isBgaPlacementMode: boolean;
  onToggleBgaPlacementMode: () => void;
  onAddBgaIntervalAtCurrent: () => void;
  onUpdateBgaInterval: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  onDeleteBgaInterval: (id: string) => void;
}

const BgaEventsSection: React.FC<BgaEventsSectionProps> = ({
  bgaVisibilityIntervals,
  isBgaPlacementMode,
  onToggleBgaPlacementMode,
  onAddBgaIntervalAtCurrent,
  onUpdateBgaInterval,
  onDeleteBgaInterval,
}) => (
  <div
    style={{
      ...panelSectionStyle,
      marginBottom: '12px',
      padding: '8px',
    }}
  >
    <SectionHeader
      label="BGA Lane Visibility"
      description="배치 모드로 타임라인 레인을 직접 클릭해 구간을 만들고, 블록 양 끝을 드래그해 길이를 조절합니다."
    >
      <Badge>{bgaVisibilityIntervals.length}개</Badge>
    </SectionHeader>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <button
        data-editor-transient-action="true"
        onMouseDown={keepTransientButtonFromTakingFocus}
        onClick={(e) => {
          onToggleBgaPlacementMode();
          blurTransientButton(e);
        }}
        style={{
          flex: 1,
          padding: '6px 8px',
          fontSize: '11px',
          fontWeight: 700,
          borderRadius: CHART_EDITOR_THEME.radiusSm,
          border: `1px solid ${isBgaPlacementMode ? 'rgba(248,113,113,0.58)' : CHART_EDITOR_THEME.borderSubtle}`,
          backgroundColor: isBgaPlacementMode ? 'rgba(239,68,68,0.14)' : 'rgba(15,23,42,0.58)',
          color: isBgaPlacementMode ? '#fca5a5' : CHART_EDITOR_THEME.textPrimary,
          cursor: 'pointer',
        }}
      >
        {isBgaPlacementMode ? '배치 모드 ON' : '배치 모드 OFF'}
      </button>
      <button
        data-editor-transient-action="true"
        onMouseDown={keepTransientButtonFromTakingFocus}
        onClick={(e) => {
          onAddBgaIntervalAtCurrent();
          blurTransientButton(e);
        }}
        style={{
          padding: '6px 8px',
          fontSize: '11px',
          fontWeight: 700,
          borderRadius: CHART_EDITOR_THEME.radiusSm,
          border: '1px solid rgba(239,68,68,0.55)',
          backgroundColor: 'rgba(239,68,68,0.12)',
          color: '#fca5a5',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        현재 위치 추가
      </button>
    </div>
    <div style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
      블록 내부 숫자칸에서 등장/퇴장 시간을 ms 단위로 바로 수정할 수 있습니다. `0`이면 즉시 전환입니다.
    </div>
    {bgaVisibilityIntervals.length === 0 ? (
      <div style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>구간 없음</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 156, overflowY: 'auto' }}>
        {[...bgaVisibilityIntervals]
          .sort((a, b) => a.startTimeMs - b.startTimeMs)
          .map((it, index) => {
            const durationMs = Math.max(0, it.endTimeMs - it.startTimeMs);
            return (
              <div
                key={it.id}
                style={{
                  padding: '6px',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: '1px solid rgba(239,68,68,0.4)',
                  backgroundColor: 'rgba(15,23,42,0.4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fca5a5' }}>Fade {index + 1}</span>
                  <span style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>
                    {Math.round(it.startTimeMs)}ms - {Math.round(it.endTimeMs)}ms
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    data-editor-transient-action="true"
                    onMouseDown={keepTransientButtonFromTakingFocus}
                    onClick={(e) => {
                      onDeleteBgaInterval(it.id);
                      blurTransientButton(e);
                    }}
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
                    삭제
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>
                    길이
                    <input
                      type="number"
                      min={0}
                      value={Math.round(durationMs)}
                      onChange={(e) => {
                        const nextDuration = Math.max(0, Number(e.target.value) || 0);
                        onUpdateBgaInterval(it.id, { endTimeMs: it.startTimeMs + nextDuration });
                      }}
                      style={{ ...inputBaseStyle, width: '100%', padding: '3px 4px', fontSize: 11 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>
                    등장
                    <input
                      type="number"
                      min={0}
                      value={Math.round(it.fadeInMs ?? 0)}
                      onChange={(e) => onUpdateBgaInterval(it.id, { fadeInMs: Math.max(0, Number(e.target.value) || 0) })}
                      style={{ ...inputBaseStyle, width: '100%', padding: '3px 4px', fontSize: 11 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>
                    퇴장
                    <input
                      type="number"
                      min={0}
                      value={Math.round(it.fadeOutMs ?? 0)}
                      onChange={(e) => onUpdateBgaInterval(it.id, { fadeOutMs: Math.max(0, Number(e.target.value) || 0) })}
                      style={{ ...inputBaseStyle, width: '100%', padding: '3px 4px', fontSize: 11 }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
      </div>
    )}
  </div>
);

export const ChartEditorSidebarRight = React.memo(ChartEditorSidebarRightInner);
