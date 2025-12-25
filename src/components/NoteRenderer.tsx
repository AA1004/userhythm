import React, { useEffect, useRef } from 'react';
import { Note } from '../types/game';
import { LANE_POSITIONS, JUDGE_LINE_Y } from '../constants/gameConstants';

const NOTE_WIDTH = 90;
const TAP_HEIGHT = 42;
const HOLD_MIN_HEIGHT = 60;
const HOLD_HEAD_HEIGHT = 32;
const NOTE_SPAWN_Y = -100;


interface NoteRendererProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  notes: Note[];
  currentTimeRef: React.MutableRefObject<number>;
  fallDuration: number;
  holdingNotes: Map<number, Note>;  // Set 대신 Map 직접 사용 (성능 최적화)
  visible: boolean;
}

/**
 * Canvas 기반 노트 렌더러
 * 별도의 rAF 루프에서 실행되어 165Hz에서도 부드럽게 렌더링
 */
export const NoteRenderer: React.FC<NoteRendererProps> = ({
  canvasRef,
  notes,
  currentTimeRef,
  fallDuration,
  holdingNotes,
  visible,
}) => {
  const rafIdRef = useRef<number>();

  useEffect(() => {
    if (!visible || !canvasRef.current) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = undefined;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas 크기 조정 (devicePixelRatio 고려)
    // visible이 true가 될 때마다 (간주 구간 후 복귀 시) 재설정
    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // 실제 크기 (물리적 픽셀)
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      // 스케일 리셋 후 재적용
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    setupCanvas();

    // 논리적 크기 (CSS 픽셀) 저장
    const logicalWidth = canvas.getBoundingClientRect().width;
    const logicalHeight = canvas.getBoundingClientRect().height;

    const render = () => {
      if (!visible || !canvasRef.current) return;

      const currentTime = currentTimeRef.current;
      
      // Canvas 클리어 (논리적 크기 기준)
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);

      // 노트 렌더링
      for (const note of notes) {
        if (note.hit) continue;

        const isHoldNote = note.duration > 0 && note.type === 'hold';
        const laneX = LANE_POSITIONS[note.lane];

        // 머리 위치 계산
        const timeUntilHit = note.time - currentTime;
        let headY: number;
        
        if (timeUntilHit >= fallDuration) {
          headY = NOTE_SPAWN_Y;
        } else {
          const progress = 1 - timeUntilHit / fallDuration;
          headY = NOTE_SPAWN_Y + progress * (JUDGE_LINE_Y - NOTE_SPAWN_Y);
          headY = Math.max(NOTE_SPAWN_Y, Math.min(JUDGE_LINE_Y, headY));
        }

        // 화면 밖 노트는 스킵
        if (headY < -180 && !isHoldNote) continue;

        if (!isHoldNote) {
          // 탭 노트 렌더링
          const top = headY - TAP_HEIGHT / 2;
          const left = laneX - NOTE_WIDTH / 2;

          // 그라디언트
          const gradient = ctx.createLinearGradient(left, top, left, top + TAP_HEIGHT);
          gradient.addColorStop(0, '#FF6B6B');
          gradient.addColorStop(1, '#FF9A8B');

          ctx.fillStyle = gradient;
          ctx.strokeStyle = '#EE5A52';
          ctx.lineWidth = 3;
          ctx.beginPath();
          const radius = 14;
          ctx.moveTo(left + radius, top);
          ctx.lineTo(left + NOTE_WIDTH - radius, top);
          ctx.quadraticCurveTo(left + NOTE_WIDTH, top, left + NOTE_WIDTH, top + radius);
          ctx.lineTo(left + NOTE_WIDTH, top + TAP_HEIGHT - radius);
          ctx.quadraticCurveTo(left + NOTE_WIDTH, top + TAP_HEIGHT, left + NOTE_WIDTH - radius, top + TAP_HEIGHT);
          ctx.lineTo(left + radius, top + TAP_HEIGHT);
          ctx.quadraticCurveTo(left, top + TAP_HEIGHT, left, top + TAP_HEIGHT - radius);
          ctx.lineTo(left, top + radius);
          ctx.quadraticCurveTo(left, top, left + radius, top);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // 롱노트 렌더링
          const endTime = note.endTime ?? note.time;
          const timeUntilEnd = endTime - currentTime;
          
          let tailY: number;
          if (timeUntilEnd >= fallDuration) {
            tailY = NOTE_SPAWN_Y;
          } else {
            const progress = 1 - timeUntilEnd / fallDuration;
            tailY = NOTE_SPAWN_Y + progress * (JUDGE_LINE_Y - NOTE_SPAWN_Y);
            tailY = Math.max(NOTE_SPAWN_Y, Math.min(JUDGE_LINE_Y, tailY));
          }

          const holdHeadY = Math.min(headY, JUDGE_LINE_Y);
          const holdTailY = tailY;
          const bottomY = Math.max(holdHeadY, holdTailY);
          const spanHeight = Math.abs(holdHeadY - holdTailY);
          const containerHeight = Math.max(HOLD_MIN_HEIGHT, spanHeight);
          const containerTop = bottomY - containerHeight;
          const left = laneX - NOTE_WIDTH / 2;

          const isHolding = holdingNotes.has(note.id);
          const holdProgress = note.duration
            ? Math.max(0, Math.min(1, (currentTime - note.time) / note.duration))
            : 0;

          // 롱노트 배경
          const bgGradient = ctx.createLinearGradient(left, containerTop, left, containerTop + containerHeight);
          if (isHolding) {
            bgGradient.addColorStop(0, 'rgba(255,231,157,0.95)');
            bgGradient.addColorStop(1, 'rgba(255,193,7,0.65)');
          } else {
            bgGradient.addColorStop(0, 'rgba(78,205,196,0.9)');
            bgGradient.addColorStop(1, 'rgba(32,164,154,0.7)');
          }

          ctx.fillStyle = bgGradient;
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const radius = 18;
          ctx.moveTo(left + radius, containerTop);
          ctx.lineTo(left + NOTE_WIDTH - radius, containerTop);
          ctx.quadraticCurveTo(left + NOTE_WIDTH, containerTop, left + NOTE_WIDTH, containerTop + radius);
          ctx.lineTo(left + NOTE_WIDTH, containerTop + containerHeight - radius);
          ctx.quadraticCurveTo(left + NOTE_WIDTH, containerTop + containerHeight, left + NOTE_WIDTH - radius, containerTop + containerHeight);
          ctx.lineTo(left + radius, containerTop + containerHeight);
          ctx.quadraticCurveTo(left, containerTop + containerHeight, left, containerTop + containerHeight - radius);
          ctx.lineTo(left, containerTop + radius);
          ctx.quadraticCurveTo(left, containerTop, left + radius, containerTop);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // 상단 하이라이트
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath();
          const highlightRadius = 12;
          const highlightLeft = left + NOTE_WIDTH * 0.1;
          const highlightTop = containerTop + 4;
          const highlightWidth = NOTE_WIDTH * 0.8;
          const highlightHeight = 12;
          ctx.moveTo(highlightLeft + highlightRadius, highlightTop);
          ctx.lineTo(highlightLeft + highlightWidth - highlightRadius, highlightTop);
          ctx.quadraticCurveTo(highlightLeft + highlightWidth, highlightTop, highlightLeft + highlightWidth, highlightTop + highlightRadius);
          ctx.lineTo(highlightLeft + highlightWidth, highlightTop + highlightHeight - highlightRadius);
          ctx.quadraticCurveTo(highlightLeft + highlightWidth, highlightTop + highlightHeight, highlightLeft + highlightWidth - highlightRadius, highlightTop + highlightHeight);
          ctx.lineTo(highlightLeft + highlightRadius, highlightTop + highlightHeight);
          ctx.quadraticCurveTo(highlightLeft, highlightTop + highlightHeight, highlightLeft, highlightTop + highlightHeight - highlightRadius);
          ctx.lineTo(highlightLeft, highlightTop + highlightRadius);
          ctx.quadraticCurveTo(highlightLeft, highlightTop, highlightLeft + highlightRadius, highlightTop);
          ctx.closePath();
          ctx.fill();

          // 진행도 표시
          if (holdProgress > 0) {
            const progressHeight = (containerHeight - HOLD_HEAD_HEIGHT) * holdProgress;
            const progressGradient = ctx.createLinearGradient(
              left + NOTE_WIDTH * 0.18,
              containerTop + containerHeight - HOLD_HEAD_HEIGHT - progressHeight,
              left + NOTE_WIDTH * 0.18,
              containerTop + containerHeight - HOLD_HEAD_HEIGHT
            );
            if (isHolding) {
              progressGradient.addColorStop(0, 'rgba(255,255,255,0.85)');
              progressGradient.addColorStop(0.7, 'rgba(255,255,255,0.4)');
            } else {
              progressGradient.addColorStop(0, 'rgba(255,255,255,0.35)');
              progressGradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
            }
            ctx.fillStyle = progressGradient;
            ctx.beginPath();
            const progressRadius = 10;
            const progressLeft = left + NOTE_WIDTH * 0.18;
            const progressTop = containerTop + containerHeight - HOLD_HEAD_HEIGHT - progressHeight;
            const progressWidth = NOTE_WIDTH * 0.64;
            ctx.moveTo(progressLeft + progressRadius, progressTop);
            ctx.lineTo(progressLeft + progressWidth - progressRadius, progressTop);
            ctx.quadraticCurveTo(progressLeft + progressWidth, progressTop, progressLeft + progressWidth, progressTop + progressRadius);
            ctx.lineTo(progressLeft + progressWidth, progressTop + progressHeight - progressRadius);
            ctx.quadraticCurveTo(progressLeft + progressWidth, progressTop + progressHeight, progressLeft + progressWidth - progressRadius, progressTop + progressHeight);
            ctx.lineTo(progressLeft + progressRadius, progressTop + progressHeight);
            ctx.quadraticCurveTo(progressLeft, progressTop + progressHeight, progressLeft, progressTop + progressHeight - progressRadius);
            ctx.lineTo(progressLeft, progressTop + progressRadius);
            ctx.quadraticCurveTo(progressLeft, progressTop, progressLeft + progressRadius, progressTop);
            ctx.closePath();
            ctx.fill();
          }

          // 하단 헤드
          const headGradient = ctx.createLinearGradient(
            left + 6,
            containerTop + containerHeight - HOLD_HEAD_HEIGHT,
            left + 6,
            containerTop + containerHeight
          );
          headGradient.addColorStop(0, 'rgba(255,255,255,0.95)');
          headGradient.addColorStop(1, 'rgba(255,255,255,0.7)');
          ctx.fillStyle = headGradient;
          ctx.beginPath();
          const headRadius = 10;
          const headLeft = left + 6;
          const headTop = containerTop + containerHeight - HOLD_HEAD_HEIGHT;
          const headWidth = NOTE_WIDTH - 12;
          ctx.moveTo(headLeft + headRadius, headTop);
          ctx.lineTo(headLeft + headWidth - headRadius, headTop);
          ctx.quadraticCurveTo(headLeft + headWidth, headTop, headLeft + headWidth, headTop + headRadius);
          ctx.lineTo(headLeft + headWidth, headTop + HOLD_HEAD_HEIGHT - headRadius);
          ctx.quadraticCurveTo(headLeft + headWidth, headTop + HOLD_HEAD_HEIGHT, headLeft + headWidth - headRadius, headTop + HOLD_HEAD_HEIGHT);
          ctx.lineTo(headLeft + headRadius, headTop + HOLD_HEAD_HEIGHT);
          ctx.quadraticCurveTo(headLeft, headTop + HOLD_HEAD_HEIGHT, headLeft, headTop + HOLD_HEAD_HEIGHT - headRadius);
          ctx.lineTo(headLeft, headTop + headRadius);
          ctx.quadraticCurveTo(headLeft, headTop, headLeft + headRadius, headTop);
          ctx.closePath();
          ctx.fill();
        }
      }

      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = undefined;
      }
    };
  }, [canvasRef, notes, currentTimeRef, fallDuration, holdingNotes, visible]);

  return null;
};

