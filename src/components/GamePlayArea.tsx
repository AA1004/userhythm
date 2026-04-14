import React, { useMemo, useRef } from 'react';
import { GameState, Note, Lane } from '../types/game';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { NoteRenderer } from './NoteRenderer';
import {
  BASE_FALL_DURATION,
  NOTE_VISIBILITY_BUFFER_MS,
} from '../constants/gameConstants';
import { PlayfieldGeometry } from '../constants/gameVisualSettings';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';

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

function binarySearchStartIndex(notes: Note[], targetTime: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].time < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function binarySearchHoldEndIndex(notes: Note[], holdIndicesByEnd: number[], targetTime: number): number {
  let low = 0;
  let high = holdIndicesByEnd.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (getNoteRenderEndTime(notes[holdIndicesByEnd[mid]]) < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

const getNoteRenderEndTime = (note: Note) =>
  note.type === 'hold' && note.duration > 0 ? note.endTime || note.time + note.duration : note.time;

const getNotesRenderIndexSignature = (notes: Note[]) => {
  const first = notes[0];
  const last = notes[notes.length - 1];
  return [
    notes.length,
    first?.id ?? 'none',
    first?.time ?? 0,
    first ? getNoteRenderEndTime(first) : 0,
    last?.id ?? 'none',
    last?.time ?? 0,
    last ? getNoteRenderEndTime(last) : 0,
  ].join(':');
};

interface NoteRenderIndex {
  signature: string;
  holdIndicesByEnd: number[];
}

interface GamePlayAreaProps {
  gameState: GameState;
  gameStarted: boolean;
  bgaMaskOpacity: number;
  isLaneUiVisible: boolean;
  speed: number;
  pressedKeys: Set<Lane>;
  holdingNotes: Map<number, Note>;
  judgeFeedbacks: JudgeFeedback[];
  keyEffects: KeyEffect[];
  laneKeyLabels: string[][];
  isFromEditor: boolean;
  currentTimeRef: React.MutableRefObject<number>;
  fallDuration: number;
  judgeLineY: number;
  playfieldGeometry: PlayfieldGeometry;
}

export const GamePlayArea: React.FC<GamePlayAreaProps> = ({
  gameState,
  gameStarted,
  bgaMaskOpacity,
  isLaneUiVisible,
  speed,
  pressedKeys,
  holdingNotes,
  judgeFeedbacks,
  keyEffects,
  laneKeyLabels,
  isFromEditor: _isFromEditor,
  currentTimeRef,
  fallDuration,
  judgeLineY,
  playfieldGeometry,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderIndexRef = useRef<NoteRenderIndex>({
    signature: '',
    holdIndicesByEnd: [],
  });

  const visibleNotes = useMemo(() => {
    const shouldProfile = isGameplayProfilerEnabled();
    const profileStart = shouldProfile ? performance.now() : 0;
    let inspectedNotes = 0;

    const recordProfile = () => {
      if (shouldProfile) {
        recordGameplayMetric('visibleNoteFilter', performance.now() - profileStart, inspectedNotes);
      }
    };

    if (!isLaneUiVisible) {
      recordProfile();
      return [];
    }

    const notes = gameState.notes;
    if (notes.length === 0) {
      recordProfile();
      return [];
    }

    const renderIndexSignature = getNotesRenderIndexSignature(notes);
    if (renderIndexRef.current.signature !== renderIndexSignature) {
      renderIndexRef.current = {
        signature: renderIndexSignature,
        holdIndicesByEnd: notes
          .map((note, index) => (note.type === 'hold' && note.duration > 0 ? index : -1))
          .filter((index) => index >= 0)
          .sort((a, b) => getNoteRenderEndTime(notes[a]) - getNoteRenderEndTime(notes[b])),
      };
    }

    const baseDuration = BASE_FALL_DURATION / speed;
    const viewportStart = gameState.currentTime - baseDuration - NOTE_VISIBILITY_BUFFER_MS;
    const viewportEnd = gameState.currentTime + baseDuration + NOTE_VISIBILITY_BUFFER_MS;

    const startIdx = binarySearchStartIndex(notes, viewportStart);
    const endIdx = binarySearchEndIndex(notes, viewportEnd, startIdx);

    const result: Note[] = [];
    const addedNoteIds = new Set<number>();
    const addVisibleNote = (note: Note) => {
      if (note.hit || addedNoteIds.has(note.id)) return;
      if (getNoteRenderEndTime(note) < viewportStart || note.time > viewportEnd) return;
      addedNoteIds.add(note.id);
      result.push(note);
    };

    for (let i = startIdx; i <= endIdx && i < notes.length; i++) {
      inspectedNotes += 1;
      addVisibleNote(notes[i]);
    }

    const holdIndicesByEnd = renderIndexRef.current.holdIndicesByEnd;
    const holdStartIdx = binarySearchHoldEndIndex(notes, holdIndicesByEnd, viewportStart);
    for (let i = holdStartIdx; i < holdIndicesByEnd.length; i++) {
      const note = notes[holdIndicesByEnd[i]];
      inspectedNotes += 1;
      if (!note || note.time >= viewportStart) continue;
      addVisibleNote(note);
    }

    recordProfile();
    return result;
  }, [gameState.notes, gameState.currentTime, speed, isLaneUiVisible]);

  const judgeFeedbackTop = Math.max(120, judgeLineY - 140);

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
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
          }}
        />
      )}

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
              backgroundColor: 'rgba(255,255,255,0.1)',
              transform: 'translateX(-50%)',
            }}
          />
        ))}

      {isLaneUiVisible && (
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
            judgeLineY={judgeLineY}
            laneCenters={playfieldGeometry.laneCenters}
            noteWidth={playfieldGeometry.noteWidth}
            noteHeight={playfieldGeometry.noteHeight}
            holdingNotes={holdingNotes}
            visible={isLaneUiVisible}
          />
        </>
      )}

      {gameStarted && isLaneUiVisible && (
        <JudgeLine
          left={playfieldGeometry.judgeLineLeft}
          width={playfieldGeometry.judgeLineWidth}
          top={judgeLineY}
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
          />
        ))}

      {gameStarted &&
        isLaneUiVisible &&
        keyEffects.map((effect) => {
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
              <div className="key-hit__cross" />
            </div>
          );
        })}

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

      {isLaneUiVisible &&
        judgeFeedbacks.map((feedback) =>
          feedback.judge ? (
            <div
              key={feedback.id}
              style={{
                position: 'absolute',
                left: '50%',
                top: `${judgeFeedbackTop}px`,
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

    </>
  );
};
