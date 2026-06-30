import React, { useEffect, useRef } from 'react';
import {
  normalizeSubtitlePosition,
  SubtitleCue,
  SubtitleHorizontalAlign,
  SubtitleStyle,
  SubtitleVerticalAlign,
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

const SUBTITLE_CANVAS_DPR_LIMIT = 1;
const LINE_HEIGHT = 1.22;

const hexToRgba = (hex: string, opacity: number): string => {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000';
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
};

const getHorizontalOffset = (
  horizontal: SubtitleHorizontalAlign,
  width: number
) => {
  if (horizontal === 'left') return 0;
  if (horizontal === 'right') return -width;
  return -width / 2;
};

const getVerticalOffset = (
  vertical: SubtitleVerticalAlign,
  height: number
) => {
  if (vertical === 'top') return 0;
  if (vertical === 'bottom') return -height;
  return -height / 2;
};

const getTextAlignOffset = (
  textAlign: SubtitleHorizontalAlign,
  width: number,
  paddingX: number
) => {
  if (textAlign === 'left') return paddingX;
  if (textAlign === 'right') return width - paddingX;
  return width / 2;
};

const wrapLine = (
  ctx: CanvasRenderingContext2D,
  line: string,
  maxWidth: number
) => {
  if (!line) return [''];
  if (ctx.measureText(line).width <= maxWidth) return [line];

  const wrapped: string[] = [];
  let current = '';
  for (const char of line) {
    const next = current + char;
    if (current && ctx.measureText(next).width > maxWidth) {
      wrapped.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) wrapped.push(current);
  return wrapped;
};

const drawSubtitleCue = (
  ctx: CanvasRenderingContext2D,
  cue: SubtitleCue,
  opacity: number,
  subtitleArea: SubtitleArea,
  performanceMode: PerformanceMode
) => {
  if (opacity <= 0) return;

  const style: SubtitleStyle = cue.style || ({} as SubtitleStyle);
  const pos = normalizeSubtitlePosition(style.position);
  const sizeScale = Math.max(0.1, subtitleArea.height / GAME_VIEW_HEIGHT);
  const fontSize = (style.fontSize ?? 24) * sizeScale;
  const fontFamily = style.fontFamily ?? 'Noto Sans KR, sans-serif';
  const fontWeight = style.fontWeight ?? 'normal';
  const fontStyle = style.fontStyle ?? 'normal';
  const textAlign = style.textAlign ?? 'center';
  const horizontal = style.align?.horizontal ?? 'center';
  const vertical = style.align?.vertical ?? 'middle';
  const showBackground = style.showBackground !== false;
  const paddingX = showBackground ? 14 * sizeScale : 0;
  const paddingY = showBackground ? 6 * sizeScale : 0;
  const lineHeight = fontSize * LINE_HEIGHT;

  ctx.save();
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  const safeMargin = Math.max(8, 16 * sizeScale);
  const maxTextWidth = Math.max(1, subtitleArea.width - safeMargin * 2 - paddingX * 2);
  const lines = cue.text
    .split('\n')
    .flatMap((line) => wrapLine(ctx, line, maxTextWidth));
  const measuredWidth = Math.max(
    1,
    ...lines.map((line) => ctx.measureText(line || ' ').width)
  );
  const boxWidth = measuredWidth + paddingX * 2;
  const boxHeight = lines.length * lineHeight + paddingY * 2;
  const anchorX = pos.x * subtitleArea.width;
  const anchorY = pos.y * subtitleArea.height;
  const boxLeft = getHorizontalOffset(horizontal, boxWidth);
  const boxTop = getVerticalOffset(vertical, boxHeight);
  const textX = boxLeft + getTextAlignOffset(textAlign, boxWidth, paddingX);
  const firstLineY = boxTop + paddingY + lineHeight / 2;

  ctx.translate(anchorX, anchorY);
  if (style.rotationDeg) {
    ctx.rotate((style.rotationDeg * Math.PI) / 180);
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

  if (showBackground) {
    const bgOpacity = style.backgroundOpacity ?? 0.9;
    const bgColor = style.backgroundColor ?? '#000000';
    ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
    if (performanceMode === 'quality') {
      ctx.shadowColor = 'rgba(0,0,0,0.42)';
      ctx.shadowBlur = 8 * sizeScale;
    }
    drawRoundedRect(ctx, boxLeft, boxTop, boxWidth, boxHeight, 8 * sizeScale);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (style.outlineColor) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = Math.max(1, sizeScale);
      ctx.stroke();
    }
  }

  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.color ?? '#ffffff';
  if (!showBackground && performanceMode === 'quality') {
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8 * sizeScale;
    ctx.shadowOffsetY = 2 * sizeScale;
  }
  lines.forEach((line, index) => {
    ctx.fillText(line, textX, firstLineY + index * lineHeight);
  });
  ctx.restore();
};

export const LyricOverlay: React.FC<LyricOverlayProps> = ({
  activeSubtitles,
  subtitleArea,
  performanceMode = 'quality',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const width = Math.max(1, subtitleArea.width);
    const height = Math.max(1, subtitleArea.height);
    const dpr = Math.min(window.devicePixelRatio || 1, SUBTITLE_CANVAS_DPR_LIMIT);
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    for (const { cue, opacity } of activeSubtitles) {
      drawSubtitleCue(ctx, cue, opacity, subtitleArea, performanceMode);
    }
  }, [
    activeSubtitles,
    subtitleArea.left,
    subtitleArea.top,
    subtitleArea.width,
    subtitleArea.height,
    performanceMode,
  ]);

  if (!activeSubtitles.length) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
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
    />
  );
};
