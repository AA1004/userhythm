import React, { useCallback } from 'react';
import { SubtitleCue, SubtitleStyle } from '../../types/subtitle';
import { CHART_EDITOR_THEME } from '../ChartEditor/constants';

interface SubtitlePreviewCanvasProps {
  width: number;
  height: number;
  currentTimeMs: number;
  cues: SubtitleCue[];
  selectedCueId: string | null;
  onChangeCueStyle: (id: string, nextStyle: SubtitleStyle) => void;
}

export const SubtitlePreviewCanvas: React.FC<SubtitlePreviewCanvasProps> = ({
  width,
  height,
  currentTimeMs,
  cues,
  selectedCueId,
  onChangeCueStyle,
}) => {
  const activeCues = cues.filter(
    (c) => currentTimeMs >= c.startTimeMs && currentTimeMs <= c.endTimeMs
  );

  const handleDragStart = (
    cue: SubtitleCue,
    e: React.MouseEvent<HTMLDivElement>,
    mode: 'move' | 'rotate'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget.parentElement as HTMLDivElement).getBoundingClientRect();

    const originX = e.clientX;
    const originY = e.clientY;
    const style = cue.style;

    const originPos = style.position ?? { x: 0.5, y: 0.9 };
    const originRot = style.rotationDeg ?? 0;

    const handleMove = (ev: MouseEvent) => {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;

      if (mode === 'move') {
        const nextX = Math.min(
          1,
          Math.max(0, originPos.x + dx / rect.width)
        );
        const nextY = Math.min(
          1,
          Math.max(0, originPos.y + dy / rect.height)
        );

        onChangeCueStyle(cue.id, {
          ...style,
          position: { x: nextX, y: nextY },
        });
      } else {
        const centerX = rect.left + rect.width * (originPos.x - 0.5);
        const centerY = rect.top + rect.height * (originPos.y - 0.5);
        const angleRad = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
        const angleDeg = (angleRad * 180) / Math.PI;
        onChangeCueStyle(cue.id, {
          ...style,
          rotationDeg: angleDeg - 90 + originRot,
        });
      }
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const renderCue = useCallback(
    (cue: SubtitleCue) => {
      const style = cue.style;
      const pos = style.position ?? { x: 0.5, y: 0.9 };

      const left = pos.x * width;
      const top = pos.y * height;

      const transform: string[] = [];

      transform.push('translate(-50%, -50%)');
      if (style.rotationDeg) {
        transform.push(`rotate(${style.rotationDeg}deg)`);
      }

      const isSelected = cue.id === selectedCueId;

      const bgOpacity = style.backgroundOpacity ?? 0.5;
      const backgroundColor =
        style.backgroundColor ?? 'rgba(0,0,0,1)';

      return (
        <div
          key={cue.id}
          style={{
            position: 'absolute',
            left,
            top,
            transform: transform.join(' '),
            transformOrigin: '50% 50%',
            padding: '8px 16px',
            borderRadius: 8,
            backgroundColor: backgroundColor,
            opacity: bgOpacity,
            color: style.color,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            fontStyle: style.fontStyle,
            border: isSelected
              ? `1px solid ${CHART_EDITOR_THEME.accentStrong}`
              : 'none',
            boxShadow: isSelected
              ? '0 0 12px rgba(56,189,248,0.8)'
              : '0 4px 12px rgba(15,23,42,0.8)',
            whiteSpace: 'pre-wrap',
            textAlign: style.textAlign ?? 'center',
            pointerEvents: 'auto',
          }}
        >
          {cue.text}
          {isSelected && (
            <>
              {/* 이동 핸들 (본문 영역 자체) */}
              <div
                onMouseDown={(e) => handleDragStart(cue, e, 'move')}
                style={{
                  position: 'absolute',
                  inset: 0,
                  cursor: 'move',
                }}
              />
              {/* 회전 핸들 */}
              <div
                onMouseDown={(e) => handleDragStart(cue, e, 'rotate')}
                style={{
                  position: 'absolute',
                  top: -24,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 14,
                  height: 14,
                  borderRadius: '9999px',
                  border: `2px solid ${CHART_EDITOR_THEME.accentStrong}`,
                  backgroundColor: '#020617',
                  cursor: 'grab',
                  boxShadow: '0 0 10px rgba(56,189,248,0.8)',
                }}
              />
            </>
          )}
        </div>
      );
    },
    [height, width, onChangeCueStyle, selectedCueId]
  );

  return (
    <div
      style={{
        flex: 1,
        minHeight: 260,
        borderRadius: CHART_EDITOR_THEME.radiusLg,
        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        background:
          'radial-gradient(circle at top, #020617 0%, #020617 40%, #020617 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: CHART_EDITOR_THEME.textSecondary,
          fontSize: 12,
          pointerEvents: 'none',
        }}
      >
        프리뷰 (실제 게임 화면 비율과 유사)\n현재 시간: {(currentTimeMs / 1000).toFixed(2)}s
      </div>

      {/* 실제 자막 렌더링 레이어 */}
      <div
        style={{
          position: 'relative',
          width,
          height,
          margin: '0 auto',
          pointerEvents: 'none',
        }}
      >
        {activeCues.map(renderCue)}
      </div>
    </div>
  );
};


