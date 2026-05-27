import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { getKeyBindingFromInput } from '../utils/keyBinding';

interface CalibrationGameProps {
  keyBindings: string[];
  currentOffsetMs: number;
  onApplyOffset: (offsetMs: number) => void;
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
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};

const meanAbs = (values: number[], center: number) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + Math.abs(value - center), 0) / values.length;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const CalibrationGame: React.FC<CalibrationGameProps> = ({
  keyBindings,
  currentOffsetMs,
  onApplyOffset,
  onClose,
}) => {
  const [phase, setPhase] = useState<Phase>('ready');
  const [displayBeat, setDisplayBeat] = useState(0);
  const [samples, setSamples] = useState<number[]>([]);
  const [appliedOffsetMs, setAppliedOffsetMs] = useState<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef(0);
  const sampleSetRef = useRef<number[]>([]);
  const hitBeatSetRef = useRef<Set<number>>(new Set());
  const timerIdsRef = useRef<number[]>([]);
  const activeRef = useRef(false);

  const allowedKeys = useMemo(() => new Set(keyBindings.map((key) => key.toUpperCase())), [keyBindings]);

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

  const finishMeasurement = useCallback(() => {
    activeRef.current = false;
    setPhase('complete');
    setSamples([...sampleSetRef.current]);
  }, []);

  const startMeasurement = useCallback(async () => {
    clearTimers();
    sampleSetRef.current = [];
    hitBeatSetRef.current = new Set();
    setSamples([]);
    setAppliedOffsetMs(null);
    setDisplayBeat(0);

    const audioContext = await ensureAudioContext();
    if (!audioContext) {
      return;
    }

    const now = performance.now();
    startTimeRef.current = now + 800;
    activeRef.current = true;
    setPhase('countdown');

    for (let beatIndex = 0; beatIndex < COUNT_IN_BEATS + MEASURE_BEATS; beatIndex += 1) {
      const delay = 800 + beatIndex * BEAT_INTERVAL_MS;
      const timerId = window.setTimeout(() => {
        if (!activeRef.current) return;
        playClick(beatIndex % 4 === 0);
        if (beatIndex < COUNT_IN_BEATS) {
          setDisplayBeat(COUNT_IN_BEATS - beatIndex);
          setPhase('countdown');
        } else {
          setDisplayBeat(beatIndex - COUNT_IN_BEATS + 1);
          setPhase('measuring');
        }
      }, delay);
      timerIdsRef.current.push(timerId);
    }

    const finishDelay = 800 + (COUNT_IN_BEATS + MEASURE_BEATS) * BEAT_INTERVAL_MS + 120;
    timerIdsRef.current.push(window.setTimeout(finishMeasurement, finishDelay));
  }, [clearTimers, ensureAudioContext, finishMeasurement, playClick]);

  const recommendedOffsetMs = useMemo(
    () => Math.round(median(samples)),
    [samples]
  );
  const averageDeviationMs = useMemo(
    () => Math.round(meanAbs(samples, recommendedOffsetMs)),
    [samples, recommendedOffsetMs]
  );
  const fastCount = useMemo(() => samples.filter((sample) => sample < 0).length, [samples]);
  const slowCount = useMemo(() => samples.filter((sample) => sample > 0).length, [samples]);
  const maxSampleMagnitude = useMemo(
    () => Math.max(HIT_WINDOW_MS, ...samples.map((sample) => Math.abs(sample))),
    [samples]
  );

  const handleApply = useCallback(() => {
    onApplyOffset(recommendedOffsetMs);
    setAppliedOffsetMs(recommendedOffsetMs);
  }, [onApplyOffset, recommendedOffsetMs]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current || phase === 'ready' || phase === 'complete') return;
      const key = getKeyBindingFromInput(event);
      if (!key || !allowedKeys.has(key)) return;
      event.preventDefault();

      const now = performance.now();
      const measureStart = startTimeRef.current + COUNT_IN_BEATS * BEAT_INTERVAL_MS;
      const beatIndex = Math.round((now - measureStart) / BEAT_INTERVAL_MS);
      if (beatIndex < 0 || beatIndex >= MEASURE_BEATS) return;
      if (hitBeatSetRef.current.has(beatIndex)) return;

      const expectedTime = measureStart + beatIndex * BEAT_INTERVAL_MS;
      const delta = now - expectedTime;
      if (Math.abs(delta) > HIT_WINDOW_MS) return;

      hitBeatSetRef.current.add(beatIndex);
      sampleSetRef.current = [...sampleSetRef.current, delta];
      setSamples([...sampleSetRef.current]);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [allowedKeys, onClose, phase]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearTimers();
      void audioContextRef.current?.close();
    };
  }, [clearTimers]);

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
            클릭 소리에 맞춰 {MEASURE_BEATS}번 입력합니다. 현재 보정값: {currentOffsetMs}ms
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
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 520px) minmax(320px, 420px)',
          gap: '24px',
          padding: '32px',
          alignItems: 'stretch',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            borderRadius: CHART_EDITOR_THEME.radiusLg,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            background: CHART_EDITOR_THEME.surfaceElevated,
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                width: '220px',
                height: '220px',
                margin: '8px auto 24px',
                borderRadius: '50%',
                border: `2px solid ${phase === 'measuring' ? CHART_EDITOR_THEME.accent : CHART_EDITOR_THEME.borderSubtle}`,
                boxShadow: phase === 'measuring' ? `0 0 32px ${CHART_EDITOR_THEME.accentSoft}` : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: CHART_EDITOR_THEME.textPrimary,
                fontSize: phase === 'countdown' ? '72px' : '56px',
                fontWeight: 800,
              }}
            >
              {phase === 'ready' ? '준비' : phase === 'complete' ? '완료' : displayBeat}
            </div>

            <p style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '18px', textAlign: 'center', margin: 0 }}>
              {phase === 'ready' && '시작을 누른 뒤 박자에 맞춰 입력'}
              {phase === 'countdown' && '카운트인을 듣고 준비'}
              {phase === 'measuring' && '아무 레인 키로나 박자를 맞춰 입력'}
              {phase === 'complete' && '측정이 끝났습니다'}
            </p>
            <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '13px', textAlign: 'center', margin: '8px 0 0' }}>
              사용 키: {keyBindings.join(' / ')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={startMeasurement}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                border: 'none',
                background: CHART_EDITOR_THEME.ctaButtonGradient,
                color: CHART_EDITOR_THEME.textPrimary,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {phase === 'complete' ? '다시 측정' : '측정 시작'}
            </button>
            <button
              onClick={handleApply}
              disabled={samples.length < 8}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                background: samples.length >= 8 ? CHART_EDITOR_THEME.accentSoft : CHART_EDITOR_THEME.surface,
                color: CHART_EDITOR_THEME.textPrimary,
                fontWeight: 700,
                cursor: samples.length >= 8 ? 'pointer' : 'not-allowed',
                opacity: samples.length >= 8 ? 1 : 0.5,
              }}
            >
              추천값 적용
            </button>
          </div>
        </div>

        <div
          style={{
            borderRadius: CHART_EDITOR_THEME.radiusLg,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            background: CHART_EDITOR_THEME.surfaceElevated,
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div>
            <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', marginBottom: '6px' }}>추천 보정값</div>
            <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '42px', fontWeight: 800 }}>
              {samples.length > 0 ? `${recommendedOffsetMs > 0 ? '+' : ''}${recommendedOffsetMs}ms` : '--'}
            </div>
            <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px', margin: '6px 0 0' }}>
              플러스는 판정을 늦추고, 마이너스는 판정을 앞당깁니다.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <MetricCard label="샘플 수" value={`${samples.length}/${MEASURE_BEATS}`} />
            <MetricCard label="평균 편차" value={samples.length > 0 ? `${averageDeviationMs}ms` : '--'} />
            <MetricCard label="FAST" value={String(fastCount)} />
            <MetricCard label="SLOW" value={String(slowCount)} />
          </div>

          <div
            style={{
              padding: '14px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              background: CHART_EDITOR_THEME.surface,
            }}
          >
            <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontWeight: 700, marginBottom: '10px' }}>
              FAST / SLOW 분포
            </div>
            <div style={{ display: 'flex', height: '14px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
              <div
                style={{
                  width: `${samples.length > 0 ? (fastCount / samples.length) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, rgba(56,189,248,0.75), rgba(59,130,246,0.9))',
                }}
              />
              <div
                style={{
                  width: `${samples.length > 0 ? (slowCount / samples.length) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, rgba(251,146,60,0.8), rgba(239,68,68,0.9))',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: CHART_EDITOR_THEME.textSecondary,
                fontSize: '11px',
                marginTop: '8px',
              }}
            >
              <span>FAST {fastCount}</span>
              <span>SLOW {slowCount}</span>
            </div>
          </div>

          <div
            style={{
              padding: '14px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              background: CHART_EDITOR_THEME.surface,
            }}
          >
            <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontWeight: 700, marginBottom: '10px' }}>
              타점 흐름
            </div>
            <div
              style={{
                position: 'relative',
                height: '146px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                overflow: 'hidden',
                background: 'linear-gradient(180deg, rgba(11,17,32,0.92), rgba(8,12,24,0.76))',
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  background: 'rgba(255,255,255,0.28)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '50%',
                  height: '1px',
                  background: 'rgba(255,255,255,0.08)',
                }}
              />
              {samples.map((sample, index) => {
                const x = clamp(((sample + maxSampleMagnitude) / (maxSampleMagnitude * 2)) * 100, 0, 100);
                const y = clamp(((index + 1) / (MEASURE_BEATS + 1)) * 100, 8, 92);
                const isFast = sample < 0;
                return (
                  <div
                    key={`${index}-${sample}`}
                    style={{
                      position: 'absolute',
                      left: `calc(${x}% - 5px)`,
                      top: `calc(${y}% - 5px)`,
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: isFast ? '#38bdf8' : sample > 0 ? '#fb923c' : '#e5e7eb',
                      boxShadow: `0 0 10px ${isFast ? 'rgba(56,189,248,0.65)' : sample > 0 ? 'rgba(251,146,60,0.65)' : 'rgba(229,231,235,0.55)'}`,
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: CHART_EDITOR_THEME.textSecondary,
                fontSize: '11px',
                marginTop: '8px',
              }}
            >
              <span>FAST</span>
              <span>정중앙</span>
              <span>SLOW</span>
            </div>
          </div>

          <div
            style={{
              padding: '14px',
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              background: CHART_EDITOR_THEME.surface,
            }}
          >
            <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontWeight: 700, marginBottom: '8px' }}>판정</div>
            <p style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '13px', margin: 0, lineHeight: 1.6 }}>
              {samples.length < 8
                ? '표본이 적습니다. 최소 8타 이상 입력해야 추천값을 적용하는 편이 안전합니다.'
                : averageDeviationMs <= 20
                ? '측정 안정도가 높습니다. 바로 적용해도 됩니다.'
                : averageDeviationMs <= 40
                ? '측정은 가능하지만 편차가 있습니다. 한 번 더 돌려보는 편이 낫습니다.'
                : '편차가 큽니다. 박자를 더 안정적으로 맞춘 뒤 다시 측정하는 편이 낫습니다.'}
            </p>
          </div>

          {appliedOffsetMs !== null && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                border: `1px solid ${CHART_EDITOR_THEME.success}`,
                color: CHART_EDITOR_THEME.textPrimary,
                background: 'rgba(45, 212, 191, 0.08)',
                fontSize: '13px',
              }}
            >
              {appliedOffsetMs > 0 ? '+' : ''}{appliedOffsetMs}ms 적용 완료
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      padding: '14px',
      borderRadius: CHART_EDITOR_THEME.radiusMd,
      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
      background: CHART_EDITOR_THEME.surface,
    }}
  >
    <div style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '11px', marginBottom: '6px' }}>{label}</div>
    <div style={{ color: CHART_EDITOR_THEME.textPrimary, fontSize: '24px', fontWeight: 800 }}>{value}</div>
  </div>
);
