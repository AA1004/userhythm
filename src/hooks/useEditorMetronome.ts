import { useCallback, useEffect, useRef } from 'react';
import type { BPMChange } from '../types/game';
import { beatIndexToTime, timeToBeatIndex } from '../utils/bpmUtils';

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_MS = 80;
const SEEK_RESET_THRESHOLD_MS = 80;
const START_BEAT_TOLERANCE_MS = 24;
const MAX_BEATS_PER_TICK = 16;

interface UseEditorMetronomeOptions {
  enabled: boolean;
  volume: number;
  isPlaying: boolean;
  currentTimeRef: React.MutableRefObject<number>;
  playbackSpeed: number;
  bpm: number;
  bpmChanges: BPMChange[];
  beatsPerMeasure: number;
  timeSignatureOffset: number;
  ensureAudioContext: () => Promise<AudioContext | null>;
}

interface ScheduledClick {
  oscillator: OscillatorNode;
  envelope: GainNode;
}

const positiveModulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

export function useEditorMetronome({
  enabled,
  volume,
  isPlaying,
  currentTimeRef,
  playbackSpeed,
  bpm,
  bpmChanges,
  beatsPerMeasure,
  timeSignatureOffset,
  ensureAudioContext,
}: UseEditorMetronomeOptions) {
  const outputGainRef = useRef<GainNode | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const scheduledClicksRef = useRef<Set<ScheduledClick>>(new Set());
  const volumeRef = useRef(volume);

  const cancelScheduledClicks = useCallback(() => {
    for (const click of scheduledClicksRef.current) {
      click.oscillator.onended = null;
      try {
        click.oscillator.stop();
      } catch {
        // The source may already have finished.
      }
      try {
        click.oscillator.disconnect();
        click.envelope.disconnect();
      } catch {
        // Cleanup must not interrupt editor playback.
      }
    }
    scheduledClicksRef.current.clear();
  }, []);

  const ensureOutputGain = useCallback((context: AudioContext) => {
    if (outputContextRef.current === context && outputGainRef.current) {
      return outputGainRef.current;
    }

    try {
      outputGainRef.current?.disconnect();
    } catch {
      // Ignore stale context cleanup failures.
    }

    const gain = context.createGain();
    gain.gain.setValueAtTime(Math.max(0, Math.min(1, volumeRef.current / 100)), context.currentTime);
    gain.connect(context.destination);
    outputContextRef.current = context;
    outputGainRef.current = gain;
    return gain;
  }, []);

  useEffect(() => {
    volumeRef.current = volume;
    const context = outputContextRef.current;
    const gain = outputGainRef.current;
    if (!context || !gain) return;
    gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume / 100)), context.currentTime, 0.01);
  }, [volume]);

  useEffect(() => {
    if (!enabled || !isPlaying || playbackSpeed <= 0 || bpm <= 0) {
      cancelScheduledClicks();
      return;
    }

    let disposed = false;
    let schedulerId: number | null = null;
    let nextBeatIndex = 0;
    let clockAnchorTimelineTime = currentTimeRef.current;
    let clockAnchorTimestamp = performance.now();
    let previousObservedTimelineTime = currentTimeRef.current;
    let lastImmediateBeatIndex: number | null = null;

    const beatTimeAt = (beatIndex: number) =>
      timeSignatureOffset + beatIndexToTime(beatIndex, bpm, bpmChanges);

    const resetCursor = (timelineTime: number) => {
      cancelScheduledClicks();
      const beatPosition = timeToBeatIndex(timelineTime - timeSignatureOffset, bpm, bpmChanges);
      const nearestBeat = Math.round(beatPosition);
      const nearestBeatTime = beatTimeAt(nearestBeat);
      nextBeatIndex =
        Math.abs(nearestBeatTime - timelineTime) <= START_BEAT_TOLERANCE_MS
          ? nearestBeat
          : Math.ceil(beatPosition - 1e-7);
      clockAnchorTimelineTime = timelineTime;
      clockAnchorTimestamp = performance.now();
      previousObservedTimelineTime = timelineTime;
    };

    const start = async () => {
      const context = await ensureAudioContext();
      if (disposed || !context) return;
      const outputGain = ensureOutputGain(context);
      resetCursor(currentTimeRef.current);

      const scheduleClick = (beatIndex: number, chartTime: number, timelineTime: number) => {
        const isImmediateBeat = chartTime <= timelineTime + 1;
        if (
          volumeRef.current <= 0 ||
          (isImmediateBeat && lastImmediateBeatIndex === beatIndex)
        ) {
          return;
        }
        if (isImmediateBeat) lastImmediateBeatIndex = beatIndex;
        const isAccent = positiveModulo(beatIndex, Math.max(1, beatsPerMeasure)) === 0;
        const when = context.currentTime + Math.max(0, (chartTime - timelineTime) / 1000 / playbackSpeed);
        const duration = isAccent ? 0.04 : 0.028;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const click: ScheduledClick = { oscillator, envelope };

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(isAccent ? 1760 : 1120, when);
        envelope.gain.setValueAtTime(isAccent ? 0.42 : 0.26, when);
        envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        oscillator.connect(envelope).connect(outputGain);
        oscillator.onended = () => {
          scheduledClicksRef.current.delete(click);
          try {
            oscillator.disconnect();
            envelope.disconnect();
          } catch {
            // Ignore cleanup after normal completion.
          }
        };
        scheduledClicksRef.current.add(click);
        oscillator.start(when);
        oscillator.stop(when + duration);
      };

      const runScheduler = () => {
        if (disposed) return;
        const now = performance.now();
        const timelineTime = currentTimeRef.current;
        const expectedTime =
          clockAnchorTimelineTime + (now - clockAnchorTimestamp) * playbackSpeed;
        const movedBackward =
          timelineTime < previousObservedTimelineTime - START_BEAT_TOLERANCE_MS;
        const didSeek =
          movedBackward ||
          Math.abs(timelineTime - expectedTime) > SEEK_RESET_THRESHOLD_MS;

        if (didSeek) {
          if (movedBackward) lastImmediateBeatIndex = null;
          resetCursor(timelineTime);
        }
        previousObservedTimelineTime = timelineTime;

        const horizon = timelineTime + LOOKAHEAD_MS * playbackSpeed;
        let scheduledCount = 0;
        while (scheduledCount < MAX_BEATS_PER_TICK) {
          const beatTime = beatTimeAt(nextBeatIndex);
          if (beatTime > horizon) break;
          if (beatTime >= timelineTime - START_BEAT_TOLERANCE_MS) {
            scheduleClick(nextBeatIndex, beatTime, timelineTime);
          }
          nextBeatIndex += 1;
          scheduledCount += 1;
        }
      };

      runScheduler();
      schedulerId = window.setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
    };

    void start();
    return () => {
      disposed = true;
      if (schedulerId !== null) window.clearInterval(schedulerId);
      cancelScheduledClicks();
    };
  }, [
    beatsPerMeasure,
    bpm,
    bpmChanges,
    cancelScheduledClicks,
    currentTimeRef,
    enabled,
    ensureAudioContext,
    ensureOutputGain,
    isPlaying,
    playbackSpeed,
    timeSignatureOffset,
  ]);

  useEffect(
    () => () => {
      cancelScheduledClicks();
      try {
        outputGainRef.current?.disconnect();
      } catch {
        // Ignore teardown failures.
      }
      outputGainRef.current = null;
      outputContextRef.current = null;
    },
    [cancelScheduledClicks]
  );
}
