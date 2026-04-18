import React, { useMemo } from 'react';
import { SpeedChange, BgaVisibilityInterval, BPMChange, BgaVisibilityMode } from '../../types/game';
import { CHART_EDITOR_THEME } from './constants';
import { timeToMeasure, beatIndexToTime, timeToBeatIndex } from '../../utils/bpmUtils';

export interface ChartEditorSidebarRightProps {
  speedChanges: SpeedChange[];
  onAddSpeedChange: () => void;
  onUpdateSpeedChange: (id: number, patch: Partial<SpeedChange>) => void;
  onDeleteSpeedChange: (id: number) => void;
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  onAddBgaEvent: (mode: BgaVisibilityMode) => void;
  onUpdateBgaInterval: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  onDeleteBgaInterval: (id: string) => void;
  testStartInput: string;
  onTestStartInputChange: (value: string) => void;
  currentTime: number;
  onTest: () => void;
  onShareClick: () => void;
  bpm: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
}

const isTransientActionButton = (button: HTMLButtonElement) =>
  button.dataset.editorTransientAction === 'true';

const keepTransientButtonFromTakingFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
  if (isTransientActionButton(event.currentTarget)) {
    event.preventDefault();
  }
};

const blurTransientButton = (event: React.MouseEvent<HTMLButtonElement>) => {
  if (isTransientActionButton(event.currentTarget) && event.detail > 0) {
    event.currentTarget.blur();
  }
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
  onAddBgaEvent,
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
        onAddBgaEvent={onAddBgaEvent}
        onUpdateBgaInterval={onUpdateBgaInterval}
        onDeleteBgaInterval={onDeleteBgaInterval}
        bpm={bpm}
        bpmChanges={sortedBpmChanges}
        beatsPerMeasure={beatsPerMeasure}
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
              onTestStartInputChange(Math.floor(currentTime).toString());
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
    </div>
  );
};

interface BgaEventsSectionProps {
  bgaVisibilityIntervals: BgaVisibilityInterval[];
  onAddBgaEvent: (mode: BgaVisibilityMode) => void;
  onUpdateBgaInterval: (id: string, patch: Partial<BgaVisibilityInterval>) => void;
  onDeleteBgaInterval: (id: string) => void;
  bpm: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
}

const BgaEventsSection: React.FC<BgaEventsSectionProps> = ({
  bgaVisibilityIntervals,
  onAddBgaEvent,
  onUpdateBgaInterval,
  onDeleteBgaInterval,
  bpm,
  bpmChanges,
  beatsPerMeasure,
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
      description="Hide는 레인을 숨기고, Show는 다시 보이게 합니다. 페이드는 해당 방향만 적용합니다."
    >
      <Badge>{bgaVisibilityIntervals.length}개</Badge>
    </SectionHeader>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>이벤트 추가</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          data-editor-transient-action="true"
          onMouseDown={keepTransientButtonFromTakingFocus}
          onClick={(e) => {
            onAddBgaEvent('hidden');
            blurTransientButton(e);
          }}
          style={{
            padding: '2px 6px',
            fontSize: '10px',
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            border: '1px solid rgba(239,68,68,0.55)',
            backgroundColor: 'rgba(239,68,68,0.12)',
            color: '#fca5a5',
            cursor: 'pointer',
          }}
        >
          + Hide
        </button>
        <button
          data-editor-transient-action="true"
          onMouseDown={keepTransientButtonFromTakingFocus}
          onClick={(e) => {
            onAddBgaEvent('visible');
            blurTransientButton(e);
          }}
          style={{
            padding: '2px 6px',
            fontSize: '10px',
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            border: '1px solid rgba(34,197,94,0.55)',
            backgroundColor: 'rgba(34,197,94,0.12)',
            color: '#86efac',
            cursor: 'pointer',
          }}
        >
          + Show
        </button>
      </div>
    </div>
    {bgaVisibilityIntervals.length === 0 ? (
      <div style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>구간 없음</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
        {bgaVisibilityIntervals.map((it) => {
          const startBeatIdx = timeToBeatIndex(it.startTimeMs, bpm, bpmChanges);
          const startMeasureNum = Math.floor(startBeatIdx / beatsPerMeasure);
          const startBeat = Math.floor(startBeatIdx % beatsPerMeasure) + 1;
          const isHideEvent = it.mode === 'hidden';
          const fadeLabel = isHideEvent ? 'Fade in' : 'Fade out';
          const fadeValue = isHideEvent ? Math.round(it.fadeInMs ?? 0) : Math.round(it.fadeOutMs ?? 0);

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  data-editor-transient-action="true"
                  onMouseDown={keepTransientButtonFromTakingFocus}
                  onClick={(e) => {
                    onUpdateBgaInterval(it.id, {
                      mode: isHideEvent ? 'visible' : 'hidden',
                      fadeInMs: isHideEvent ? 0 : 300,
                      fadeOutMs: isHideEvent ? 300 : 0,
                    });
                    blurTransientButton(e);
                  }}
                  style={{
                    fontSize: 10,
                    padding: '3px 6px',
                    minWidth: 42,
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${isHideEvent ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'}`,
                    backgroundColor: isHideEvent ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                    color: isHideEvent ? '#fca5a5' : '#86efac',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                  title="Hide/Show 전환"
                >
                  {isHideEvent ? 'Hide' : 'Show'}
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  data-select-on-focus="true"
                  placeholder="마디"
                  value={startMeasureNum + 1}
                  onChange={(e) => {
                    const m = Math.max(0, (parseInt(e.target.value, 10) || 1) - 1);
                    const beatIdx = m * beatsPerMeasure + (startBeat - 1);
                    const newMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                    onUpdateBgaInterval(it.id, { startTimeMs: newMs });
                  }}
                  style={{ ...inputBaseStyle, width: 32, padding: '3px 4px', fontSize: 11, textAlign: 'center' }}
                />
                <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textSecondary }}>.</span>
                <input
                  type="text"
                  inputMode="numeric"
                  data-select-on-focus="true"
                  placeholder="박"
                  value={startBeat}
                  onChange={(e) => {
                    const b = Math.max(1, Math.min(beatsPerMeasure, parseInt(e.target.value, 10) || 1));
                    const beatIdx = startMeasureNum * beatsPerMeasure + (b - 1);
                    const newMs = beatIndexToTime(beatIdx, bpm, bpmChanges);
                    onUpdateBgaInterval(it.id, { startTimeMs: newMs });
                  }}
                  style={{ ...inputBaseStyle, width: 28, padding: '3px 4px', fontSize: 11, textAlign: 'center' }}
                />
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
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>{fadeLabel}</span>
                <input
                  type="number"
                  min={0}
                  value={fadeValue}
                  onChange={(e) => {
                    const nextFade = Math.max(0, Number(e.target.value) || 0);
                    onUpdateBgaInterval(
                      it.id,
                      isHideEvent ? { fadeInMs: nextFade, fadeOutMs: 0 } : { fadeInMs: 0, fadeOutMs: nextFade }
                    );
                  }}
                  style={{ ...inputBaseStyle, width: 42, padding: '2px 4px', fontSize: 10, textAlign: 'center' }}
                />
                <span style={{ fontSize: 10, color: CHART_EDITOR_THEME.textMuted }}>ms</span>
                <button
                  data-editor-transient-action="true"
                  onMouseDown={keepTransientButtonFromTakingFocus}
                  onClick={(e) => {
                    onUpdateBgaInterval(it.id, { fadeInMs: 0, fadeOutMs: 0 });
                    blurTransientButton(e);
                  }}
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

export const ChartEditorSidebarRight = React.memo(ChartEditorSidebarRightInner);
