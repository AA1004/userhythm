import React, { useCallback, useRef, useState, useEffect } from 'react';
import { SubtitleCue, SubtitleStyle } from '../../types/subtitle';
import { CHART_EDITOR_THEME } from '../ChartEditor/constants';

interface SubtitlePreviewCanvasProps {
  currentTimeMs: number;
  cues: SubtitleCue[];
  selectedCueId: string | null;
  onChangeCueStyle: (id: string, nextStyle: SubtitleStyle) => void;
}

// 프리뷰 비율: 16:9 (넓은 화면)
const PREVIEW_ASPECT_RATIO = 16 / 9;

// 게임 화면 내 레인 영역 비율 (가이드 표시용)
// 게임 화면: 500x800, 레인: 50~450px (가운데 400px)
const GAME_ASPECT_RATIO = 500 / 800; // 5:8
const LANE_AREA_LEFT_RATIO = 50 / 500;   // 0.1
const LANE_AREA_WIDTH_RATIO = 400 / 500; // 0.8
const JUDGE_LINE_Y_RATIO = 640 / 800;    // 0.8

export const SubtitlePreviewCanvas: React.FC<SubtitlePreviewCanvasProps> = ({
  currentTimeMs,
  cues,
  selectedCueId,
  onChangeCueStyle,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // 부모 컨테이너 크기 측정
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({ width: rect.width - 16, height: rect.height - 16 }); // padding 8px * 2
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

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

      // 0~1 좌표를 퍼센트로 변환
      const left = `${pos.x * 100}%`;
      const top = `${pos.y * 100}%`;

      const transform: string[] = [];

      transform.push('translate(-50%, -50%)');
      if (style.rotationDeg) {
        transform.push(`rotate(${style.rotationDeg}deg)`);
      }

      const isSelected = cue.id === selectedCueId;

      const showBackground = style.showBackground !== false;
      const bgOpacity = style.backgroundOpacity ?? 0.5;
      
      // 배경색에 투명도 적용 (rgba로 변환)
      const bgColor = style.backgroundColor ?? '#000000';
      const backgroundColor = showBackground
        ? `rgba(${parseInt(bgColor.slice(1, 3), 16)}, ${parseInt(bgColor.slice(3, 5), 16)}, ${parseInt(bgColor.slice(5, 7), 16)}, ${bgOpacity})`
        : 'transparent';

      return (
        <div
          key={cue.id}
          style={{
            position: 'absolute',
            left,
            top,
            transform: transform.join(' '),
            transformOrigin: '50% 50%',
            padding: showBackground ? '8px 16px' : 0,
            borderRadius: showBackground ? 8 : 0,
            backgroundColor: backgroundColor,
            // opacity는 배경색의 rgba에서 처리하므로 항상 1
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
              : showBackground
                ? '0 4px 12px rgba(15,23,42,0.8)'
                : 'none',
            textAlign: style.textAlign ?? 'center',
            textShadow: !showBackground
              ? '0 0 8px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.8)'
              : 'none',
            pointerEvents: 'auto',
            zIndex: 10,
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
    [onChangeCueStyle, selectedCueId]
  );

  // 부모 영역에 맞춰서 프리뷰 크기 계산 (16:9 비율 유지)
  let previewWidth = containerSize.width;
  let previewHeight = containerSize.width / PREVIEW_ASPECT_RATIO;
  
  // 높이가 부모를 넘어가면 높이 기준으로 조정
  if (previewHeight > containerSize.height) {
    previewHeight = containerSize.height;
    previewWidth = containerSize.height * PREVIEW_ASPECT_RATIO;
  }

  // 프리뷰 내에서 게임 화면 영역 계산 (가이드 표시용)
  // 프리뷰 중앙에 게임 화면 비율(5:8)의 영역을 배치
  let gameAreaHeight = previewHeight;
  let gameAreaWidth = gameAreaHeight * GAME_ASPECT_RATIO;
  
  // 게임 영역이 프리뷰 폭을 넘어가면 폭 기준으로 조정
  if (gameAreaWidth > previewWidth) {
    gameAreaWidth = previewWidth;
    gameAreaHeight = gameAreaWidth / GAME_ASPECT_RATIO;
  }
  
  const gameAreaLeft = (previewWidth - gameAreaWidth) / 2;
  const gameAreaTop = (previewHeight - gameAreaHeight) / 2;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
          width: `${previewWidth}px`,
          height: `${previewHeight}px`,
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          overflow: 'hidden',
          background: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        {/* 안내 텍스트 */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: CHART_EDITOR_THEME.textSecondary,
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          현재 시간: {(currentTimeMs / 1000).toFixed(2)}s
        </div>

        {/* 게임 화면 영역 가이드 (5:8 비율) */}
        <div
          style={{
            position: 'absolute',
            left: gameAreaLeft,
            top: gameAreaTop,
            width: gameAreaWidth,
            height: gameAreaHeight,
            border: `1px dashed ${CHART_EDITOR_THEME.borderSubtle}`,
            pointerEvents: 'none',
          }}
        >
          {/* 레인 영역 배경 */}
          <div
            style={{
              position: 'absolute',
              left: `${LANE_AREA_LEFT_RATIO * 100}%`,
              top: 0,
              width: `${LANE_AREA_WIDTH_RATIO * 100}%`,
              height: '100%',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
            }}
          />
          
          {/* 레인 경계선 */}
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={`lane-line-${i}`}
              style={{
                position: 'absolute',
                left: `${(LANE_AREA_LEFT_RATIO + (LANE_AREA_WIDTH_RATIO / 4) * i) * 100}%`,
                top: 0,
                width: 1,
                height: '100%',
                backgroundColor: 'rgba(255,255,255,0.08)',
                transform: 'translateX(-0.5px)',
              }}
            />
          ))}
          
          {/* 판정선 */}
          <div
            style={{
              position: 'absolute',
              left: `${LANE_AREA_LEFT_RATIO * 100}%`,
              width: `${LANE_AREA_WIDTH_RATIO * 100}%`,
              top: `${JUDGE_LINE_Y_RATIO * 100}%`,
              height: 2,
              background: 'linear-gradient(90deg, rgba(248,250,252,0.4), rgba(251,113,133,0.7))',
              boxShadow: '0 0 8px rgba(248,113,133,0.6)',
            }}
          />
          
          {/* 게임 화면 레이블 */}
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              fontSize: 9,
              color: CHART_EDITOR_THEME.textMuted,
              opacity: 0.6,
            }}
          >
            게임 화면
          </div>
        </div>

        {/* 자막 렌더링 레이어 (프리뷰 전체 영역) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          {activeCues.map(renderCue)}
        </div>
      </div>
    </div>
  );
};
