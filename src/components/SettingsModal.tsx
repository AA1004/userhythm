import React, { useState } from 'react';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // 닉네임 관련
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onDisplayNameSave: () => Promise<void>;
  canChangeDisplayName: boolean;
  nextDisplayNameChangeAt: Date | null;
  // 키 바인딩 관련
  keyBindings: string[];
  onKeyBindingChange: (index: number, key: string) => void;
  onResetKeyBindings: () => void;
  // 노트 속도 관련
  noteSpeed: number;
  onNoteSpeedChange: (speed: number) => void;
  // BGA 관련
  isBgaEnabled: boolean;
  onBgaChange: (enabled: boolean) => void;
  // 역할 표시
  currentRoleLabel: string;
}

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
  isBgaEnabled,
  onBgaChange,
  currentRoleLabel,
}) => {
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [recordingKeyIndex, setRecordingKeyIndex] = useState<number | null>(null);

  if (!isOpen) return null;

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
    const key = e.key.toUpperCase();
    if (key.length === 1 || ['ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT', 'SPACE'].includes(key)) {
      onKeyBindingChange(index, key === ' ' ? 'SPACE' : key);
      setRecordingKeyIndex(null);
    }
  };

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

  return (
    <div
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
        style={{
          background: CHART_EDITOR_THEME.surfaceElevated,
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          padding: '32px',
          width: '480px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            color: CHART_EDITOR_THEME.textPrimary,
            marginTop: 0,
            marginBottom: '24px',
            fontSize: '18px',
            letterSpacing: '0.03em',
          }}
        >
          ⚙️ 설정
        </h2>

        {/* 닉네임 설정 */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginBottom: '8px' }}>
            닉네임
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
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
              }}
            />
            <button
              onClick={handleSaveNickname}
              disabled={!canChangeDisplayName || isSavingNickname || !displayName.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: 'none',
                background: canChangeDisplayName && displayName.trim()
                  ? CHART_EDITOR_THEME.ctaButtonGradient
                  : CHART_EDITOR_THEME.borderSubtle,
                color: CHART_EDITOR_THEME.textPrimary,
                fontSize: '14px',
                cursor: canChangeDisplayName && displayName.trim() ? 'pointer' : 'not-allowed',
                opacity: canChangeDisplayName && displayName.trim() ? 1 : 0.5,
              }}
            >
              {isSavingNickname ? '저장 중...' : '저장'}
            </button>
          </div>
          {nextDisplayNameChangeAt && !canChangeDisplayName && (
            <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginTop: '6px' }}>
              {formatNextChangeDate(nextDisplayNameChangeAt)}
            </p>
          )}
          <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '4px' }}>
            닉네임은 일주일에 한 번만 변경할 수 있습니다.
          </p>
        </div>

        {/* 키 바인딩 설정 */}
        <div style={{ marginBottom: '24px' }}>
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
                    border: `2px solid ${recordingKeyIndex === index ? CHART_EDITOR_THEME.accent : CHART_EDITOR_THEME.borderSubtle}`,
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
          <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '6px' }}>
            버튼을 클릭한 후 원하는 키를 누르세요.
          </p>
        </div>

        {/* 노트 속도 설정 */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginBottom: '8px' }}>
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
              style={{
                width: '100%',
                accentColor: CHART_EDITOR_THEME.accent,
              }}
            />
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              color: CHART_EDITOR_THEME.textSecondary, 
              fontSize: '11px',
              marginTop: '4px',
            }}>
              <span>0.5x</span>
              <span>5.0x</span>
              <span>10.0x</span>
            </div>
          </div>
        </div>

        {/* BGA 설정 */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginBottom: '8px' }}>
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
        </div>

        {/* 역할 표시 */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '14px', marginBottom: '8px' }}>
            계정 역할
          </h3>
          <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '14px', margin: 0 }}>
            현재 역할: <strong style={{ color: CHART_EDITOR_THEME.textPrimary }}>{currentRoleLabel}</strong>
          </p>
          <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginTop: '4px' }}>
            역할 변경은 관리자에게 문의하세요.
          </p>
        </div>

        {/* 닫기 버튼 */}
        <button
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
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
};

