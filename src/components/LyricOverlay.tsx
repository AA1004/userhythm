import React, { useMemo } from 'react';
import {
  getSubtitleAnchorTransform,
  normalizeSubtitlePosition,
  SubtitleCue,
  SubtitleStyle,
} from '../types/subtitle';
import { GAME_VIEW_HEIGHT } from '../constants/gameLayout';
import { PerformanceMode } from '../constants/gameVisualSettings';

type ActiveSubtitle = {
  cue: SubtitleCue;
  opacity: number;
};

type SubtitleArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type LyricOverlayProps = {
  activeSubtitles: ActiveSubtitle[];
  subtitleArea: SubtitleArea;
  performanceMode?: PerformanceMode;
};

type LyricCueProps = {
  cue: SubtitleCue;
  opacity: number;
  subtitleArea: SubtitleArea;
  performanceMode: PerformanceMode;
};

const hexToRgba = (hex: string, opacity: number): string => {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000';
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const LyricCue = React.memo<LyricCueProps>(
  ({ cue, opacity, subtitleArea, performanceMode }) => {
    const rendered = useMemo(() => {
      const style: SubtitleStyle = cue.style || ({} as SubtitleStyle);
      const lightweight = performanceMode === 'performance';
      const pos = normalizeSubtitlePosition(style.position);
      const sizeScale = Math.max(0.1, subtitleArea.height / GAME_VIEW_HEIGHT);
      const safeMargin = Math.max(8, 16 * sizeScale);

      const transformParts: string[] = [getSubtitleAnchorTransform(style.align)];
      if (style.rotationDeg) {
        transformParts.push(`rotate(${style.rotationDeg}deg)`);
      }

      const textAlign = style.textAlign ?? 'center';
      const showBackground = style.showBackground !== false;
      const bgOpacity = style.backgroundOpacity ?? 0.9;
      const bgColor = style.backgroundColor ?? '#000000';
      const backgroundColor = showBackground
        ? hexToRgba(bgColor, bgOpacity)
        : 'transparent';

      const lines = cue.text.split('\n');

      return {
        lines,
        style: {
          position: 'absolute' as const,
          left: `${pos.x * 100}%`,
          top: `${pos.y * 100}%`,
          transform: transformParts.join(' '),
          transformOrigin: '50% 50%',
          padding: showBackground ? `${6 * sizeScale}px ${14 * sizeScale}px` : 0,
          borderRadius: showBackground ? 8 * sizeScale : 0,
          backgroundColor,
          color: style.color ?? '#ffffff',
          fontFamily: style.fontFamily ?? 'Noto Sans KR, sans-serif',
          fontSize: (style.fontSize ?? 24) * sizeScale,
          fontWeight: style.fontWeight ?? 'normal',
          fontStyle: style.fontStyle ?? 'normal',
          textAlign,
          lineHeight: 1.22,
          whiteSpace: 'pre-wrap' as const,
          overflowWrap: 'break-word' as const,
          wordBreak: 'keep-all' as const,
          width: 'max-content',
          maxWidth: `calc(100% - ${safeMargin * 2}px)`,
          boxSizing: 'border-box' as const,
          pointerEvents: 'none' as const,
          willChange: 'transform, opacity',
          boxShadow: showBackground && !lightweight
            ? `0 ${10 * sizeScale}px ${30 * sizeScale}px rgba(0,0,0,0.9), 0 0 ${18 * sizeScale}px rgba(15,23,42,0.9)`
            : 'none',
          border:
            showBackground && style.outlineColor
              ? `1px solid ${style.outlineColor}`
              : 'none',
          textShadow: !showBackground && !lightweight
            ? `0 0 ${8 * sizeScale}px rgba(0,0,0,0.9), 0 ${2 * sizeScale}px ${4 * sizeScale}px rgba(0,0,0,0.8), 0 0 ${20 * sizeScale}px rgba(0,0,0,0.6)`
            : 'none',
        },
      };
    }, [cue, subtitleArea.left, subtitleArea.top, subtitleArea.width, subtitleArea.height, performanceMode]);

    return (
      <div
        style={{
          ...rendered.style,
          opacity,
        }}
      >
        {rendered.lines.map((line, idx, arr) => (
          <React.Fragment key={idx}>
            {line}
            {idx < arr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </div>
    );
  },
  (prev, next) =>
    prev.cue === next.cue &&
    prev.opacity === next.opacity &&
    prev.performanceMode === next.performanceMode &&
    prev.subtitleArea.left === next.subtitleArea.left &&
    prev.subtitleArea.top === next.subtitleArea.top &&
    prev.subtitleArea.width === next.subtitleArea.width &&
    prev.subtitleArea.height === next.subtitleArea.height
);

export const LyricOverlay: React.FC<LyricOverlayProps> = ({
  activeSubtitles,
  subtitleArea,
  performanceMode = 'balanced',
}) => {
  if (!activeSubtitles.length) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: subtitleArea.left,
        top: subtitleArea.top,
        width: subtitleArea.width,
        height: subtitleArea.height,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 300,
        contain: 'layout paint style',
      }}
    >
      {activeSubtitles.map(({ cue, opacity }) => (
        <LyricCue
          key={cue.id}
          cue={cue}
          opacity={opacity}
          subtitleArea={subtitleArea}
          performanceMode={performanceMode}
        />
      ))}
    </div>
  );
};
