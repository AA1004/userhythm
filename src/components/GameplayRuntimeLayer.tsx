import React from 'react';
import { GameState } from '../types/game';
import { useGameJudging } from '../hooks/useGameJudging';
import { useKeyboard } from '../hooks/useKeyboard';
import { useGameLoop } from '../hooks/useGameLoop';
import { GamePlayArea } from './GamePlayArea';
import { Score } from './Score';
import { GameplayHudCanvas } from './GameplayHudCanvas';
import { GameplaySlotHud } from './GameplaySlotHud';
import { PlayfieldGeometry } from '../constants/gameVisualSettings';
import { HitNoteIdsRef } from '../utils/noteRuntimeState';
import { KEY_LANE_HEIGHT } from '../constants/gameVisualSettings';

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
  lanePositionOffsetX: number;
  playfieldTopOffset: number;
  bgaMaskOpacity: number;
  isLaneUiVisible: boolean;
  isFromEditor: boolean;
  isGameplayActive: boolean;
  clockEnabled?: boolean;
  durationMs: number;
  startDelayMs: number;
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
  lanePositionOffsetX,
  playfieldTopOffset,
  bgaMaskOpacity,
  isLaneUiVisible,
  isFromEditor,
  isGameplayActive,
  clockEnabled = true,
  durationMs,
  startDelayMs,
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
    scoreSnapshotsEnabled: isLegacyHud,
    effectSnapshotsEnabled: isLegacyHud,
    hudPaintDispatchEnabled: isLegacyHud,
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
    startDelayMs,
    currentTimeRef,
    hitNoteIdsRef,
    timingOffsetMs,
    clockEnabled,
    false
  );

  const useSlotHud = playfieldGeometry.slotHudEnabled;
  const laneUiOpacity = isLaneUiVisible ? Math.max(0, Math.min(1, 1 - bgaMaskOpacity)) : 0;
  const shouldRenderLaneUi = laneUiOpacity > 0.001;
  const legacySlotHudTop = playfieldGeometry.keyLaneY + KEY_LANE_HEIGHT + 8;
  const legacySlotHudProgress =
    durationMs > 0
      ? Math.min(100, Math.max(0, (currentTimeRef.current / durationMs) * 100))
      : 0;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        // 좌표와 캔버스 크기를 바꾸지 않고 전체 플레이필드를 GPU 합성으로 이동한다.
        transform: lanePositionOffsetX ? `translate3d(${lanePositionOffsetX}px, 0, 0)` : undefined,
        willChange: lanePositionOffsetX ? 'transform' : undefined,
      }}
    >
      {isGameplayActive && shouldRenderLaneUi && !useSlotHud && isLegacyHud && (
        <div style={{ opacity: laneUiOpacity }}>
          <Score score={displayScore} />
        </div>
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
        timingOffsetMs={timingOffsetMs}
        playfieldGeometry={playfieldGeometry}
        playfieldTopOffset={playfieldTopOffset}
        hitNoteIdsRef={hitNoteIdsRef}
      />

      <GameplayHudCanvas
        active={isGameplayActive}
        visible={shouldRenderLaneUi}
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
        playfieldTopOffset={playfieldTopOffset}
        gameplayHudMode={playfieldGeometry.gameplayHudMode}
        durationMs={durationMs}
        opacity={laneUiOpacity}
      />

      {isGameplayActive && useSlotHud && isLegacyHud && shouldRenderLaneUi && (
        <GameplaySlotHud
          laneGroupLeft={playfieldGeometry.laneGroupLeft}
          laneGroupWidth={playfieldGeometry.laneGroupWidth}
          top={legacySlotHudTop}
          combo={scoreRuntimeRef.current.combo}
          accuracy={100}
          progress={legacySlotHudProgress}
          currentTimeRef={currentTimeRef}
          scoreRuntimeRef={scoreRuntimeRef}
          durationMs={durationMs}
          visible={shouldRenderLaneUi}
          opacity={playfieldGeometry.slotHudOpacity * laneUiOpacity}
        />
      )}
    </div>
  );
};
