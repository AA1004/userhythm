import React, { useState, useEffect } from 'react';
import {
  SubtitleCue,
  SubtitleStyle,
  SubtitleEffectType,
  FONT_PRESETS,
  FONT_SIZE_PRESETS,
  COLOR_PRESETS,
  getAllFonts,
  addCustomFont,
  removeCustomFont,
  CustomFont,
} from '../../types/subtitle';
import { CHART_EDITOR_THEME } from '../ChartEditor/constants';

interface SubtitleInspectorProps {
  selectedCue: SubtitleCue | null;
  allCues: SubtitleCue[];
  onChangeCue: (next: SubtitleCue) => void;
  onDuplicateAtEnd?: (baseCue: SubtitleCue) => void; // 끝 시간부터 복사본 생성
  onDeleteCue?: (cueId: string) => void; // 자막 삭제
  bpm?: number;
  beatsPerMeasure?: number;
  gridOffsetMs?: number;
}

// 위치 프리셋 정의 (9방향)
const POSITION_PRESETS = [
  { label: '↖', x: 0.1, y: 0.1 },   // 상단 좌
  { label: '↑', x: 0.5, y: 0.1 },   // 상단 중
  { label: '↗', x: 0.9, y: 0.1 },   // 상단 우
  { label: '←', x: 0.1, y: 0.5 },   // 중앙 좌
  { label: '●', x: 0.5, y: 0.5 },   // 중앙
  { label: '→', x: 0.9, y: 0.5 },   // 중앙 우
  { label: '↙', x: 0.1, y: 0.9 },   // 하단 좌
  { label: '↓', x: 0.5, y: 0.9 },   // 하단 중
  { label: '↘', x: 0.9, y: 0.9 },   // 하단 우
];

export const SubtitleInspector: React.FC<SubtitleInspectorProps> = ({
  selectedCue,
  allCues,
  onChangeCue,
  onDuplicateAtEnd,
  onDeleteCue,
  bpm = 120,
  beatsPerMeasure = 4,
  gridOffsetMs = 0,
}) => {
  const [allFonts, setAllFonts] = useState<CustomFont[]>(getAllFonts());
  const [newFontName, setNewFontName] = useState('');
  const [newFontValue, setNewFontValue] = useState('');

  // 폰트 목록 업데이트
  useEffect(() => {
    setAllFonts(getAllFonts());
  }, []);

  const handleAddFont = () => {
    if (!newFontName.trim() || !newFontValue.trim()) return;
    
    addCustomFont(newFontName.trim(), newFontValue.trim());
    setAllFonts(getAllFonts());
    setNewFontName('');
    setNewFontValue('');
  };

  const handleRemoveFont = (fontValue: string) => {
    removeCustomFont(fontValue);
    setAllFonts(getAllFonts());
    // 현재 선택된 폰트가 삭제된 폰트면 기본 폰트로 변경
    if (selectedCue?.style.fontFamily === fontValue) {
      const defaultFont = FONT_PRESETS[0].value;
      onChangeCue({
        ...selectedCue,
        style: { ...selectedCue.style, fontFamily: defaultFont },
      });
    }
  };

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

  // 같은 트랙의 이전 자막 찾기
  const findPreviousCue = (): SubtitleCue | null => {
    const currentTrackId = selectedCue.trackId ?? selectedCue.style.trackId ?? 'default';
    const sameTrackCues = allCues
      .filter((cue) => {
        const trackId = cue.trackId ?? cue.style.trackId ?? 'default';
        return trackId === currentTrackId && cue.id !== selectedCue.id;
      })
      .sort((a, b) => a.startTimeMs - b.startTimeMs);
    
    // 현재 자막보다 시작 시간이 빠른 자막 중 가장 마지막 것
    const previousCues = sameTrackCues.filter(
      (cue) => cue.startTimeMs < selectedCue.startTimeMs
    );
    
    return previousCues.length > 0 ? previousCues[previousCues.length - 1] : null;
  };

  const applyPreviousPosition = () => {
    const prevCue = findPreviousCue();
    if (prevCue && prevCue.style.position) {
      updateStyle({ position: { ...prevCue.style.position } });
    }
  };

  const previousCue = findPreviousCue();

  // 한 마디 길이 계산 (ms)
  const beatMs = 60000 / bpm;
  const measureMs = beatMs * beatsPerMeasure;

  // 가장 가까운 마디 시작으로 스냅
  const snapToMeasureStart = (timeMs: number): number => {
    const adjustedTime = timeMs - gridOffsetMs;
    const measureIndex = Math.round(adjustedTime / measureMs);
    return measureIndex * measureMs + gridOffsetMs;
  };

  // 한 마디에 맞추기
  const snapToOneMeasure = () => {
    const snappedStart = snapToMeasureStart(selectedCue.startTimeMs);
    const snappedEnd = snappedStart + measureMs;
    
    onChangeCue({
      ...selectedCue,
      startTimeMs: snappedStart,
      endTimeMs: snappedEnd,
    });
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
            backgroundColor: CHART_EDITOR_THEME.surface,
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            padding: 8,
          }}
        />
      </div>

      {/* 위치 */}
      <div
        style={{
          padding: 10,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div style={{ marginBottom: 8, fontWeight: 600 }}>위치</div>
        
        {/* 9방향 프리셋 그리드 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
            marginBottom: 10,
          }}
        >
          {POSITION_PRESETS.map((preset, idx) => {
            const currentPos = style.position ?? { x: 0.5, y: 0.9 };
            const isActive =
              Math.abs(currentPos.x - preset.x) < 0.05 &&
              Math.abs(currentPos.y - preset.y) < 0.05;
            
            return (
              <button
                key={idx}
                onClick={() => updateStyle({ position: { x: preset.x, y: preset.y } })}
                style={{
                  padding: '8px 4px',
                  border: isActive
                    ? `2px solid ${CHART_EDITOR_THEME.accentStrong}`
                    : `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  backgroundColor: isActive
                    ? 'rgba(56,189,248,0.2)'
                    : CHART_EDITOR_THEME.surface,
                  color: CHART_EDITOR_THEME.textPrimary,
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: isActive ? 'bold' : 'normal',
                  transition: 'all 0.15s',
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* 이전 자막 위치 복사 */}
        <button
          onClick={applyPreviousPosition}
          disabled={!previousCue}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            backgroundColor: previousCue
              ? 'rgba(34,197,94,0.15)'
              : CHART_EDITOR_THEME.surface,
            color: previousCue
              ? '#4ade80'
              : CHART_EDITOR_THEME.textMuted,
            cursor: previousCue ? 'pointer' : 'not-allowed',
            fontSize: 12,
            fontWeight: 500,
            transition: 'all 0.15s',
          }}
        >
          ◀ 이전 자막 위치 적용
          {previousCue && (
            <span style={{ opacity: 0.7, marginLeft: 6 }}>
              ({(previousCue.style.position?.x ?? 0.5).toFixed(2)}, {(previousCue.style.position?.y ?? 0.9).toFixed(2)})
            </span>
          )}
        </button>

        {/* 끝 시간에서 복사본 생성 */}
        {onDuplicateAtEnd && (
          <button
            onClick={() => onDuplicateAtEnd(selectedCue)}
            style={{
              width: '100%',
              marginTop: 6,
              padding: '8px 12px',
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              backgroundColor: 'rgba(56,189,248,0.15)',
              color: CHART_EDITOR_THEME.accentStrong,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            ➕ 끝에서 이어서 복사본 생성
            <span style={{ opacity: 0.7, marginLeft: 6 }}>
              ({(selectedCue.endTimeMs / 1000).toFixed(2)}s~)
            </span>
          </button>
        )}

        {/* 한 마디에 맞추기 */}
        <button
          onClick={snapToOneMeasure}
          style={{
            width: '100%',
            marginTop: 6,
            padding: '8px 12px',
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            backgroundColor: 'rgba(251,191,36,0.15)',
            color: '#fbbf24',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            transition: 'all 0.15s',
          }}
        >
          🎵 한 마디에 맞추기
          <span style={{ opacity: 0.7, marginLeft: 6 }}>
            ({(measureMs / 1000).toFixed(2)}s)
          </span>
        </button>
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
                backgroundColor: CHART_EDITOR_THEME.surface,
                color: CHART_EDITOR_THEME.textPrimary,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              }}
            >
              {allFonts.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          {/* 사용자 폰트 추가 */}
          <div
            style={{
              padding: 12,
              backgroundColor: CHART_EDITOR_THEME.surface,
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
              사용자 폰트 추가
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                placeholder="폰트 이름 (예: 나눔고딕)"
                value={newFontName}
                onChange={(e) => setNewFontName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFontName.trim() && newFontValue.trim()) {
                    handleAddFont();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  fontSize: 13,
                }}
              />
              <input
                type="text"
                placeholder="CSS 폰트 값 (예: Nanum Gothic, sans-serif)"
                value={newFontValue}
                onChange={(e) => setNewFontValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFontName.trim() && newFontValue.trim()) {
                    handleAddFont();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  fontSize: 13,
                }}
              />
              <button
                onClick={handleAddFont}
                disabled={!newFontName.trim() || !newFontValue.trim()}
                style={{
                  padding: '6px 12px',
                  backgroundColor:
                    newFontName.trim() && newFontValue.trim()
                      ? CHART_EDITOR_THEME.accent
                      : CHART_EDITOR_THEME.surfaceElevated,
                  color:
                    newFontName.trim() && newFontValue.trim()
                      ? CHART_EDITOR_THEME.textOnAccent
                      : CHART_EDITOR_THEME.textSecondary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: 'none',
                  cursor:
                    newFontName.trim() && newFontValue.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                추가
              </button>
            </div>
            {/* 추가된 사용자 폰트 목록 */}
            {allFonts.filter((f) => !FONT_PRESETS.some((pf) => pf.value === f.value))
              .length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${CHART_EDITOR_THEME.borderSubtle}` }}>
                <div style={{ marginBottom: 6, fontSize: 12, color: CHART_EDITOR_THEME.textSecondary }}>
                  추가된 폰트
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {allFonts
                    .filter((f) => !FONT_PRESETS.some((pf) => pf.value === f.value))
                    .map((font) => (
                      <div
                        key={font.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
                          borderRadius: CHART_EDITOR_THEME.radiusSm,
                        }}
                      >
                        <span style={{ fontSize: 12 }}>{font.label}</span>
                        <button
                          onClick={() => handleRemoveFont(font.value)}
                          style={{
                            padding: '2px 8px',
                            backgroundColor: 'transparent',
                            color: CHART_EDITOR_THEME.textSecondary,
                            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                            borderRadius: CHART_EDITOR_THEME.radiusSm,
                            cursor: 'pointer',
                            fontSize: 11,
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

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
                  backgroundColor: CHART_EDITOR_THEME.surface,
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
                  backgroundColor: CHART_EDITOR_THEME.surface,
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              >
                <option value="normal">보통</option>
                <option value="bold">굵게</option>
              </select>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                alignSelf: 'flex-end',
                paddingBottom: 8,
              }}
            >
              <input
                type="checkbox"
                checked={style.fontStyle === 'italic'}
                onChange={(e) =>
                  updateStyle({ fontStyle: e.target.checked ? 'italic' : 'normal' })
                }
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontStyle: 'italic' }}>기울임</span>
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
                  backgroundColor: CHART_EDITOR_THEME.surface,
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
          </div>

          {/* 배경 설정 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={style.showBackground !== false}
                onChange={(e) =>
                  updateStyle({ showBackground: e.target.checked })
                }
                style={{ cursor: 'pointer' }}
              />
              <span>배경 표시</span>
            </label>
          </div>

          {style.showBackground !== false && (
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
          )}
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
                  backgroundColor: CHART_EDITOR_THEME.surface,
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
                  backgroundColor: CHART_EDITOR_THEME.surface,
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
                  backgroundColor: CHART_EDITOR_THEME.surface,
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
                  backgroundColor: CHART_EDITOR_THEME.surface,
                  color: CHART_EDITOR_THEME.textPrimary,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 삭제 */}
      {onDeleteCue && (
        <button
          onClick={() => {
            if (window.confirm('이 자막을 삭제하시겠습니까?')) {
              onDeleteCue(selectedCue.id);
            }
          }}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: `1px solid ${CHART_EDITOR_THEME.danger}`,
            borderRadius: CHART_EDITOR_THEME.radiusSm,
            backgroundColor: 'rgba(239,68,68,0.1)',
            color: CHART_EDITOR_THEME.danger,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            transition: 'all 0.15s',
          }}
        >
          🗑️ 자막 삭제
        </button>
      )}
    </div>
  );
};
