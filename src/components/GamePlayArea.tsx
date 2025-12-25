import React, { useMemo, useRef } from 'react';
import { GameState, Note, Lane } from '../types/game';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { Score as ScoreComponent } from './Score';
import { NoteRenderer } from './NoteRenderer';
import { LANE_POSITIONS, JUDGE_LINE_LEFT, JUDGE_LINE_WIDTH, BASE_FALL_DURATION, NOTE_VISIBILITY_BUFFER_MS } from '../constants/gameConstants';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';

// Binary search로 시간 범위 내 시작 인덱스 찾기 (노트가 time 기준 정렬되어 있다고 가정)
function binarySearchStartIndex(notes: Note[], targetTime: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    // 롱노트의 경우 endTime도 고려해야 함
    const noteEndTime = notes[mid].endTime || notes[mid].time;
    if (noteEndTime < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

// Binary search로 시간 범위 내 끝 인덱스 찾기
function binarySearchEndIndex(notes: Note[], targetTime: number, startIdx: number): number {
  let low = startIdx;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].time <= targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low - 1;
}

interface GamePlayAreaProps {
  gameState: GameState;
  gameStarted: boolean;
  bgaMaskOpacity: number;
  speed: number;
  pressedKeys: Set<Lane>;
  holdingNotes: Map<number, Note>;
  judgeFeedbacks: JudgeFeedback[];
  keyEffects: KeyEffect[];
  laneKeyLabels: string[][];
  isFromEditor: boolean;
  currentTimeRef: React.MutableRefObject<number>;
  fallDuration: number;
}

export const GamePlayArea: React.FC<GamePlayAreaProps> = ({
  gameState,
  gameStarted,
  bgaMaskOpacity,
  speed,
  pressedKeys,
  holdingNotes,
  judgeFeedbacks,
  keyEffects,
  laneKeyLabels,
  isFromEditor: _isFromEditor,
  currentTimeRef,
  fallDuration,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Canvas 크기 조정은 NoteRenderer에서 처리 (visible 상태 변경 시 재설정)

  // 화면에 보이는 노트만 필터링하여 렌더링 성능 최적화 (Binary Search 적용)
  const visibleNotes = useMemo(() => {
    if (bgaMaskOpacity >= 1) return []; // 간주 구간에서는 노트 숨김

    const notes = gameState.notes;
    if (notes.length === 0) return [];

    const baseDuration = BASE_FALL_DURATION / speed;
    const viewportStart = gameState.currentTime - baseDuration - NOTE_VISIBILITY_BUFFER_MS;
    // 중요: viewportEnd를 baseDuration + 버퍼로 설정해야 노트가 화면 위(-100)에서 시작함
    const viewportEnd = gameState.currentTime + baseDuration + NOTE_VISIBILITY_BUFFER_MS;

    // Binary search로 시작/끝 인덱스 찾기 (O(log n))
    const startIdx = binarySearchStartIndex(notes, viewportStart);
    const endIdx = binarySearchEndIndex(notes, viewportEnd, startIdx);

    // 범위 내 노트만 순회 (O(visible notes) instead of O(all notes))
    const result: Note[] = [];
    for (let i = startIdx; i <= endIdx && i < notes.length; i++) {
      const note = notes[i];
      if (note.hit) continue;
      result.push(note);
    }

    return result;
  }, [gameState.notes, gameState.currentTime, speed, bgaMaskOpacity]);

  return (
    <>
      {/* 4개 레인 영역 배경 (간주 구간에서는 숨김) */}
      {bgaMaskOpacity < 1 && (
        <div
          style={{
            position: 'absolute',
            left: '50px',
            top: '0',
            width: '400px',
            height: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.6)', // 네온 톤의 남색 계열
          }}
        />
      )}

      {/* 배경 라인 구분선 - 레인 사이 경계와 양쪽 끝 (간주 구간에서는 숨김) */}
      {bgaMaskOpacity < 1 &&
        [50, 150, 250, 350, 450].map((x) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: '0',
              width: '2px',
              height: '100%',
              backgroundColor: 'rgba(255,255,255,0.1)',
              transform: 'translateX(-50%)',
            }}
          />
        ))}

      {/* Canvas 기반 노트 렌더링 (165Hz 최적화) */}
      {bgaMaskOpacity < 1 && (
        <>
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 100,
            }}
          />
          <NoteRenderer
            canvasRef={canvasRef}
            notes={visibleNotes}
            currentTimeRef={currentTimeRef}
            fallDuration={fallDuration}
            holdingNotes={holdingNotes}
            visible={bgaMaskOpacity < 1}
          />
        </>
      )}

      {/* 판정선 - 게임 중에만 표시 (간주 구간에서는 숨김) */}
      {gameStarted && bgaMaskOpacity < 1 && (
        <JudgeLine left={JUDGE_LINE_LEFT} width={JUDGE_LINE_WIDTH} />
      )}

      {/* 4개 레인 - 게임 중에만 표시 (간주 구간에서는 숨김) */}
      {/* 간주 구간(bgaMaskOpacity >= 1)에서는 KeyLane을 완전히 숨김 */}
      {gameStarted && bgaMaskOpacity < 1 && (
        LANE_POSITIONS.map((x, index) => (
          <KeyLane
            key={index}
            x={x}
            keys={laneKeyLabels[index]}
            isPressed={pressedKeys.has(index as Lane)}
          />
        ))
      )}

      {/* 판정선에 나오는 이펙트 - 노트가 있는 위치에서 (간주 구간에서는 숨김) */}
      {gameStarted &&
        bgaMaskOpacity < 1 &&
        keyEffects.map((effect) => {
          // 판정별 색상
          const judgeColors = {
            perfect: { main: '#FFD700', soft: 'rgba(255, 215, 0, 0.4)' },
            great: { main: '#00FF00', soft: 'rgba(0, 255, 0, 0.4)' },
            good: { main: '#00BFFF', soft: 'rgba(0, 191, 255, 0.4)' },
            miss: { main: '#FF4500', soft: 'rgba(255, 69, 0, 0.4)' },
          };
          const colors = judgeColors[effect.judge];

          return (
            <div
              key={effect.id}
              className="key-hit"
              style={
                {
                  left: `${effect.x}px`,
                  top: `${effect.y}px`,
                  '--hit-color': colors.main,
                  '--hit-color-soft': colors.soft,
                } as React.CSSProperties
              }
            >
              {/* 십자가(X) 느낌: 천천히 커지며 살짝 회전했다가 훅 사라짐 */}
              <div className="key-hit__cross" />
            </div>
          );
        })}

      {/* 간주 구간 오버레이 (채보 레인 숨김) */}
      {/* 간주 구간에서는 모든 레인 UI를 완전히 가림 */}
      <div
        style={{
          position: 'absolute',
          left: '50px',
          top: 0,
          width: '400px',
          height: '100%',
          backgroundColor: 'rgba(8,12,24,0.94)',
          opacity: bgaMaskOpacity,
          transition: 'opacity 80ms linear',
          pointerEvents: 'none',
          zIndex: 1000, // 모든 레인 UI 위에 표시 (KeyLane, 판정선, 노트 등)
        }}
      />

      {/* 판정 피드백 - 4개 레인 영역 중앙에 통합 표시 (개별 애니메이션) */}
      {/* 간주 구간에서는 판정 피드백 숨김 */}
      {bgaMaskOpacity < 1 &&
        judgeFeedbacks.map((feedback) =>
          feedback.judge ? (
            <div
              key={feedback.id}
              style={{
                position: 'absolute',
                left: '50%',
                top: '500px',
                transform: 'translateX(-50%)',
                fontSize: '48px',
                fontWeight: 'bold',
                color:
                  feedback.judge === 'perfect'
                    ? '#FFD700'
                    : feedback.judge === 'great'
                    ? '#00FF00'
                    : feedback.judge === 'good'
                    ? '#00BFFF'
                    : '#FF4500',
                textShadow: '0 0 20px rgba(255,255,255,0.9), 0 0 40px currentColor',
                animation: 'judgePopUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                zIndex: 1000 + feedback.id,
                pointerEvents: 'none',
              }}
            >
              {feedback.judge.toUpperCase()}
            </div>
          ) : null
        )}

      {/* 점수 - 게임 중에만 표시 (간주 구간에서는 숨김) */}
      {gameStarted && bgaMaskOpacity < 1 && <ScoreComponent score={gameState.score} />}

    </>
  );
};

