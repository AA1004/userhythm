import React from 'react';
import {
  SubtitleCue,
  SubtitleStyle,
  SubtitleEffectType,
  FONT_PRESETS,
  FONT_SIZE_PRESETS,
  COLOR_PRESETS,
} from '../../types/subtitle';
import { CHART_EDITOR_THEME } from '../ChartEditor/constants';

interface SubtitleInspectorProps {
  selectedCue: SubtitleCue | null;
  onChangeCue: (next: SubtitleCue) => void;
}

export const SubtitleInspector: React.FC<SubtitleInspectorProps> = ({
  selectedCue,
  onChangeCue,
}) => {
  if (!selectedCue) {
    return (
      <div
        style={{
          padding: 16,
          color: CHART_EDITOR_THEME.textSecondary,
          fontSize: 13,
        }}
      >
        자막을 선택하면 상세 설정이 여기에 표시됩니다.
      </div>
    );
  }

  const style: SubtitleStyle = selectedCue.style;

  const updateStyle = (patch: Partial<SubtitleStyle>) => {
    onChangeCue({
      ...selectedCue,
      style: {
        ...style,
        ...patch,
      },
    });
  };

  const updateEffect = (direction: 'in' | 'out', value: SubtitleEffectType) => {
    updateStyle(
      direction === 'in'
        ? { inEffect: value }
        : { outEffect: value }
    );
  };

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontSize: 13,
      }}
    >
      {/* 텍스트 */}
      <div
        style={{
          padding: 10,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div style={{ marginBottom: 6, fontWeight: 600 }}>자막 텍스트</div>
        <textarea
          value={selectedCue.text}
          onChange={(e) =>
            onChangeCue({
              ...selectedCue,
              text: e.target.value,
            })
          }
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            backgroundColor: '#020617',
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            padding: 8,
          }}
        />
      </div>

      {/* 폰트/스타일 */}
      <div
        style={{
          padding: 10,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div style={{ marginBottom: 6, fontWeight: 600 }}>텍스트 스타일</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>
            <span style={{ display: 'block', marginBottom: 4 }}>폰트</span>
            <select
              value={style.fontFamily}
              onChange={(e) => updateStyle({ fontFamily: e.target.value })}
              style={{
                width: '100%',
                padding: '6px 8px',
                backgroundColor: '#020617',
                color: CHART_EDITOR_THEME.textPrimary,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              }}
            >
              {FONT_PRESETS.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>크기</span>
              <select
                value={style.fontSize}
                onChange={(e) =>
                  updateStyle({ fontSize: Number(e.target.value) || 24 })
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#020617',
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              >
                {FONT_SIZE_PRESETS.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </label>

            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>두께</span>
              <select
                value={style.fontWeight}
                onChange={(e) =>
                  updateStyle({
                    fontWeight: e.target.value as SubtitleStyle['fontWeight'],
                  })
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#020617',
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              >
                <option value="normal">보통</option>
                <option value="bold">굵게</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>글자 색</span>
              <select
                value={style.color}
                onChange={(e) => updateStyle({ color: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#020617',
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              >
                {COLOR_PRESETS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>배경 불투명도</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={style.backgroundOpacity ?? 0.5}
                onChange={(e) =>
                  updateStyle({ backgroundOpacity: Number(e.target.value) })
                }
                style={{ width: '100%' }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 전환 효과 */}
      <div
        style={{
          padding: 10,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div style={{ marginBottom: 6, fontWeight: 600 }}>전환 효과</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>IN</span>
              <select
                value={style.inEffect ?? 'none'}
                onChange={(e) =>
                  updateEffect('in', e.target.value as SubtitleEffectType)
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#020617',
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              >
                <option value="none">없음</option>
                <option value="fade">페이드 인</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>IN 시간(ms)</span>
              <input
                type="number"
                value={style.inDurationMs ?? 120}
                onChange={(e) =>
                  updateStyle({ inDurationMs: Number(e.target.value) || 0 })
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#020617',
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>OUT</span>
              <select
                value={style.outEffect ?? 'none'}
                onChange={(e) =>
                  updateEffect('out', e.target.value as SubtitleEffectType)
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#020617',
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              >
                <option value="none">없음</option>
                <option value="fade">페이드 아웃</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', marginBottom: 4 }}>OUT 시간(ms)</span>
              <input
                type="number"
                value={style.outDurationMs ?? 120}
                onChange={(e) =>
                  updateStyle({ outDurationMs: Number(e.target.value) || 0 })
                }
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#020617',
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};


