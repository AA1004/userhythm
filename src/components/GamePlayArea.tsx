import React from 'react';
import { GameState, Note, Lane, SpeedChange, BgaVisibilityInterval } from '../types/game';
import { Note as NoteComponent } from './Note';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { Score as ScoreComponent } from './Score';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { LANE_POSITIONS, JUDGE_LINE_LEFT, JUDGE_LINE_WIDTH, JUDGE_LINE_Y, BASE_FALL_DURATION } from '../constants/gameConstants';
import { getNoteFallDuration } from '../utils/speedChange';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';

interface GamePlayAreaProps {
  gameState: GameState;
  gameStarted: boolean;
  bgaMaskOpacity: number;
  speed: number;
  baseBpm: number;
  speedChanges: SpeedChange[];
  pressedKeys: Set<Lane>;
  holdingNotes: Map<number, Note>;
  judgeFeedbacks: JudgeFeedback[];
  keyEffects: KeyEffect[];
  laneKeyLabels: string[][];
  isTestMode: boolean;
  isFromEditor: boolean;
  onExit: () => void;
}

export const GamePlayArea: React.FC<GamePlayAreaProps> = ({
  gameState,
  gameStarted,
  bgaMaskOpacity,
  speed,
  baseBpm,
  speedChanges,
  pressedKeys,
  holdingNotes,
  judgeFeedbacks,
  keyEffects,
  laneKeyLabels,
  isTestMode,
  isFromEditor,
  onExit,
}) => {
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

      {/* 노트 렌더링 (간주 구간에서는 숨김) */}
      {bgaMaskOpacity < 1 &&
        gameState.notes.map((note) => {
          const baseDuration = BASE_FALL_DURATION / speed;
          const fallDuration = getNoteFallDuration(
            note.time,
            gameState.currentTime,
            baseBpm,
            speedChanges,
            baseDuration
          );

          return (
            <NoteComponent
              key={`${note.id}-${note.time}-${note.lane}`}
              note={note}
              fallDuration={fallDuration}
              currentTime={gameState.currentTime}
              judgeLineY={JUDGE_LINE_Y}
              laneX={LANE_POSITIONS[note.lane]}
              isHolding={holdingNotes.has(note.id)}
            />
          );
        })}

      {/* 판정선 - 게임 중에만 표시 (간주 구간에서는 숨김) */}
      {gameStarted && bgaMaskOpacity < 1 && (
        <JudgeLine left={JUDGE_LINE_LEFT} width={JUDGE_LINE_WIDTH} />
      )}

      {/* 4개 레인 - 게임 중에만 표시 (간주 구간에서는 숨김) */}
      {gameStarted &&
        bgaMaskOpacity < 1 &&
        LANE_POSITIONS.map((x, index) => (
          <KeyLane
            key={index}
            x={x}
            keys={laneKeyLabels[index]}
            isPressed={pressedKeys.has(index as Lane)}
          />
        ))}

      {/* 판정선에 나오는 이펙트 - 노트가 있는 위치에서 (간주 구간에서는 숨김) */}
      {gameStarted &&
        bgaMaskOpacity < 1 &&
        keyEffects.map((effect) => (
          <div
            key={effect.id}
            style={{
              position: 'absolute',
              left: `${effect.x}px`,
              top: `${effect.y}px`,
              transform: 'translate(-50%, -50%)',
              width: '120px',
              height: '120px',
              pointerEvents: 'none',
              zIndex: 500,
            }}
          >
            {/* 파티클 이펙트 */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%',
                height: '100%',
                animation: 'keyEffectRipple 0.6s ease-out forwards',
                borderRadius: '50%',
                border: '3px solid rgba(255, 255, 255, 0.8)',
                boxShadow: '0 0 20px rgba(255, 255, 255, 0.6), 0 0 40px rgba(255, 255, 255, 0.4)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '80%',
                height: '80%',
                animation: 'keyEffectRipple 0.6s 0.1s ease-out forwards',
                borderRadius: '50%',
                border: '2px solid rgba(255, 255, 255, 0.6)',
                boxShadow: '0 0 15px rgba(255, 255, 255, 0.5)',
              }}
            />
            {/* 사방으로 날아가는 파티클 */}
            {[...Array(8)].map((_, i) => {
              const angle = (i * 360) / 8;
              const radians = (angle * Math.PI) / 180;
              const distance = 40;
              const x = Math.cos(radians) * distance;
              const y = Math.sin(radians) * distance - 40; // 위로 좀 날아가도록

              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    boxShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
                    animation: `keyEffectParticle 0.6s ease-out forwards`,
                    animationDelay: `${i * 0.05}s`,
                    '--end-x': `${x}px`,
                    '--end-y': `${y}px`,
                  } as React.CSSProperties & { '--end-x': string; '--end-y': string }}
                />
              );
            })}
          </div>
        ))}

      {/* 간주 구간 오버레이 (채보 레인 숨김) */}
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
          zIndex: 520,
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

      {/* 테스트/플레이 중 나가기 버튼 */}
      {gameStarted && !gameState.gameEnded && isTestMode && (
        <button
          onClick={onExit}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: CHART_EDITOR_THEME.danger,
            color: CHART_EDITOR_THEME.textPrimary,
            border: `1px solid ${CHART_EDITOR_THEME.danger}`,
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            cursor: 'pointer',
            fontWeight: 'bold',
            zIndex: 1000,
            boxShadow: CHART_EDITOR_THEME.shadowSoft,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#ef4444';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = CHART_EDITOR_THEME.danger;
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ✕ 나가기
        </button>
      )}
    </>
  );
};

