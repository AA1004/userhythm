import React from 'react';
import { GameState } from '../types/game';
import { useGameJudging } from '../hooks/useGameJudging';
import { useKeyboard } from '../hooks/useKeyboard';
import { useGameLoop } from '../hooks/useGameLoop';
import { GamePlayArea } from './GamePlayArea';
import { GameplaySlotHud } from './GameplaySlotHud';
import { Score } from './Score';
import { KEY_LANE_HEIGHT, PlayfieldGeometry } from '../constants/gameVisualSettings';
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
  gameplayClockSnapshotMs: number;
  dynamicGameDuration: number;
  isGameplayActive: boolean;
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
  gameplayClockSnapshotMs,
  dynamicGameDuration,
  isGameplayActive,
}) => {
  const {
    displayScore,
    combo,
    pressedKeys,
    holdingNotes,
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
    timingOffsetMs
  );

  const useNewSlotHud =
    playfieldGeometry.gameplayHudMode === 'new' && playfieldGeometry.slotHudEnabled;
  const totalJudged =
    displayScore.perfect + displayScore.great + displayScore.good + displayScore.miss;
  const accuracy =
    totalJudged > 0
      ? ((displayScore.perfect * 100 + displayScore.great * 80 + displayScore.good * 50) /
          (totalJudged * 100)) *
        100
      : 0;
  const slotHudProgress =
    dynamicGameDuration > 0
      ? Math.min(100, Math.max(0, (gameplayClockSnapshotMs / dynamicGameDuration) * 100))
      : 0;
  const slotHudTopPx = playfieldGeometry.keyLaneY + KEY_LANE_HEIGHT + 8;
  const slotHudLeftPx = playfieldGeometry.laneGroupLeft;
  const slotHudWidthPx = playfieldGeometry.laneGroupWidth;
  const slotHudOpacity = playfieldGeometry.slotHudOpacity;

  return (
    <>
      {isGameplayActive && bgaMaskOpacity < 1 && !useNewSlotHud && (
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
        holdingNotes={holdingNotes}
        judgeFeedbacksRef={judgeFeedbacksRef}
        keyEffectsRef={keyEffectsRef}
        effectsRevision={effectsRevision}
        laneKeyLabels={laneKeyLabels}
        isFromEditor={isFromEditor}
        currentTimeRef={currentTimeRef}
        fallDuration={fallDuration}
        judgeLineY={judgeLineY}
        playfieldGeometry={playfieldGeometry}
        hitNoteIdsRef={hitNoteIdsRef}
      />

      {isGameplayActive && useNewSlotHud && (
        <GameplaySlotHud
          laneGroupLeft={slotHudLeftPx}
          laneGroupWidth={slotHudWidthPx}
          top={slotHudTopPx}
          combo={combo}
          accuracy={accuracy}
          progress={slotHudProgress}
          visible={isLaneUiVisible}
          opacity={slotHudOpacity}
        />
      )}
    </>
  );
};
