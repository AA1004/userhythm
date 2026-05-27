import React, { useRef } from 'react';
import { Lane, Note } from '../types/game';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { NoteRenderer } from './NoteRenderer';
import { WebglBetaNoteRenderer } from './WebglBetaNoteRenderer';
import { ComboDisplay } from './ComboDisplay';
import { GameplayEffectsCanvas } from './GameplayEffectsCanvas';
import { PlayfieldGeometry } from '../constants/gameVisualSettings';
import { GAME_VIEW_HEIGHT } from '../constants/gameLayout';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';
import { HitNoteIdsRef } from '../utils/noteRuntimeState';

interface GamePlayAreaProps {
  notes: Note[];
  combo: number;
  gameStarted: boolean;
  bgaMaskOpacity: number;
  isLaneUiVisible: boolean;
  speed: number;
  pressedKeys: Set<Lane>;
  holdingNotes: Map<number, Note>;
  judgeFeedbacksRef: React.MutableRefObject<JudgeFeedback[]>;
  keyEffectsRef: React.MutableRefObject<KeyEffect[]>;
  effectsRevision: number;
  laneKeyLabels: string[][];
  isFromEditor: boolean;
  currentTimeRef: React.MutableRefObject<number>;
  fallDuration: number;
  judgeLineY: number;
  playfieldGeometry: PlayfieldGeometry;
  hitNoteIdsRef: HitNoteIdsRef;
}

const GamePlayAreaComponent: React.FC<GamePlayAreaProps> = ({
  notes,
  combo,
  gameStarted,
  bgaMaskOpacity,
  isLaneUiVisible,
  speed: _speed,
  pressedKeys,
  holdingNotes,
  judgeFeedbacksRef,
  keyEffectsRef,
  effectsRevision,
  laneKeyLabels,
  isFromEditor: _isFromEditor,
  currentTimeRef,
  fallDuration,
  judgeLineY,
  playfieldGeometry,
  hitNoteIdsRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const judgeFeedbackTop = Math.max(120, judgeLineY - 140);
  const topExtensionHeight = Math.max(100, Math.min(GAME_VIEW_HEIGHT * 0.58, judgeLineY - 36));

  return (
    <>
      {isLaneUiVisible && (
        <div
          style={{
            position: 'absolute',
            left: `${playfieldGeometry.laneGroupLeft}px`,
            top: '0',
            width: `${playfieldGeometry.laneGroupWidth}px`,
            height: '100%',
            backgroundColor: `rgba(15, 23, 42, ${0.6 * playfieldGeometry.laneOpacity})`,
          }}
        />
      )}

      {isLaneUiVisible &&
        playfieldGeometry.lanePressTintEnabled &&
        playfieldGeometry.laneCenters.map((x, index) => {
          const isPressed = pressedKeys.has(index as Lane);
          return (
            <div
              key={`lane-press-${index}`}
              style={{
                position: 'absolute',
                left: `${x}px`,
                top: 0,
                width: `${playfieldGeometry.laneWidth}px`,
                height: `${playfieldGeometry.keyLaneY + 100}px`,
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                zIndex: 24,
                opacity: isPressed ? 1 : 0,
                transition: isPressed ? 'opacity 22ms linear' : 'opacity 90ms ease-out',
                background: isPressed
                  ? 'linear-gradient(180deg, rgba(34,139,255,0.14) 0%, rgba(56,189,248,0.08) 34%, rgba(76,160,255,0.06) 68%, rgba(44,130,255,0.18) 100%)'
                  : 'transparent',
                boxShadow: isPressed
                  ? 'inset 0 0 32px rgba(70,170,255,0.2), 0 0 28px rgba(35,130,255,0.12)'
                  : 'none',
              }}
            />
          );
        })}

      {isLaneUiVisible &&
        playfieldGeometry.laneEdges.map((x) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: '0',
              width: '2px',
              height: '100%',
              backgroundColor: `rgba(255,255,255,${0.1 * playfieldGeometry.laneOpacity})`,
              transform: 'translateX(-50%)',
            }}
          />
        ))}

      {isLaneUiVisible && playfieldGeometry.topLaneExtensionEnabled && (
        <div
          style={{
            position: 'absolute',
            left: `${playfieldGeometry.laneGroupLeft}px`,
            top: 0,
            width: `${playfieldGeometry.laneGroupWidth}px`,
            height: `${topExtensionHeight}px`,
            pointerEvents: 'none',
            zIndex: 36,
            background: 'transparent',
            boxShadow: 'none',
          }}
        >
          {playfieldGeometry.laneEdges.map((x) => (
            <div
              key={`top-edge-${x}`}
              style={{
                position: 'absolute',
                left: `${x - playfieldGeometry.laneGroupLeft}px`,
                top: 0,
                width: '2px',
                height: '100%',
                transform: 'translateX(-50%)',
                backgroundColor: `rgba(255,255,255,${0.09 * playfieldGeometry.laneOpacity})`,
              }}
            />
          ))}
        </div>
      )}

      {isLaneUiVisible && (
        <>
          {playfieldGeometry.renderBackend === 'webgl' ? (
            <WebglBetaNoteRenderer
              key={`webgl-${playfieldGeometry.noteWidth}-${playfieldGeometry.noteHeight}`}
              notes={notes}
              currentTimeRef={currentTimeRef}
              fallDuration={fallDuration}
              judgeLineY={judgeLineY}
              laneCenters={playfieldGeometry.laneCenters}
              noteWidth={playfieldGeometry.noteWidth}
              noteHeight={playfieldGeometry.noteHeight}
              holdingNotes={holdingNotes}
              hitNoteIdsRef={hitNoteIdsRef}
              visible={isLaneUiVisible}
            />
          ) : (
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
                notes={notes}
                currentTimeRef={currentTimeRef}
                fallDuration={fallDuration}
                judgeLineY={judgeLineY}
                laneCenters={playfieldGeometry.laneCenters}
                noteWidth={playfieldGeometry.noteWidth}
                noteHeight={playfieldGeometry.noteHeight}
                holdingNotes={holdingNotes}
                hitNoteIdsRef={hitNoteIdsRef}
                visible={isLaneUiVisible}
              />
            </>
          )}
        </>
      )}

      {gameStarted && isLaneUiVisible && (
        <JudgeLine
          left={playfieldGeometry.judgeLineLeft}
          width={playfieldGeometry.judgeLineWidth}
          top={judgeLineY}
          opacity={1}
        />
      )}

      {gameStarted && (
        <ComboDisplay
          combo={combo}
          laneGroupCenterX={playfieldGeometry.laneGroupLeft + playfieldGeometry.laneGroupWidth / 2}
          numberOpacity={playfieldGeometry.comboOpacity}
          visible={isLaneUiVisible}
        />
      )}

      {gameStarted &&
        isLaneUiVisible &&
        playfieldGeometry.laneCenters.map((x, index) => (
          <KeyLane
            key={index}
            x={x}
            top={playfieldGeometry.keyLaneY}
            width={playfieldGeometry.laneWidth}
            keys={laneKeyLabels[index]}
            isPressed={pressedKeys.has(index as Lane)}
            opacity={playfieldGeometry.keyLaneOpacity}
            styleVariant={playfieldGeometry.gameplayHudMode}
            glowEnabled={playfieldGeometry.keyPressGlowEnabled}
            pulseEnabled={playfieldGeometry.keyPressPulseEnabled}
          />
        ))}

      <div
        style={{
          position: 'absolute',
          left: `${playfieldGeometry.laneGroupLeft}px`,
          top: 0,
          width: `${playfieldGeometry.laneGroupWidth}px`,
          height: '100%',
          backgroundColor: 'rgba(8,12,24,0.94)',
          opacity: bgaMaskOpacity,
          transition: 'opacity 80ms linear',
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      />

      {gameStarted && (
        <GameplayEffectsCanvas
          judgeFeedbacksRef={judgeFeedbacksRef}
          keyEffectsRef={keyEffectsRef}
          effectsRevision={effectsRevision}
          judgeFeedbackTop={judgeFeedbackTop}
          visible={isLaneUiVisible}
        />
      )}

    </>
  );
};

export const GamePlayArea = React.memo(GamePlayAreaComponent);
