import React, { useMemo, useRef } from 'react';
import { Lane, Note } from '../types/game';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { NoteRenderer } from './NoteRenderer';
import { WebglBetaNoteRenderer } from './WebglBetaNoteRenderer';
import { ComboDisplay } from './ComboDisplay';
import { PlayfieldGeometry } from '../constants/gameVisualSettings';
import { HitNoteIdsRef } from '../utils/noteRuntimeState';
import { getLaneNoteColor } from '../utils/noteColors';
import { KeyEffect } from '../hooks/useGameJudging';

interface GamePlayAreaProps {
  notes: Note[];
  combo: number;
  gameStarted: boolean;
  bgaMaskOpacity: number;
  isLaneUiVisible: boolean;
  speed: number;
  pressedKeys: Set<Lane>;
  keyEffectsRef: React.MutableRefObject<KeyEffect[]>;
  effectsRevision: number;
  holdingNotesRef: React.MutableRefObject<Map<number, Note>>;
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
  keyEffectsRef: _keyEffectsRef,
  effectsRevision: _effectsRevision,
  holdingNotesRef,
  laneKeyLabels,
  isFromEditor: _isFromEditor,
  currentTimeRef,
  fallDuration,
  judgeLineY,
  playfieldGeometry,
  hitNoteIdsRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isLegacyHud = playfieldGeometry.gameplayHudMode === 'legacy';
  const simpleHoldVisuals = playfieldGeometry.gameplayHudMode === 'new-lite';
  const laneNoteColors = useMemo(
    () => [
      getLaneNoteColor(0, playfieldGeometry.outerLaneNoteColor, playfieldGeometry.innerLaneNoteColor),
      getLaneNoteColor(1, playfieldGeometry.outerLaneNoteColor, playfieldGeometry.innerLaneNoteColor),
      getLaneNoteColor(2, playfieldGeometry.outerLaneNoteColor, playfieldGeometry.innerLaneNoteColor),
      getLaneNoteColor(3, playfieldGeometry.outerLaneNoteColor, playfieldGeometry.innerLaneNoteColor),
    ] as const,
    [playfieldGeometry.outerLaneNoteColor, playfieldGeometry.innerLaneNoteColor]
  );
  const laneBackgroundLayer = useMemo(
    () =>
      isLaneUiVisible ? (
        <div
          style={{
            position: 'absolute',
            left: `${playfieldGeometry.laneGroupLeft}px`,
            top: 0,
            width: `${playfieldGeometry.laneGroupWidth}px`,
            height: '100%',
            backgroundColor: `rgba(15, 23, 42, ${0.6 * playfieldGeometry.laneOpacity})`,
          }}
        />
      ) : null,
    [
      isLaneUiVisible,
      playfieldGeometry.laneGroupLeft,
      playfieldGeometry.laneGroupWidth,
      playfieldGeometry.laneOpacity,
    ]
  );

  const lanePressTintLayer = useMemo(
    () =>
      isLegacyHud && isLaneUiVisible && playfieldGeometry.lanePressTintEnabled
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
      isLegacyHud,
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
                top: 0,
                width: '2px',
                height: '100%',
                backgroundColor: `rgba(255,255,255,${0.1 * playfieldGeometry.laneOpacity})`,
                transform: 'translateX(-50%)',
              }}
            />
          ))
        : null,
    [
      isLaneUiVisible,
      playfieldGeometry.laneEdges,
      playfieldGeometry.laneOpacity,
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
              laneNoteColors={laneNoteColors}
              holdingNotesRef={holdingNotesRef}
              hitNoteIdsRef={hitNoteIdsRef}
              visible={isLaneUiVisible}
              simpleHoldVisuals={simpleHoldVisuals}
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
                laneNoteColors={laneNoteColors}
                holdingNotesRef={holdingNotesRef}
                hitNoteIdsRef={hitNoteIdsRef}
                visible={isLaneUiVisible}
                simpleHoldVisuals={simpleHoldVisuals}
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
      laneNoteColors,
      notes,
      currentTimeRef,
      fallDuration,
      judgeLineY,
      holdingNotesRef,
      hitNoteIdsRef,
      simpleHoldVisuals,
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
      gameStarted && isLegacyHud ? (
        <ComboDisplay
          combo={combo}
          laneGroupCenterX={playfieldGeometry.laneGroupLeft + playfieldGeometry.laneGroupWidth / 2}
          numberOpacity={playfieldGeometry.comboOpacity}
          visible={isLaneUiVisible}
        />
      ) : null,
    [
      gameStarted,
      isLegacyHud,
      combo,
      playfieldGeometry.laneGroupLeft,
      playfieldGeometry.laneGroupWidth,
      playfieldGeometry.comboOpacity,
      isLaneUiVisible,
    ]
  );

  const keyLaneLayer = useMemo(
    () =>
      gameStarted && isLaneUiVisible && isLegacyHud
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
      isLegacyHud,
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

    </>
  );
};

export const GamePlayArea = React.memo(GamePlayAreaComponent);
