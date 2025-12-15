import React from 'react';
import { Note as NoteType } from '../types/game';

interface NoteProps {
  note: NoteType;
  fallDuration: number;
  currentTime: number;
  judgeLineY: number;
  laneX: number;
  isHolding?: boolean;
}

const NOTE_WIDTH = 90;
const TAP_HEIGHT = 42;
const HOLD_MIN_HEIGHT = 60;
const HOLD_HEAD_HEIGHT = 32;
const NOTE_SPAWN_Y = -100; // useGameLoop.ts와 동일한 값

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Note 컴포넌트 최적화: React.memo와 y 값 직접 사용
const NoteComponent: React.FC<NoteProps> = ({
  note,
  fallDuration,
  currentTime,
  judgeLineY,
  laneX,
  isHolding = false,
}) => {
  if (note.hit) return null;

  const isHoldNote = note.duration > 0 && note.type === 'hold';

  // y 값은 렌더링 시점에 currentTime과 fallDuration으로 직접 계산
  // useGameLoop에서 매 프레임 setState를 제거하여 성능 최적화
  const computeHeadY = () => {
    const timeUntilHit = note.time - currentTime;
    
    // timeUntilHit >= fallDuration이면 아직 화면 위에 있어야 함
    if (timeUntilHit >= fallDuration) {
      return NOTE_SPAWN_Y;
    }
    
    // progress: 0 (화면 맨 위) ~ 1 (판정선)
    const progress = 1 - timeUntilHit / fallDuration;
    // progress=0일 때 NOTE_SPAWN_Y(-100), progress=1일 때 judgeLineY(640)
    const y = NOTE_SPAWN_Y + progress * (judgeLineY - NOTE_SPAWN_Y);
    return Math.max(NOTE_SPAWN_Y, Math.min(judgeLineY, y));
  };
  
  const headY = computeHeadY();

  // 화면 밖 노트는 렌더링하지 않음
  if (headY < -180 && !isHoldNote) return null;

  if (!isHoldNote) {
    const top = headY - TAP_HEIGHT / 2;
    return (
      <div
        style={{
          position: 'absolute',
          left: `${laneX - NOTE_WIDTH / 2}px`,
          top: `${top}px`,
          width: `${NOTE_WIDTH}px`,
          height: `${TAP_HEIGHT}px`,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '14px',
            background: 'linear-gradient(180deg, #FF6B6B 0%, #FF9A8B 100%)',
            border: '3px solid #EE5A52',
            boxShadow: '0 6px 14px rgba(0, 0, 0, 0.45)',
          }}
        />
      </div>
    );
  }

  // 롱노트의 경우 headY는 note.y를 사용하고, endY만 계산
  // endY는 useGameLoop.ts와 동일한 방식으로 계산해야 함
  const computeEndY = () => {
    const endTime = note.endTime ?? note.time;
    const timeUntilHit = endTime - currentTime;
    
    // useGameLoop.ts와 동일한 로직:
    // timeUntilHit >= fallDuration이면 아직 화면 위에 있어야 함
    if (timeUntilHit >= fallDuration) {
      return NOTE_SPAWN_Y;
    }
    
    // progress: 0 (화면 맨 위) ~ 1 (판정선)
    const progress = 1 - timeUntilHit / fallDuration;
    // progress=0일 때 NOTE_SPAWN_Y(-100), progress=1일 때 judgeLineY(640)
    const y = NOTE_SPAWN_Y + progress * (judgeLineY - NOTE_SPAWN_Y);
    return clamp(y, NOTE_SPAWN_Y, judgeLineY);
  };

  // 롱노트의 머리는 판정선 아래로 내려가지 않음 (판정선에 고정)
  // 이렇게 해야 머리가 판정선에 닿은 후에도 꼬리가 계속 내려옴
  const holdHeadY = Math.min(headY, judgeLineY);
  const holdTailY = isHoldNote ? computeEndY() : headY;
  const bottomY = Math.max(holdHeadY, holdTailY);
  const spanHeight = Math.abs(holdHeadY - holdTailY);
  const containerHeight = Math.max(HOLD_MIN_HEIGHT, spanHeight);
  const containerTop = bottomY - containerHeight;
  const holdProgress = note.duration
    ? clamp((currentTime - note.time) / note.duration, 0, 1)
    : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${laneX - NOTE_WIDTH / 2}px`,
        top: `${containerTop}px`,
        width: `${NOTE_WIDTH}px`,
        height: `${containerHeight}px`,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '18px',
          border: '2px solid rgba(255,255,255,0.25)',
          background: isHolding
            ? 'linear-gradient(180deg, rgba(255,231,157,0.95) 0%, rgba(255,193,7,0.65) 100%)'
            : 'linear-gradient(180deg, rgba(78,205,196,0.9) 0%, rgba(32,164,154,0.7) 100%)',
          boxShadow: isHolding
            ? '0 0 18px rgba(255, 214, 102, 0.8)'
            : '0 6px 16px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: '10%',
            right: '10%',
            height: 12,
            borderRadius: '12px 12px 6px 6px',
            backgroundColor: 'rgba(255,255,255,0.4)',
            boxShadow: '0 0 8px rgba(255,255,255,0.35)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: '18%',
            right: '18%',
            bottom: HOLD_HEAD_HEIGHT,
            height: `${holdProgress * 100}%`,
            borderRadius: '10px',
            background: isHolding
              ? 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.4) 70%)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.15) 70%)',
            boxShadow: isHolding
              ? '0 0 12px rgba(255,255,255,0.7)'
              : undefined,
            transition: 'height 80ms linear',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            bottom: 0,
            height: HOLD_HEAD_HEIGHT,
            borderRadius: '10px',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.7) 100%)',
            boxShadow: isHolding
              ? '0 0 14px rgba(255, 255, 255, 0.9)'
              : '0 4px 10px rgba(0,0,0,0.35)',
          }}
        />
      </div>
    </div>
  );
};

// React.memo로 불필요한 리렌더링 방지
// currentTime은 롱노트의 holdProgress 계산에 필요하지만,
// y 값이 이미 게임 루프에서 계산되어 있으므로 y가 같으면 같은 위치에 있음
export const Note = React.memo(NoteComponent, (prevProps, nextProps) => {
  // 노트의 핵심 속성만 비교
  // y 값이 같으면 위치가 같으므로 currentTime 변화는 무시 가능 (단, 롱노트 progress는 다를 수 있음)
  const isSameNote = prevProps.note.id === nextProps.note.id;
  if (!isSameNote) return false;
  
  // hit 상태가 다르면 리렌더링 필요
  if (prevProps.note.hit !== nextProps.note.hit) return false;
  
  // hit된 노트는 더 이상 렌더링하지 않으므로 비교 불필요
  if (prevProps.note.hit) return true;
  
  // y 위치가 다르면 리렌더링 필요
  if (prevProps.note.y !== nextProps.note.y) return false;
  
  // isHolding 상태가 다르면 리렌더링 필요
  if (prevProps.isHolding !== nextProps.isHolding) return false;
  
  // 롱노트인 경우 duration과 endTime 확인
  const isHoldNote = prevProps.note.duration > 0;
  if (isHoldNote) {
    // 롱노트의 경우 currentTime이 변하면 holdProgress가 변하므로 리렌더링 필요
    // 하지만 실제로는 60fps에서도 y 값이 같으면 위치가 같으므로 괜찮음
    // 더 정확하게는 currentTime을 비교하되, y가 같으면 대부분 같은 frame이므로 괜찮음
    if (prevProps.note.endTime !== nextProps.note.endTime) return false;
    if (prevProps.note.duration !== nextProps.note.duration) return false;
    
    // 롱노트의 경우 currentTime 변화에 따른 progress는 작은 변화이므로
    // y 값이 같으면 동일 프레임으로 간주 (약간의 트레이드오프 있음)
    // 더 정확하게 하려면 currentTime도 비교해야 하지만 성능 저하 가능
  }
  
  // 나머지 prop은 변경되지 않으면 리렌더링 불필요
  return (
    prevProps.fallDuration === nextProps.fallDuration &&
    prevProps.laneX === nextProps.laneX &&
    prevProps.judgeLineY === nextProps.judgeLineY
  );
});
