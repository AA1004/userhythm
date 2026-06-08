import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import {
  GAME_VISUAL_PRESETS,
  GameVisualSettings,
  KEY_LANE_HEIGHT,
  LANE_COUNT,
  NoteColorRgb,
  VISUAL_SETTING_LIMITS,
  VisualPresetId,
} from '../constants/gameVisualSettings';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import { getKeyBindingFromInput } from '../utils/keyBinding';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onDisplayNameSave: () => Promise<void>;
  canChangeDisplayName: boolean;
  nextDisplayNameChangeAt: Date | null;
  keyBindings: string[];
  onKeyBindingChange: (index: number, key: string) => void;
  onResetKeyBindings: () => void;
  noteSpeed: number;
  onNoteSpeedChange: (speed: number) => void;
  timingOffsetMs: number;
  onTimingOffsetChange: (offsetMs: number) => void;
  gameVolume: number;
  onGameVolumeChange: (volume: number) => void;
  isBgaEnabled: boolean;
  onBgaChange: (enabled: boolean) => void;
  judgeLineY: number;
  onJudgeLineYChange: (y: number) => void;
  visualSettings: GameVisualSettings;
  hasPendingVisualSettings: boolean;
  isGameplayActive: boolean;
  onVisualSettingsChange: (settings: Partial<GameVisualSettings>) => void;
  onVisualSettingsCommit: (applyToGameplay?: boolean, settingsOverride?: Partial<GameVisualSettings>) => void;
  onApplyVisualPreset: (presetId: Exclude<VisualPresetId, 'custom'>, applyToGameplay?: boolean) => void;
  onResetVisualSettings: (applyToGameplay?: boolean) => void;
  onOpenCalibration: () => void;
  currentRoleLabel: string;
  isLoggedIn: boolean;
}

interface VisualSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
  onCommit: () => void;
}

interface NoteColorEditorProps {
  label: string;
  value: NoteColorRgb;
  onChange: (value: NoteColorRgb) => void;
  onCommit: () => void;
}

type SettingsTab = 'gameplay' | 'visual' | 'account';

const sectionCardStyle: React.CSSProperties = {
  marginBottom: '18px',
  padding: '14px',
  borderRadius: CHART_EDITOR_THEME.radiusMd,
  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
  background: CHART_EDITOR_THEME.surface,
};

const VisualSliderRow = memo<VisualSliderRowProps>(({
  label,
  value,
  min,
  max,
  step,
  suffix = 'px',
  onChange,
  onCommit,
}) => {
  const handleValueChange = (next: number) => {
    if (Number.isFinite(next)) {
      onChange(next);
    }
  };

  return (
    <div className="settings-slider-row" style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: CHART_EDITOR_THEME.textSecondary,
          fontSize: '12px',
          marginBottom: '4px',
        }}
      >
        <span>{label}</span>
        <strong style={{ color: CHART_EDITOR_THEME.textPrimary }}>
          {value}
          {suffix}
        </strong>
      </div>
      <input
        className="settings-slider-row__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => handleValueChange((e.currentTarget as HTMLInputElement).valueAsNumber)}
        onChange={(e) => handleValueChange((e.currentTarget as HTMLInputElement).valueAsNumber)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        style={{ width: '100%', accentColor: CHART_EDITOR_THEME.accent }}
      />
    </div>
  );
});

const NoteColorEditor = memo<NoteColorEditorProps>(({ label, value, onChange, onCommit }) => {
  const updateChannel = (channel: keyof NoteColorRgb, nextValue: number) => {
    onChange({
      ...value,
      [channel]: Math.max(0, Math.min(255, Math.round(nextValue))),
    });
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: CHART_EDITOR_THEME.textSecondary,
          fontSize: '12px',
          marginBottom: '6px',
        }}
      >
        <span>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: CHART_EDITOR_THEME.textPrimary }}>
            RGB({value.r}, {value.g}, {value.b})
          </span>
          <span
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '6px',
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              background: `rgb(${value.r}, ${value.g}, ${value.b})`,
            }}
          />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {(['r', 'g', 'b'] as const).map((channel) => (
          <div key={channel}>
            <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginBottom: '4px' }}>
              {channel.toUpperCase()}
            </div>
            <input
              className="settings-slider-row__input"
              type="range"
              min="0"
              max="255"
              step="1"
              value={value[channel]}
              onInput={(e) => updateChannel(channel, (e.currentTarget as HTMLInputElement).valueAsNumber)}
              onChange={(e) => updateChannel(channel, (e.currentTarget as HTMLInputElement).valueAsNumber)}
              onPointerUp={onCommit}
              onKeyUp={onCommit}
              onBlur={onCommit}
              style={{ width: '100%', accentColor: CHART_EDITOR_THEME.accent }}
            />
            <input
              type="number"
              min="0"
              max="255"
              step="1"
              value={value[channel]}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (!Number.isNaN(next)) {
                  updateChannel(channel, next);
                }
              }}
              onBlur={onCommit}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '6px 8px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                background: CHART_EDITOR_THEME.surface,
                color: CHART_EDITOR_THEME.textPrimary,
                fontSize: '12px',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  displayName,
  onDisplayNameChange,
  onDisplayNameSave,
  canChangeDisplayName,
  nextDisplayNameChangeAt,
  keyBindings,
  onKeyBindingChange,
  onResetKeyBindings,
  noteSpeed,
  onNoteSpeedChange,
  timingOffsetMs,
  onTimingOffsetChange,
  gameVolume,
  onGameVolumeChange,
  isBgaEnabled,
  onBgaChange,
  judgeLineY,
  onJudgeLineYChange,
  visualSettings,
  hasPendingVisualSettings,
  isGameplayActive,
  onVisualSettingsChange,
  onVisualSettingsCommit,
  onApplyVisualPreset,
  onResetVisualSettings,
  onOpenCalibration,
  currentRoleLabel,
  isLoggedIn,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('gameplay');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [recordingKeyIndex, setRecordingKeyIndex] = useState<number | null>(null);
  const [isVisualDetailsExpanded, setIsVisualDetailsExpanded] = useState(false);
  const visualRafRef = useRef<number | null>(null);
  const queuedVisualSettingsRef = useRef<Partial<GameVisualSettings>>({});

  const handleSaveNickname = async () => {
    if (!canChangeDisplayName || isSavingNickname) return;
    setIsSavingNickname(true);
    try {
      await onDisplayNameSave();
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (recordingKeyIndex !== index) return;
    e.preventDefault();
    const key = getKeyBindingFromInput({ code: e.code, key: e.key });
    if (key) {
      onKeyBindingChange(index, key);
      setRecordingKeyIndex(null);
    }
  };

  const commitVisualSettings = useCallback(() => {
    const queued = queuedVisualSettingsRef.current;
    queuedVisualSettingsRef.current = {};
    if (visualRafRef.current !== null) {
      cancelAnimationFrame(visualRafRef.current);
      visualRafRef.current = null;
    }
    if (Object.keys(queued).length > 0) {
      onVisualSettingsChange(queued);
    }
    onVisualSettingsCommit(!isGameplayActive, queued);
  }, [isGameplayActive, onVisualSettingsChange, onVisualSettingsCommit]);

  const scheduleVisualSettingsChange = useCallback(
    (settings: Partial<GameVisualSettings>) => {
      queuedVisualSettingsRef.current = {
        ...queuedVisualSettingsRef.current,
        ...settings,
        presetId: 'custom',
      };

      if (visualRafRef.current !== null) return;

      visualRafRef.current = requestAnimationFrame(() => {
        visualRafRef.current = null;
        const queued = queuedVisualSettingsRef.current;
        queuedVisualSettingsRef.current = {};
        onVisualSettingsChange(queued);
      });
    },
    [onVisualSettingsChange]
  );

  const handlePresetClick = (presetId: Exclude<VisualPresetId, 'custom'>) => {
    onApplyVisualPreset(presetId, !isGameplayActive);
  };

  const handleResetVisualSettings = () => {
    onResetVisualSettings(!isGameplayActive);
  };

  const applyToggleVisualSettings = useCallback(
    (settings: Partial<GameVisualSettings>) => {
      const payload: Partial<GameVisualSettings> = {
        ...settings,
        presetId: 'custom',
      };
      onVisualSettingsChange(payload);
      onVisualSettingsCommit(!isGameplayActive, payload);
    },
    [isGameplayActive, onVisualSettingsChange, onVisualSettingsCommit]
  );

  useEffect(() => {
    if (isOpen) {
      setActiveTab('gameplay');
      setRecordingKeyIndex(null);
      setIsVisualDetailsExpanded(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (visualRafRef.current !== null) {
        cancelAnimationFrame(visualRafRef.current);
      }
    };
  }, []);

  const formatNextChangeDate = (date: Date | null) => {
    if (!date) return '';
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    if (diff <= 0) return '지금 변경 가능';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}일 ${hours}시간 후 변경 가능`;
    return `${hours}시간 후 변경 가능`;
  };

  const laneGroupWidth =
    LANE_COUNT * visualSettings.laneWidth +
    (LANE_COUNT - 1) * visualSettings.laneGap;
  const laneOffsetLimit = Math.floor(
    Math.max(0, (GAME_VIEW_WIDTH - laneGroupWidth) / 2)
  );
  const keyLaneMax = GAME_VIEW_HEIGHT - KEY_LANE_HEIGHT;
  const keyLaneMin = Math.min(
    keyLaneMax,
    judgeLineY + VISUAL_SETTING_LIMITS.keyLaneY.minGapFromJudgeLine
  );

  if (!isOpen) return null;

  return (
    <div
      className="settings-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: CHART_EDITOR_THEME.overlayScrim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="settings-modal-panel"
        style={{
          background: CHART_EDITOR_THEME.surfaceElevated,
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          padding: '24px',
          width: '560px',
          maxHeight: '84vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', marginRight: '-4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2
            className="settings-modal-title"
            style={{
              color: CHART_EDITOR_THEME.textPrimary,
              margin: 0,
              fontSize: '18px',
              letterSpacing: '0.03em',
            }}
          >
            설정
          </h2>
          {hasPendingVisualSettings && (
            <span
              style={{
                fontSize: '11px',
                color: CHART_EDITOR_THEME.success,
                border: `1px solid ${CHART_EDITOR_THEME.success}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                padding: '4px 10px',
              }}
            >
              다음 판 적용 대기
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {([
            { id: 'gameplay', label: '게임' },
            { id: 'visual', label: '비주얼' },
            { id: 'account', label: '계정' },
          ] as Array<{ id: SettingsTab; label: string }>).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 8px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${
                  activeTab === tab.id ? CHART_EDITOR_THEME.accent : CHART_EDITOR_THEME.borderSubtle
                }`,
                background: activeTab === tab.id ? CHART_EDITOR_THEME.accentSoft : 'transparent',
                color: CHART_EDITOR_THEME.textPrimary,
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 700 : 500,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'gameplay' && (
          <>
            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', margin: 0 }}>
                  키 설정
                </h3>
                <button
                  onClick={onResetKeyBindings}
                  style={{
                    padding: '4px 8px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: 'transparent',
                    color: CHART_EDITOR_THEME.textSecondary,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  기본값으로
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {keyBindings.map((key, index) => (
                  <div key={index} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginBottom: '4px' }}>
                      레인 {index + 1}
                    </div>
                    <button
                      onClick={() => setRecordingKeyIndex(recordingKeyIndex === index ? null : index)}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      style={{
                        width: '100%',
                        padding: '12px 8px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: `2px solid ${
                          recordingKeyIndex === index ? CHART_EDITOR_THEME.accent : CHART_EDITOR_THEME.borderSubtle
                        }`,
                        background: recordingKeyIndex === index ? CHART_EDITOR_THEME.accentSoft : CHART_EDITOR_THEME.surface,
                        color: CHART_EDITOR_THEME.textPrimary,
                        fontSize: '16px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {recordingKeyIndex === index ? '...' : key}
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '6px', marginBottom: 0 }}>
                버튼 클릭 후 원하는 키를 누르세요.
                넘패드는 Enter/NumLock을 제외하고 설정할 수 있습니다.
              </p>
            </div>

            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>
                노트 속도: {noteSpeed.toFixed(1)}x
              </h3>
              <div style={{ position: 'relative', padding: '0 8px' }}>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.1"
                  value={noteSpeed}
                  onChange={(e) => onNoteSpeedChange(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: CHART_EDITOR_THEME.accent }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: CHART_EDITOR_THEME.textSecondary,
                    fontSize: '11px',
                    marginTop: '4px',
                  }}
                >
                  <span>0.5x</span>
                  <span>5.0x</span>
                  <span>10.0x</span>
                </div>
              </div>
            </div>

            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>
                판정 보정: {timingOffsetMs}ms
              </h3>
              <div style={{ position: 'relative', padding: '0 8px' }}>
                <input
                  type="range"
                  min="-200"
                  max="200"
                  step="1"
                  value={timingOffsetMs}
                  onChange={(e) => onTimingOffsetChange(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: CHART_EDITOR_THEME.accent }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: CHART_EDITOR_THEME.textSecondary,
                    fontSize: '11px',
                    marginTop: '4px',
                  }}
                >
                  <span>-200ms</span>
                  <span>0ms</span>
                  <span>+200ms</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                <button
                  onClick={() => onTimingOffsetChange(Math.max(-200, timingOffsetMs - 5))}
                  style={{
                    padding: '8px 12px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: 'transparent',
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  -5ms
                </button>
                <button
                  onClick={() => onTimingOffsetChange(0)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: 'transparent',
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  0ms
                </button>
                <button
                  onClick={() => onTimingOffsetChange(Math.min(200, timingOffsetMs + 5))}
                  style={{
                    padding: '8px 12px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: 'transparent',
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  +5ms
                </button>
                <input
                  type="number"
                  min="-200"
                  max="200"
                  step="1"
                  value={timingOffsetMs}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (!Number.isNaN(next)) {
                      onTimingOffsetChange(Math.max(-200, Math.min(200, next)));
                    }
                  }}
                  style={{
                    marginLeft: 'auto',
                    width: '96px',
                    padding: '8px 10px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: CHART_EDITOR_THEME.surface,
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '13px',
                  }}
                />
              </div>
              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '6px', marginBottom: 0 }}>
                플러스는 판정을 늦추고, 마이너스는 판정을 앞당깁니다.
              </p>
            </div>

            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>
                게임 볼륨
              </h3>
              <VisualSliderRow
                label="마스터 볼륨"
                value={gameVolume}
                min={0}
                max={100}
                step={5}
                suffix="%"
                onChange={onGameVolumeChange}
                onCommit={() => {}}
              />
              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '6px', marginBottom: 0 }}>
                플레이 오디오와 미리듣기 볼륨에 공통으로 적용됩니다.
              </p>
            </div>

            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>
                배경 영상 (BGA)
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isBgaEnabled}
                  onChange={(e) => onBgaChange(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: CHART_EDITOR_THEME.accent }}
                />
                <span style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px' }}>
                  배경 영상 표시
                </span>
              </label>
              <div style={{ marginTop: '12px' }}>
                <VisualSliderRow
                  label="BGA 투명도"
                  value={Math.round(visualSettings.bgaOpacity * 100)}
                  min={VISUAL_SETTING_LIMITS.bgaOpacity.min * 100}
                  max={VISUAL_SETTING_LIMITS.bgaOpacity.max * 100}
                  step={5}
                  suffix="%"
                  onChange={(value) => scheduleVisualSettingsChange({ bgaOpacity: value / 100 })}
                  onCommit={commitVisualSettings}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '-4px',
                    color: CHART_EDITOR_THEME.textSecondary,
                    fontSize: '10px',
                  }}
                >
                  <span>0% 선명</span>
                  <span>45% 반투명</span>
                  <span>90% 거의 숨김</span>
                </div>
              </div>
            </div>

            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>
                자동 보정
              </h3>
              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginTop: 0, marginBottom: '12px', lineHeight: 1.6 }}>
                전용 보정 곡을 실제 게임 플레이 UI로 실행합니다.
              </p>
              <button
                onClick={onOpenCalibration}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: 'none',
                  background: CHART_EDITOR_THEME.ctaButtonGradient,
                  color: CHART_EDITOR_THEME.textPrimary,
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                보정 곡 열기
              </button>
            </div>
          </>
        )}

        {activeTab === 'visual' && (
          <>
            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>
                판정선 위치: {judgeLineY}px
              </h3>
              <div style={{ position: 'relative', padding: '0 8px' }}>
                <input
                  type="range"
                  min="200"
                  max="800"
                  step="10"
                  value={judgeLineY}
                  onChange={(e) => onJudgeLineYChange(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: CHART_EDITOR_THEME.accent }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: CHART_EDITOR_THEME.textSecondary,
                    fontSize: '11px',
                    marginTop: '4px',
                  }}
                >
                  <span>200px (위)</span>
                  <span>500px</span>
                  <span>800px (아래)</span>
                </div>
              </div>
            </div>

            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '10px' }}>
                플레이 HUD 스타일
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
                {([
                  { value: 'legacy', label: 'Legacy' },
                  { value: 'new-lite', label: 'New Lite' },
                  { value: 'new-full', label: 'New Full' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => applyToggleVisualSettings({ gameplayHudMode: option.value })}
                    style={{
                      padding: '9px 8px',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      border: `1px solid ${
                        visualSettings.gameplayHudMode === option.value
                          ? CHART_EDITOR_THEME.accent
                          : CHART_EDITOR_THEME.borderSubtle
                      }`,
                      background:
                        visualSettings.gameplayHudMode === option.value
                          ? CHART_EDITOR_THEME.accentSoft
                          : 'transparent',
                      color: CHART_EDITOR_THEME.textPrimary,
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: visualSettings.gameplayHudMode === option.value ? 700 : 500,
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', lineHeight: 1.5, marginBottom: '12px' }}>
                `New Lite`는 저사양 권장, `New Full`은 시각 효과를 더 유지한다. `Balanced`와 `Performance`에서는 `New Lite`가 기본 권장값이다.
              </p>

              <h4 style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', margin: '10px 0 8px' }}>
                렌더링 / 성능
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <button
                  onClick={() => applyToggleVisualSettings({ renderBackend: 'canvas2d' })}
                  style={{
                    padding: '9px 8px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${
                      visualSettings.renderBackend === 'canvas2d'
                        ? CHART_EDITOR_THEME.accent
                        : CHART_EDITOR_THEME.borderSubtle
                    }`,
                    background:
                      visualSettings.renderBackend === 'canvas2d'
                        ? CHART_EDITOR_THEME.accentSoft
                        : 'transparent',
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: visualSettings.renderBackend === 'canvas2d' ? 700 : 500,
                  }}
                >
                  Canvas 2D
                </button>
                <button
                  onClick={() => applyToggleVisualSettings({ renderBackend: 'webgl' })}
                  style={{
                    padding: '9px 8px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${
                      visualSettings.renderBackend === 'webgl'
                        ? CHART_EDITOR_THEME.accent
                        : CHART_EDITOR_THEME.borderSubtle
                    }`,
                    background:
                      visualSettings.renderBackend === 'webgl'
                        ? CHART_EDITOR_THEME.accentSoft
                        : 'transparent',
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: visualSettings.renderBackend === 'webgl' ? 700 : 500,
                  }}
                >
                  WebGL
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                {(['quality', 'balanced', 'performance'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => applyToggleVisualSettings({ performanceMode: mode })}
                    style={{
                      padding: '8px 6px',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      border: `1px solid ${
                        visualSettings.performanceMode === mode
                          ? CHART_EDITOR_THEME.accent
                          : CHART_EDITOR_THEME.borderSubtle
                      }`,
                      background:
                        visualSettings.performanceMode === mode
                          ? CHART_EDITOR_THEME.accentSoft
                          : 'transparent',
                      color: CHART_EDITOR_THEME.textPrimary,
                      fontSize: '12px',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      fontWeight: visualSettings.performanceMode === mode ? 700 : 500,
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  color: CHART_EDITOR_THEME.textPrimary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={visualSettings.topLaneExtensionEnabled}
                  onChange={(e) =>
                    applyToggleVisualSettings({ topLaneExtensionEnabled: e.target.checked })
                  }
                  style={{ accentColor: CHART_EDITOR_THEME.accent }}
                />
                상단 레인 연장 효과
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: CHART_EDITOR_THEME.textPrimary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={visualSettings.slotHudEnabled}
                  onChange={(e) => applyToggleVisualSettings({ slotHudEnabled: e.target.checked })}
                  style={{ accentColor: CHART_EDITOR_THEME.accent }}
                />
                슬롯 HUD (콤보/진행도/정확도)
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                  color: CHART_EDITOR_THEME.textPrimary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={visualSettings.bgaBlurEnabled}
                  onChange={(e) => applyToggleVisualSettings({ bgaBlurEnabled: e.target.checked })}
                  style={{ accentColor: CHART_EDITOR_THEME.accent }}
                />
                레인 뒤 BGA 소프트 블러
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                  marginBottom: '8px',
                  color: CHART_EDITOR_THEME.textPrimary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={visualSettings.keyPressGlowEnabled}
                  onChange={(e) =>
                    applyToggleVisualSettings({ keyPressGlowEnabled: e.target.checked })
                  }
                  style={{ accentColor: CHART_EDITOR_THEME.accent }}
                />
                키 입력 글로우 강조
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  color: CHART_EDITOR_THEME.textPrimary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={visualSettings.lanePressTintEnabled}
                  onChange={(e) =>
                    applyToggleVisualSettings({ lanePressTintEnabled: e.target.checked })
                  }
                  style={{ accentColor: CHART_EDITOR_THEME.accent }}
                />
                레인 눌림 블루 틴트
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: CHART_EDITOR_THEME.textPrimary,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={visualSettings.keyPressPulseEnabled}
                  onChange={(e) =>
                    applyToggleVisualSettings({ keyPressPulseEnabled: e.target.checked })
                  }
                  style={{ accentColor: CHART_EDITOR_THEME.accent }}
                />
                키 입력 펄스(눌림 스케일)
              </label>
              <p
                style={{
                  color: CHART_EDITOR_THEME.textSecondary,
                  fontSize: '11px',
                  marginTop: '8px',
                  marginBottom: 0,
                  lineHeight: 1.45,
                }}
              >
                Legacy/New HUD 선택에 따라 키 눌림 디자인도 함께 변경됩니다.
                옵션으로 글로우/펄스 연출을 개별 ON/OFF 할 수 있습니다.
              </p>
            </div>

            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', margin: 0 }}>
                  비주얼 세부 설정
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setIsVisualDetailsExpanded((prev) => !prev)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      background: 'transparent',
                      color: CHART_EDITOR_THEME.textSecondary,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {isVisualDetailsExpanded ? '숨기기' : '펼치기'}
                  </button>
                  <button
                    onClick={handleResetVisualSettings}
                    style={{
                      padding: '4px 8px',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      background: 'transparent',
                      color: CHART_EDITOR_THEME.textSecondary,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    기본값으로
                  </button>
                </div>
              </div>
              {!isVisualDetailsExpanded ? (
                <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                  레인 폭, 노트 크기, 색상, 투명도 같은 세부 시각 설정을 펼쳐서 조정할 수 있습니다.
                </p>
              ) : (
              <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                {(Object.keys(GAME_VISUAL_PRESETS) as Array<Exclude<VisualPresetId, 'custom'>>).map((presetId) => (
                  <button
                    key={presetId}
                    onClick={() => handlePresetClick(presetId)}
                    style={{
                      padding: '8px 6px',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      border: `1px solid ${visualSettings.presetId === presetId ? CHART_EDITOR_THEME.accent : CHART_EDITOR_THEME.borderSubtle}`,
                      background: visualSettings.presetId === presetId ? CHART_EDITOR_THEME.accentSoft : 'transparent',
                      color: CHART_EDITOR_THEME.textPrimary,
                      fontSize: '12px',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {presetId}
                  </button>
                ))}
              </div>

              <VisualSliderRow
                label="레인 폭"
                value={visualSettings.laneWidth}
                min={VISUAL_SETTING_LIMITS.laneWidth.min}
                max={VISUAL_SETTING_LIMITS.laneWidth.max}
                step={1}
                onChange={(value) => scheduleVisualSettingsChange({ laneWidth: value })}
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="레인 간격"
                value={visualSettings.laneGap}
                min={VISUAL_SETTING_LIMITS.laneGap.min}
                max={VISUAL_SETTING_LIMITS.laneGap.max}
                step={1}
                onChange={(value) => scheduleVisualSettingsChange({ laneGap: value })}
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="레인 묶음 X 오프셋"
                value={visualSettings.laneOffsetX}
                min={-laneOffsetLimit}
                max={laneOffsetLimit}
                step={1}
                onChange={(value) => scheduleVisualSettingsChange({ laneOffsetX: value })}
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="레인 UI 투명도"
                value={Math.round(visualSettings.laneOpacity * 100)}
                min={VISUAL_SETTING_LIMITS.laneOpacity.min * 100}
                max={VISUAL_SETTING_LIMITS.laneOpacity.max * 100}
                step={5}
                suffix="%"
                onChange={(value) => scheduleVisualSettingsChange({ laneOpacity: value / 100 })}
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="키 박스 투명도"
                value={Math.round((1 - visualSettings.keyLaneOpacity) * 100)}
                min={0}
                max={100}
                step={5}
                suffix="%"
                onChange={(value) =>
                  scheduleVisualSettingsChange({ keyLaneOpacity: Math.max(0, 1 - value / 100) })
                }
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="슬롯 HUD 투명도"
                value={Math.round((1 - visualSettings.slotHudOpacity) * 100)}
                min={0}
                max={100}
                step={5}
                suffix="%"
                onChange={(value) =>
                  scheduleVisualSettingsChange({ slotHudOpacity: Math.max(0, 1 - value / 100) })
                }
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="키 박스 위치"
                value={visualSettings.keyLaneY}
                min={keyLaneMin}
                max={keyLaneMax}
                step={5}
                onChange={(value) => scheduleVisualSettingsChange({ keyLaneY: value })}
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="노트 폭"
                value={visualSettings.noteWidth}
                min={VISUAL_SETTING_LIMITS.noteWidth.min}
                max={visualSettings.laneWidth}
                step={1}
                onChange={(value) => scheduleVisualSettingsChange({ noteWidth: value })}
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="노트 높이"
                value={visualSettings.noteHeight}
                min={VISUAL_SETTING_LIMITS.noteHeight.min}
                max={VISUAL_SETTING_LIMITS.noteHeight.max}
                step={1}
                onChange={(value) => scheduleVisualSettingsChange({ noteHeight: value })}
                onCommit={commitVisualSettings}
              />
              <NoteColorEditor
                label="바깥 레인 노트 색상 (1, 4레인)"
                value={visualSettings.outerLaneNoteColor}
                onChange={(value) => scheduleVisualSettingsChange({ outerLaneNoteColor: value })}
                onCommit={commitVisualSettings}
              />
              <NoteColorEditor
                label="안쪽 레인 노트 색상 (2, 3레인)"
                value={visualSettings.innerLaneNoteColor}
                onChange={(value) => scheduleVisualSettingsChange({ innerLaneNoteColor: value })}
                onCommit={commitVisualSettings}
              />
              <VisualSliderRow
                label="콤보 숫자 투명도"
                value={Math.round(visualSettings.comboOpacity * 100)}
                min={VISUAL_SETTING_LIMITS.comboOpacity.min * 100}
                max={VISUAL_SETTING_LIMITS.comboOpacity.max * 100}
                step={5}
                suffix="%"
                onChange={(value) => scheduleVisualSettingsChange({ comboOpacity: value / 100 })}
                onCommit={commitVisualSettings}
              />

              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '6px', lineHeight: 1.5, marginBottom: 0 }}>
                레인 UI 투명도는 레인 배경/경계선에만 적용됩니다.
                키 박스와 슬롯 HUD는 각 전용 투명도 슬라이더를 사용합니다.
                판정선은 가독성을 위해 항상 100% 불투명으로 유지됩니다.
                판정 로직은 변경되지 않습니다.
              </p>
              {isGameplayActive && (
                <p style={{ color: CHART_EDITOR_THEME.accentStrong, fontSize: '11px', marginTop: '6px', lineHeight: 1.5, marginBottom: 0 }}>
                  플레이 중 변경한 비주얼 설정은 다음 판부터 적용됩니다.
                </p>
              )}
              </>
              )}
            </div>
          </>
        )}

        {activeTab === 'account' && (
          <>
            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>
                닉네임
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => onDisplayNameChange(e.target.value)}
                  disabled={!isLoggedIn}
                  placeholder="닉네임 입력"
                  maxLength={20}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                    background: CHART_EDITOR_THEME.surface,
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '14px',
                    opacity: isLoggedIn ? 1 : 0.55,
                    cursor: isLoggedIn ? 'text' : 'not-allowed',
                  }}
                />
                <button
                  onClick={handleSaveNickname}
                  disabled={!isLoggedIn || !canChangeDisplayName || isSavingNickname || !displayName.trim()}
                  style={{
                    padding: '10px 16px',
                    borderRadius: CHART_EDITOR_THEME.radiusSm,
                    border: 'none',
                    background: isLoggedIn && canChangeDisplayName && displayName.trim()
                      ? CHART_EDITOR_THEME.ctaButtonGradient
                      : CHART_EDITOR_THEME.borderSubtle,
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontSize: '14px',
                    cursor: isLoggedIn && canChangeDisplayName && displayName.trim() ? 'pointer' : 'not-allowed',
                    opacity: isLoggedIn && canChangeDisplayName && displayName.trim() ? 1 : 0.5,
                  }}
                >
                  {isSavingNickname ? '저장 중...' : '저장'}
                </button>
              </div>
              {nextDisplayNameChangeAt && !canChangeDisplayName && (
                <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>
                  {formatNextChangeDate(nextDisplayNameChangeAt)}
                </p>
              )}
              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '4px', marginBottom: 0 }}>
                {isLoggedIn ? '닉네임은 일주일에 한 번만 변경할 수 있습니다.' : '닉네임은 로그인 후에만 변경할 수 있습니다.'}
              </p>
            </div>

            <div style={sectionCardStyle}>
              <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginTop: 0, marginBottom: '8px' }}>
                계정 역할
              </h3>
              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '14px', margin: 0 }}>
                현재 역할: <strong style={{ color: CHART_EDITOR_THEME.textPrimary }}>{currentRoleLabel}</strong>
              </p>
              <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '4px', marginBottom: 0 }}>
                역할 변경은 관리자에게 문의하세요.
              </p>
            </div>
          </>
        )}
        </div>

        <button
          className="settings-modal-close"
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            background: 'transparent',
            color: CHART_EDITOR_THEME.textPrimary,
            fontSize: '14px',
            cursor: 'pointer',
            marginTop: '8px',
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
};
