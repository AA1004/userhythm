import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { GamePlayArea } from './GamePlayArea';
import { GameplayHudCanvas } from './GameplayHudCanvas';
import { BASE_FALL_DURATION, JUDGE_FEEDBACK_DURATION_MS, JUDGE_LINE_Y, KEY_EFFECT_DURATION_MS, START_DELAY_MS } from '../constants/gameConstants';
import { buildPlayfieldGeometry, DEFAULT_GAME_VISUAL_SETTINGS } from '../constants/gameVisualSettings';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../constants/gameLayout';
import { getKeyBindingFromInput } from '../utils/keyBinding';
import { JudgeFeedback, KeyEffect } from '../hooks/useGameJudging';
import { GameState, Lane, Note } from '../types/game';

interface CalibrationGameProps {
  keyBindings: string[];
  currentOffsetMs: number;
  currentNoteSpeed: number;
  onApplyTimingOffset: (offsetMs: number) => void;
  onClose: () => void;
}

type Phase = 'ready' | 'countdown' | 'measuring' | 'complete';

const BPM = 120;
const BEAT_INTERVAL_MS = 60000 / BPM;
const COUNT_IN_BEATS = 4;
const MEASURE_BEATS = 24;
const HIT_WINDOW_MS = 220;

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const meanAbs = (values: number[], center: number) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + Math.abs(value - center), 0) / values.length;

const buildCalibrationNotes = (): Note[] =>
  Array.from({ length: MEASURE_BEATS }, (_, index) => {
    const lane = (index % 4) as Lane;
    const time = index * BEAT_INTERVAL_MS;
    return {
      id: index + 1,
      lane,
      time,
      duration: 0,
      endTime: time,
      type: 'tap',
      y: -100,
      hit: false,
    };
  });

export const CalibrationGame: React.FC<CalibrationGameProps> = ({
  keyBindings,
  currentOffsetMs,
  currentNoteSpeed,
  onApplyTimingOffset,
  onClose,
}) => {
  const [phase, setPhase] = useState<Phase>('ready');
  const [displayBeat, setDisplayBeat] = useState(0);
  const [samples, setSamples] = useState<number[]>([]);
  const [combo, setCombo] = useState(0);
  const [pressedKeys, setPressedKeys] = useState<Set<Lane>>(new Set());
  const pressedKeysRef = useRef<Set<Lane>>(new Set());
  const judgeFeedbacksRef = useRef<JudgeFeedback[]>([]);
  const keyEffectsRef = useRef<KeyEffect[]>([]);
  const [effectsRevision, setEffectsRevision] = useState(0);
  const scoreRuntimeRef = useRef<GameState['score']>({
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
  });
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);

  const notes = useMemo(() => buildCalibrationNotes(), []);
  const playfieldGeometry = useMemo(
    () => buildPlayfieldGeometry(DEFAULT_GAME_VISUAL_SETTINGS, JUDGE_LINE_Y),
    []
  );
  const laneKeyLabels = useMemo(() => keyBindings.map((key) => [key]), [keyBindings]);
  const allowedKeys = useMemo(() => new Set(keyBindings.map((key) => key.toUpperCase())), [keyBindings]);
  const fallDuration = useMemo(() => BASE_FALL_DURATION / currentNoteSpeed, [currentNoteSpeed]);

  const currentTimeRef = useRef(-START_DELAY_MS);
  const hitNoteIdsRef = useRef<Set<number>>(new Set());
  const holdingNotesRef = useRef<Map<number, Note>>(new Map());
  const sampleSetRef = useRef<number[]>([]);
  const hitBeatSetRef = useRef<Set<number>>(new Set());
  const missedBeatSetRef = useRef<Set<number>>(new Set());
  const activeRef = useRef(false);
  const startTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const timerIdsRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const feedbackIdRef = useRef(0);
  const effectIdRef = useRef(0);

  const clearTimers = useCallback(() => {
    timerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timerIdsRef.current = [];
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const playClick = useCallback((accent: boolean) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = accent ? 1280 : 880;
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(accent ? 0.18 : 0.12, now + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.08);
  }, []);

  const pushFeedback = useCallback((judge: 'perfect' | 'great' | 'good' | 'miss', lane: Lane, timingDirection: 'fast' | 'slow' | null) => {
    const feedbackExpiresAt = Date.now() + JUDGE_FEEDBACK_DURATION_MS;
    const effectExpiresAt = Date.now() + KEY_EFFECT_DURATION_MS;
    const x = playfieldGeometry.laneCenters[lane];
    const y = JUDGE_LINE_Y;
    judgeFeedbacksRef.current = [{ id: feedbackIdRef.current++, judge, expiresAt: feedbackExpiresAt, x, y, lane, timingDirection }];
    keyEffectsRef.current = [
      ...keyEffectsRef.current.filter((effect) => effect.lane !== lane),
      { id: effectIdRef.current++, lane, x, y, judge, expiresAt: effectExpiresAt },
    ].slice(-4);
    setEffectsRevision((prev) => prev + 1);
  }, [playfieldGeometry.laneCenters]);

  const finishMeasurement = useCallback(() => {
    activeRef.current = false;
    setPhase('complete');
    setSamples([...sampleSetRef.current]);
    setPressedKeys(new Set());
  }, []);

  const startMeasurement = useCallback(async () => {
    clearTimers();
    hitNoteIdsRef.current.clear();
    holdingNotesRef.current.clear();
    sampleSetRef.current = [];
    hitBeatSetRef.current.clear();
    missedBeatSetRef.current.clear();
    setSamples([]);
    setCombo(0);
    scoreRuntimeRef.current = {
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
    };
    judgeFeedbacksRef.current = [];
    keyEffectsRef.current = [];
    setEffectsRevision((prev) => prev + 1);
    setPressedKeys(new Set());
    setDisplayBeat(COUNT_IN_BEATS);

    const audioContext = await ensureAudioContext();
    if (!audioContext) return;

    const now = performance.now();
    const measureStart = now + 800 + COUNT_IN_BEATS * BEAT_INTERVAL_MS;
    startTimeRef.current = measureStart;
    currentTimeRef.current = -COUNT_IN_BEATS * BEAT_INTERVAL_MS;
    activeRef.current = true;
    setPhase('countdown');

    for (let beatIndex = 0; beatIndex < COUNT_IN_BEATS + MEASURE_BEATS; beatIndex += 1) {
      const delay = 800 + beatIndex * BEAT_INTERVAL_MS;
      timerIdsRef.current.push(window.setTimeout(() => {
        if (!activeRef.current) return;
        playClick(beatIndex % 4 === 0);
        if (beatIndex < COUNT_IN_BEATS) {
          setDisplayBeat(COUNT_IN_BEATS - beatIndex);
          setPhase('countdown');
        } else {
          setDisplayBeat(beatIndex - COUNT_IN_BEATS + 1);
          setPhase('measuring');
        }
      }, delay));
    }

    timerIdsRef.current.push(
      window.setTimeout(finishMeasurement, 800 + (COUNT_IN_BEATS + MEASURE_BEATS) * BEAT_INTERVAL_MS + 180)
    );
  }, [clearTimers, ensureAudioContext, finishMeasurement, playClick]);

  useEffect(() => {
    const cleanupExpiredEffects = () => {
      const now = Date.now();
      const nextJudgeFeedbacks = judgeFeedbacksRef.current.filter((item) => item.expiresAt > now);
      const nextKeyEffects = keyEffectsRef.current.filter((item) => item.expiresAt > now);
      if (
        nextJudgeFeedbacks.length !== judgeFeedbacksRef.current.length ||
        nextKeyEffects.length !== keyEffectsRef.current.length
      ) {
        judgeFeedbacksRef.current = nextJudgeFeedbacks;
        keyEffectsRef.current = nextKeyEffects;
        setEffectsRevision((prev) => prev + 1);
      }
    };

    const timerId = window.setInterval(cleanupExpiredEffects, 40);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'measuring') {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      currentTimeRef.current = elapsed;

      if (activeRef.current) {
        notes.forEach((note, index) => {
          if (hitBeatSetRef.current.has(index) || missedBeatSetRef.current.has(index)) return;
          if (elapsed > note.time + HIT_WINDOW_MS) {
            missedBeatSetRef.current.add(index);
            hitNoteIdsRef.current.add(note.id);
            setCombo(0);
            scoreRuntimeRef.current = {
              ...scoreRuntimeRef.current,
              miss: scoreRuntimeRef.current.miss + 1,
              combo: 0,
            };
            pushFeedback('miss', note.lane, 'slow');
          }
        });
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [notes, phase, pushFeedback]);

  useEffect(() => {
    pressedKeysRef.current = pressedKeys;
  }, [pressedKeys]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = getKeyBindingFromInput(event);
      if (!key || !allowedKeys.has(key)) return;
      event.preventDefault();

      const lane = keyBindings.findIndex((binding) => binding.toUpperCase() === key) as Lane;
      setPressedKeys((prev) => {
        if (prev.has(lane)) return prev;
        const next = new Set(prev);
        next.add(lane);
        return next;
      });

      if (!activeRef.current || phase === 'ready' || phase === 'complete') return;

      const currentTime = currentTimeRef.current;
      const measureBeatIndex = Math.round(currentTime / BEAT_INTERVAL_MS);
      if (measureBeatIndex < 0 || measureBeatIndex >= MEASURE_BEATS) return;
      if (hitBeatSetRef.current.has(measureBeatIndex) || missedBeatSetRef.current.has(measureBeatIndex)) return;

      const note = notes[measureBeatIndex];
      if (!note || note.lane !== lane) return;

      const signedDiff = note.time - currentTime;
      if (Math.abs(signedDiff) > HIT_WINDOW_MS) return;

      hitBeatSetRef.current.add(measureBeatIndex);
      hitNoteIdsRef.current.add(note.id);
      sampleSetRef.current = [...sampleSetRef.current, signedDiff];
      setSamples([...sampleSetRef.current]);
      setCombo((prev) => prev + 1);

      const judge = Math.abs(signedDiff) <= 45 ? 'perfect' : Math.abs(signedDiff) <= 100 ? 'great' : 'good';
      const timingDirection = judge === 'perfect' ? null : signedDiff > 0 ? 'fast' : 'slow';
      const nextScore = { ...scoreRuntimeRef.current };
      nextScore[judge] += 1;
      nextScore.combo += 1;
      nextScore.maxCombo = Math.max(nextScore.maxCombo, nextScore.combo);
      scoreRuntimeRef.current = nextScore;
      pushFeedback(judge, lane, timingDirection);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = getKeyBindingFromInput(event);
      if (!key || !allowedKeys.has(key)) return;
      event.preventDefault();
      const lane = keyBindings.findIndex((binding) => binding.toUpperCase() === key) as Lane;
      setPressedKeys((prev) => {
        if (!prev.has(lane)) return prev;
        const next = new Set(prev);
        next.delete(lane);
        return next;
      });
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [allowedKeys, keyBindings, notes, onClose, phase, pushFeedback]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearTimers();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      void audioContextRef.current?.close();
    };
  }, [clearTimers]);

  const localMedianOffsetMs = useMemo(() => Math.round(median(samples)), [samples]);
  const averageDeviationMs = useMemo(() => Math.round(meanAbs(samples, localMedianOffsetMs)), [samples, localMedianOffsetMs]);
  const fastCount = useMemo(() => samples.filter((sample) => sample > 0).length, [samples]);
  const slowCount = useMemo(() => samples.filter((sample) => sample < 0).length, [samples]);
  const sampleCount = samples.length;
  const canApply = sampleCount >= 8;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: CHART_EDITOR_THEME.backgroundGradient,
        backgroundColor: CHART_EDITOR_THEME.rootBackground,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 24px',
          borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: CHART_EDITOR_THEME.textPrimary }}>판정 보정</h1>
          <p style={{ margin: '6px 0 0', color: CHART_EDITOR_THEME.textSecondary, fontSize: '13px' }}>
            실제 게임 플레이 UI 기준 · {MEASURE_BEATS}노트 · 현재 보정값 {currentOffsetMs}ms
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '10px 16px',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            background: 'transparent',
            color: CHART_EDITOR_THEME.textPrimary,
            cursor: 'pointer',
          }}
        >
          닫기
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 540px) minmax(320px, 420px)',
          gap: '24px',
          padding: '24px',
          justifyContent: 'center',
          alignItems: 'start',
        }}
      >
        <div
          ref={stageWrapperRef}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: `${GAME_VIEW_WIDTH} / ${GAME_VIEW_HEIGHT}`,
            borderRadius: CHART_EDITOR_THEME.radiusLg,
            overflow: 'hidden',
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            background: 'rgba(8, 12, 24, 0.9)',
            boxShadow: CHART_EDITOR_THEME.shadowSoft,
          }}
        >
          <GamePlayArea
            notes={notes}
            combo={combo}
            gameStarted={true}
            bgaMaskOpacity={0}
            isLaneUiVisible={true}
            speed={currentNoteSpeed}
            pressedKeys={pressedKeys}
            keyEffectsRef={keyEffectsRef}
            effectsRevision={effectsRevision}
            holdingNotesRef={holdingNotesRef}
            laneKeyLabels={laneKeyLabels}
            isFromEditor={false}
            currentTimeRef={currentTimeRef}
            fallDuration={fallDuration}
            judgeLineY={JUDGE_LINE_Y}
            playfieldGeometry={playfieldGeometry}
            playfieldTopOffset={0}
            hitNoteIdsRef={hitNoteIdsRef}
          />
          <GameplayHudCanvas
            active={phase === 'countdown' || phase === 'measuring'}
            visible={true}
            hudRevision={effectsRevision + combo + pressedKeys.size}
            effectsRevision={effectsRevision}
            judgeFeedbackTop={Math.max(120, JUDGE_LINE_Y - 140)}
            judgeFeedbacksRef={judgeFeedbacksRef}
            keyEffectsRef={keyEffectsRef}
            pressedKeysRef={pressedKeysRef}
            currentTimeRef={currentTimeRef}
            scoreRuntimeRef={scoreRuntimeRef}
            laneKeyLabels={laneKeyLabels}
            playfieldGeometry={playfieldGeometry}
            gameplayHudMode={playfieldGeometry.gameplayHudMode}
            durationMs={MEASURE_BEATS * BEAT_INTERVAL_MS}
          />

          <div
            style={{
              position: 'absolute',
              top: 18,
              left: 18,
              padding: '8px 12px',
              borderRadius: 12,
              background: 'rgba(0,0,0,0.42)',
              color: '#e2e8f0',
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {phase === 'ready' ? 'Ready' : phase === 'complete' ? 'Complete' : `Beat ${displayBeat}`}
          </div>
        </div>

        <div
          style={{
            borderRadius: CHART_EDITOR_THEME.radiusLg,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            background: CHART_EDITOR_THEME.surfaceElevated,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: CHART_EDITOR_THEME.textPrimary, fontSize: '18px' }}>보정 곡 안내</h2>
            <p style={{ margin: '8px 0 0', color: CHART_EDITOR_THEME.textSecondary, fontSize: '13px', lineHeight: 1.6 }}>
              실제 플레이처럼 떨어지는 노트를 맞춰 입력한다. 샘플은 중앙값으로 계산한다.
            </p>
          </div>

          <div
            style={{
              padding: '14px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              background: CHART_EDITOR_THEME.surface,
            }}
          >
            <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '6px' }}>현재 측정</div>
            <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '28px', fontWeight: 800 }}>
              {canApply ? `${localMedianOffsetMs > 0 ? '+' : ''}${localMedianOffsetMs}ms` : `표본 ${sampleCount}개`}
            </div>
            <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginTop: '6px' }}>
              FAST {fastCount} · SLOW {slowCount} · 평균 편차 {averageDeviationMs}ms
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={startMeasurement}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: 'none',
                background: CHART_EDITOR_THEME.ctaButtonGradient,
                color: CHART_EDITOR_THEME.textPrimary,
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {phase === 'ready' || phase === 'complete' ? '보정 곡 시작' : '다시 시작'}
            </button>
            <button
              onClick={() => onApplyTimingOffset(-localMedianOffsetMs)}
              disabled={!canApply}
              style={{
                flex: 1,
                padding: '12px 14px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                background: canApply ? CHART_EDITOR_THEME.success : CHART_EDITOR_THEME.surface,
                color: CHART_EDITOR_THEME.textPrimary,
                fontSize: '14px',
                fontWeight: 700,
                cursor: canApply ? 'pointer' : 'not-allowed',
                opacity: canApply ? 1 : 0.5,
              }}
            >
              측정값 적용
            </button>
          </div>

          <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', lineHeight: 1.7 }}>
            <div>기준 속도: {currentNoteSpeed.toFixed(1)}x</div>
            <div>측정 표본: 최소 8개부터 적용 가능</div>
            <div>판정 기준: 노트 타격 오차 중앙값</div>
          </div>
        </div>
      </div>
    </div>
  );
};
