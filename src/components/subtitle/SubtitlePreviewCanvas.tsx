import React, { useCallback, useRef } from 'react';
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
  const previewRef = useRef<HTMLDivElement | null>(null);

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

    const originX = e.clientX;
    const originY = e.clientY;
    const style = cue.style;

    const originPos = style.position ?? { x: 0.5, y: 0.9 };
    const originRot = style.rotationDeg ?? 0;

    const handleMove = (ev: MouseEvent) => {
      const rect = previewRef.current?.getBoundingClientRect();
      if (!rect) return;

      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;

      if (mode === 'move') {
        const nextX = Math.min(1, Math.max(0, originPos.x + dx / rect.width));
        const nextY = Math.min(1, Math.max(0, originPos.y + dy / rect.height));

        onChangeCueStyle(cue.id, {
          ...style,
          position: { x: nextX, y: nextY },
        });
      } else {
        const centerX = rect.left + rect.width * originPos.x;
        const centerY = rect.top + rect.height * originPos.y;
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

      const left = `${pos.x * 100}%`;
      const top = `${pos.y * 100}%`;

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
            textAlign: style.textAlign ?? 'center',
            pointerEvents: 'auto',
          }}
        >
          {cue.text.split('\n').map((line, idx, arr) => (
            <React.Fragment key={idx}>
              {line}
              {idx < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
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
                  backgroundColor: CHART_EDITOR_THEME.surface,
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
        flex: '0 0 auto',
        borderRadius: CHART_EDITOR_THEME.radiusLg,
        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        backgroundColor: 'transparent',
        padding: 8,
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={previewRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: `${width}px`,
          margin: '0 auto',
          aspectRatio: `${width} / ${height}`,
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          overflow: 'hidden',
          background:
            `radial-gradient(circle at top, ${CHART_EDITOR_THEME.rootBackground} 0%, ${CHART_EDITOR_THEME.rootBackground} 40%, ${CHART_EDITOR_THEME.rootBackground} 100%)`,
        }}
      >
        {/* 안내 텍스트 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: 8,
            color: CHART_EDITOR_THEME.textSecondary,
            fontSize: 11,
            pointerEvents: 'none',
            background:
              'linear-gradient(180deg, rgba(15,23,42,0.4), transparent 40%)',
          }}
        >
          현재 시간: {(currentTimeMs / 1000).toFixed(2)}s
        </div>

        {/* 실제 자막 렌더링 레이어 */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {/* 게임 화면 느낌을 위한 레인 + 판정선 가이드 (Game.tsx의 세로형 레인 비율에 가깝게 축소) */}
          {/* 레인 영역: 가운데에 세로로 긴 4레인 박스 (가로보다 세로가 훨씬 긴 형태) */}
          <div
            style={{
              position: 'absolute',
              left: '40%',   // 전체 폭의 가운데 20%만 사용
              top: '8%',
              width: '20%',
              height: '84%', // 세로를 훨씬 길게
              background: 'rgba(15,23,42,0.45)',
              boxShadow: 'inset 0 0 0 1px rgba(148,163,184,0.18)',
            }}
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={`lane-line-${i}`}
              style={{
                position: 'absolute',
                // 레인 경계선: 40% ~ 60% 사이를 4개 레인으로 분할
                left: `${40 + i * 5}%`,
                top: '8%',
                width: 1,
                height: '84%',
                backgroundColor: 'rgba(148,163,184,0.26)',
                transform: 'translateX(-0.5px)',
              }}
            />
          ))}
          {/* 판정선: 레인 박스 안의 하단 쪽 (실제 게임 비율보다 조금 줄인 느낌) */}
          <div
            style={{
              position: 'absolute',
              left: '40%',
              width: '20%',
              top: '78%',
              height: 2,
              background:
                'linear-gradient(90deg, rgba(248,250,252,0.6), rgba(251,113,133,0.95))',
              boxShadow: '0 0 14px rgba(248,113,133,0.9)',
            }}
          />

          {activeCues.map(renderCue)}
        </div>
      </div>
    </div>
  );
};


