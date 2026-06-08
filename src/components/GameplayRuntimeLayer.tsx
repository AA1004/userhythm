import React from 'react';
import { GameState } from '../types/game';
import { useGameJudging } from '../hooks/useGameJudging';
import { useKeyboard } from '../hooks/useKeyboard';
import { useGameLoop } from '../hooks/useGameLoop';
import { GamePlayArea } from './GamePlayArea';
import { Score } from './Score';
import { GameplayHudCanvas } from './GameplayHudCanvas';
import { PlayfieldGeometry } from '../constants/gameVisualSettings';
import { HitNoteIdsRef } from '../utils/noteRuntimeState';
import { START_DELAY_MS } from '../constants/gameConstants';

interface GameplayRuntimeLayerProps {
  gameState: GameState;
  gameStateRef: React.MutableRefObject<GameState>;
  currentTimeRef: React.MutableRefObject<number>;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  processedMissNotes: React.MutableRefObject<Set<number>>;
  hitNoteIdsRef: HitNoteIdsRef;
  keyBindings: string[];
  laneKeyLabels: string[][];
  noteSpeed: number;
  timingOffsetMs: number;
  judgeLineY: number;
  playfieldGeometry: PlayfieldGeometry;
  bgaMaskOpacity: number;
  isLaneUiVisible: boolean;
  isFromEditor: boolean;
  isGameplayActive: boolean;
  clockEnabled?: boolean;
  durationMs: number;
}

export const GameplayRuntimeLayer: React.FC<GameplayRuntimeLayerProps> = ({
  gameState,
  gameStateRef,
  currentTimeRef,
  setGameState,
  processedMissNotes,
  hitNoteIdsRef,
  keyBindings,
  laneKeyLabels,
  noteSpeed,
  timingOffsetMs,
  judgeLineY,
  playfieldGeometry,
  bgaMaskOpacity,
  isLaneUiVisible,
  isFromEditor,
  isGameplayActive,
  clockEnabled = true,
  durationMs,
}) => {
  const isLegacyHud = playfieldGeometry.gameplayHudMode === 'legacy';
  const {
    displayScore,
    combo,
    hudRevision,
    pressedKeys,
    pressedKeysRef,
    holdingNotesRef,
    scoreRuntimeRef,
    judgeFeedbacksRef,
    keyEffectsRef,
    effectsRevision,
    handleKeyPress,
    handleKeyRelease,
    handleNoteMiss,
  } = useGameJudging({
    gameState,
    gameStateRef,
    currentTimeRef,
    laneCenters: playfieldGeometry.laneCenters,
    setGameState,
    processedMissNotes,
    hitNoteIdsRef,
    judgeLineY,
    timingOffsetMs,
    pressedKeySnapshotsEnabled: isLegacyHud,
    comboSnapshotsEnabled: isLegacyHud,
  });

  useKeyboard(
    handleKeyPress,
    handleKeyRelease,
    gameState.gameStarted && !gameState.gameEnded,
    keyBindings
  );

  const { fallDuration } = useGameLoop(
    gameState,
    setGameState,
    handleNoteMiss,
    noteSpeed,
    START_DELAY_MS,
    currentTimeRef,
    hitNoteIdsRef,
    timingOffsetMs,
    clockEnabled
  );

  const useSlotHud = playfieldGeometry.slotHudEnabled;
  return (
    <>
      {isGameplayActive && bgaMaskOpacity < 1 && !useSlotHud && (
        <Score score={displayScore} />
      )}

      <GamePlayArea
        notes={gameState.notes}
        combo={combo}
        gameStarted={isGameplayActive}
        bgaMaskOpacity={bgaMaskOpacity}
        isLaneUiVisible={isLaneUiVisible}
        speed={noteSpeed}
        pressedKeys={pressedKeys}
        keyEffectsRef={keyEffectsRef}
        effectsRevision={effectsRevision}
        holdingNotesRef={holdingNotesRef}
        laneKeyLabels={laneKeyLabels}
        isFromEditor={isFromEditor}
        currentTimeRef={currentTimeRef}
        fallDuration={fallDuration}
        judgeLineY={judgeLineY}
        playfieldGeometry={playfieldGeometry}
        hitNoteIdsRef={hitNoteIdsRef}
      />

      <GameplayHudCanvas
        active={isGameplayActive}
        visible={isLaneUiVisible}
        hudRevision={hudRevision}
        effectsRevision={effectsRevision}
        judgeFeedbackTop={Math.max(120, judgeLineY - 140)}
        judgeFeedbacksRef={judgeFeedbacksRef}
        keyEffectsRef={keyEffectsRef}
        pressedKeysRef={pressedKeysRef}
        currentTimeRef={currentTimeRef}
        scoreRuntimeRef={scoreRuntimeRef}
        laneKeyLabels={laneKeyLabels}
        playfieldGeometry={playfieldGeometry}
        gameplayHudMode={playfieldGeometry.gameplayHudMode}
        durationMs={durationMs}
      />
    </>
  );
};
