import React, { useMemo, useRef } from 'react';
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

  const laneBackgroundLayer = useMemo(
    () =>
      isLaneUiVisible ? (
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
      ) : null,
    [isLaneUiVisible, playfieldGeometry.laneGroupLeft, playfieldGeometry.laneGroupWidth, playfieldGeometry.laneOpacity]
  );

  const lanePressTintLayer = useMemo(
    () =>
      isLaneUiVisible && playfieldGeometry.lanePressTintEnabled
        ? playfieldGeometry.laneCenters.map((x, index) => {
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
                  transition: isPressed ? 'opacity 18ms linear' : 'opacity 70ms ease-out',
                  background: isPressed
                    ? 'linear-gradient(180deg, rgba(34,139,255,0.12) 0%, rgba(56,189,248,0.08) 42%, rgba(44,130,255,0.14) 100%)'
                    : 'transparent',
                }}
              />
            );
          })
        : null,
    [
      isLaneUiVisible,
      playfieldGeometry.lanePressTintEnabled,
      playfieldGeometry.laneCenters,
      playfieldGeometry.laneWidth,
      playfieldGeometry.keyLaneY,
      pressedKeys,
    ]
  );

  const laneEdgeLayer = useMemo(
    () =>
      isLaneUiVisible
        ? playfieldGeometry.laneEdges.map((x) => (
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
          ))
        : null,
    [isLaneUiVisible, playfieldGeometry.laneEdges, playfieldGeometry.laneOpacity]
  );

  const topLaneExtensionLayer = useMemo(
    () =>
      isLaneUiVisible && playfieldGeometry.topLaneExtensionEnabled ? (
        <div
          style={{
            position: 'absolute',
            left: `${playfieldGeometry.laneGroupLeft}px`,
            top: 0,
            width: `${playfieldGeometry.laneGroupWidth}px`,
            height: `${topExtensionHeight}px`,
            pointerEvents: 'none',
            zIndex: 36,
            backgroundColor: `rgba(15, 23, 42, ${0.6 * playfieldGeometry.laneOpacity})`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,${0.08 * playfieldGeometry.laneOpacity})`,
            borderTop: `1px solid rgba(255,255,255,${0.1 * playfieldGeometry.laneOpacity})`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(180deg,
                rgba(255,255,255,${0.025 * playfieldGeometry.laneOpacity}) 0%,
                rgba(255,255,255,0) 42%,
                rgba(255,255,255,0) 100%)`,
            }}
          />
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
                background: `linear-gradient(180deg,
                  rgba(255,255,255,${0.14 * playfieldGeometry.laneOpacity}) 0%,
                  rgba(255,255,255,${0.08 * playfieldGeometry.laneOpacity}) 55%,
                  rgba(255,255,255,0) 100%)`,
                boxShadow: 'none',
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: `${Math.min(36, topExtensionHeight * 0.22)}px`,
              background: `linear-gradient(180deg,
                rgba(255,255,255,0) 0%,
                rgba(255,255,255,${0.025 * playfieldGeometry.laneOpacity}) 100%)`,
            }}
          />
        </div>
      ) : null,
    [
      isLaneUiVisible,
      playfieldGeometry.topLaneExtensionEnabled,
      playfieldGeometry.laneGroupLeft,
      playfieldGeometry.laneGroupWidth,
      playfieldGeometry.laneEdges,
      playfieldGeometry.laneOpacity,
      topExtensionHeight,
    ]
  );

  const noteFieldLayer = useMemo(
    () =>
      isLaneUiVisible ? (
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
      ) : null,
    [
      isLaneUiVisible,
      playfieldGeometry.renderBackend,
      playfieldGeometry.noteWidth,
      playfieldGeometry.noteHeight,
      playfieldGeometry.laneCenters,
      notes,
      currentTimeRef,
      fallDuration,
      judgeLineY,
      holdingNotes,
      hitNoteIdsRef,
    ]
  );

  const judgeLineLayer = useMemo(
    () =>
      gameStarted && isLaneUiVisible ? (
        <JudgeLine
          left={playfieldGeometry.judgeLineLeft}
          width={playfieldGeometry.judgeLineWidth}
          top={judgeLineY}
          opacity={1}
        />
      ) : null,
    [
      gameStarted,
      isLaneUiVisible,
      playfieldGeometry.judgeLineLeft,
      playfieldGeometry.judgeLineWidth,
      judgeLineY,
    ]
  );

  const comboLayer = useMemo(
    () =>
      gameStarted ? (
        <ComboDisplay
          combo={combo}
          laneGroupCenterX={playfieldGeometry.laneGroupLeft + playfieldGeometry.laneGroupWidth / 2}
          numberOpacity={playfieldGeometry.comboOpacity}
          visible={isLaneUiVisible}
        />
      ) : null,
    [
      gameStarted,
      combo,
      playfieldGeometry.laneGroupLeft,
      playfieldGeometry.laneGroupWidth,
      playfieldGeometry.comboOpacity,
      isLaneUiVisible,
    ]
  );

  const keyLaneLayer = useMemo(
    () =>
      gameStarted && isLaneUiVisible
        ? playfieldGeometry.laneCenters.map((x, index) => (
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
          ))
        : null,
    [
      gameStarted,
      isLaneUiVisible,
      playfieldGeometry.laneCenters,
      playfieldGeometry.keyLaneY,
      playfieldGeometry.laneWidth,
      playfieldGeometry.keyLaneOpacity,
      playfieldGeometry.gameplayHudMode,
      playfieldGeometry.keyPressGlowEnabled,
      playfieldGeometry.keyPressPulseEnabled,
      laneKeyLabels,
      pressedKeys,
    ]
  );

  return (
    <>
      {laneBackgroundLayer}
      {lanePressTintLayer}
      {laneEdgeLayer}
      {topLaneExtensionLayer}
      {noteFieldLayer}
      {judgeLineLayer}
      {comboLayer}
      {keyLaneLayer}

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
