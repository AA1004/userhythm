import React, { useMemo, useRef } from 'react';
import { GameState, Note, Lane } from '../types/game';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { Score as ScoreComponent } from './Score';
import { NoteRenderer } from './NoteRenderer';
import { LANE_POSITIONS, JUDGE_LINE_LEFT, JUDGE_LINE_WIDTH, BASE_FALL_DURATION, NOTE_VISIBILITY_BUFFER_MS } from '../constants/gameConstants';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';

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
  const holdingNotesSet = useMemo(() => new Set(Array.from(holdingNotes.keys())), [holdingNotes]);

  // Canvas 크기 조정은 NoteRenderer에서 처리 (visible 상태 변경 시 재설정)

  // 화면에 보이는 노트만 필터링하여 렌더링 성능 최적화
  const visibleNotes = useMemo(() => {
    if (bgaMaskOpacity >= 1) return []; // 간주 구간에서는 노트 숨김
    
    const baseDuration = BASE_FALL_DURATION / speed;
    const viewportStart = gameState.currentTime - baseDuration - NOTE_VISIBILITY_BUFFER_MS;
    // 중요: viewportEnd를 baseDuration + 버퍼로 설정해야 노트가 화면 위(-100)에서 시작함
    // 기존 NOTE_VISIBILITY_BUFFER_MS만 사용하면 노트가 중간에서 시작하는 버그 발생
    const viewportEnd = gameState.currentTime + baseDuration + NOTE_VISIBILITY_BUFFER_MS;
    
    // hit된 노트와 화면 밖 노트를 빠르게 스킵
    // 노트 배열이 시간순 정렬되어 있다면 더 효율적으로 필터링 가능
    const result: typeof gameState.notes = [];
    for (const note of gameState.notes) {
      // hit된 노트는 건너뛰기
      if (note.hit) continue;
      
      // 노트가 화면에 보이는 범위인지 확인
      const noteEndTime = note.endTime || note.time;
      if (
        (note.time >= viewportStart && note.time <= viewportEnd) ||
        (noteEndTime >= viewportStart && noteEndTime <= viewportEnd) ||
        (note.time <= viewportStart && noteEndTime >= viewportEnd) // 롱노트가 화면을 가로지르는 경우
      ) {
        result.push(note);
      }
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
            holdingNotes={holdingNotesSet}
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
        keyEffects.map((effect) => (
          <div
            key={effect.id}
            className="key-hit"
            style={
              {
                left: `${effect.x}px`,
                top: `${effect.y}px`,
                // lane별 네온 컬러 (현재 테마에 맞게 시안/블루/바이올렛/핑크)
                '--hit-color':
                  (['rgba(34,211,238,1)', 'rgba(96,165,250,1)', 'rgba(167,139,250,1)', 'rgba(251,113,133,1)'] as const)[
                    effect.lane
                  ],
                '--hit-color-soft':
                  (['rgba(34,211,238,0.35)', 'rgba(96,165,250,0.30)', 'rgba(167,139,250,0.30)', 'rgba(251,113,133,0.28)'] as const)[
                    effect.lane
                  ],
              } as React.CSSProperties
            }
          >
            {/* 네온 플래시 + 링 */}
            <div className="key-hit__flash" />
            <div className="key-hit__ring key-hit__ring--outer" />
            <div className="key-hit__ring key-hit__ring--inner" />

            {/* 스파크 (가벼운 연출 + 성능 고려해 10개로 제한) */}
            {[...Array(10)].map((_, i) => {
              const angle = (i * 360) / 10;
              const radians = (angle * Math.PI) / 180;
              const distance = 54;
              const x = Math.cos(radians) * distance;
              const y = Math.sin(radians) * distance - 26; // 살짝 위로

              return (
                <div
                  key={i}
                  className="key-hit__spark"
                  style={
                    {
                      animationDelay: `${i * 0.02}s`,
                      '--end-x': `${x}px`,
                      '--end-y': `${y}px`,
                      transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </div>
        ))}

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

