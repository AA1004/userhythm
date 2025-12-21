import { useRef, useCallback, useEffect } from 'react';

export interface UseHitSoundReturn {
  /** 키음 재생 */
  play: () => void;
  /** 볼륨 설정 (0-100) */
  setVolume: (volume: number) => void;
  /** 오디오 컨텍스트 초기화 (사용자 인터랙션 후 호출) */
  ensureContext: () => Promise<AudioContext | null>;
}

/**
 * 키음(히트 사운드) 재생을 위한 훅
 * 노이즈 기반 드럼/클릭 사운드 생성
 *
 * @param initialVolume 초기 볼륨 (0-100)
 *
 * @example
 * const hitSound = useHitSound(50);
 *
 * // 사용자 인터랙션 후 컨텍스트 초기화
 * await hitSound.ensureContext();
 *
 * // 키음 재생
 * hitSound.play();
 */
export function useHitSound(initialVolume: number = 50): UseHitSoundReturn {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hitGainRef = useRef<GainNode | null>(null);
  const hitSoundBufferRef = useRef<AudioBuffer | null>(null);
  const volumeRef = useRef(initialVolume);

  // 오디오 컨텍스트 초기화
  const ensureContext = useCallback(async (): Promise<AudioContext | null> => {
    if (typeof window === 'undefined') return null;

    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioCtxRef.current) {
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, volumeRef.current / 100));
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      hitGainRef.current = gain;
    }

    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ignore resume errors
      }
    }

    return audioCtxRef.current ?? null;
  }, []);

  // 볼륨 설정
  const setVolume = useCallback((volume: number) => {
    volumeRef.current = volume;
    const ctx = audioCtxRef.current;
    const gain = hitGainRef.current;
    if (!ctx || !gain) return;
    const value = Math.max(0, Math.min(1, volume / 100));
    gain.gain.setValueAtTime(value, ctx.currentTime);
  }, []);

  // 키음 재생
  const play = useCallback(() => {
    const ctx = audioCtxRef.current;
    const masterGain = hitGainRef.current;
    if (!ctx || !masterGain) return;

    // 컨텍스트가 중지된 경우 재개 시도 (비동기지만 재생에는 영향 없음)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const duration = 0.1;

    // 노이즈 버퍼가 없으면 한 번만 생성
    if (!hitSoundBufferRef.current) {
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) {
        const env = Math.exp(-i / (bufferSize * 0.4));
        data[i] = (Math.random() * 2 - 1) * env;
      }
      hitSoundBufferRef.current = noiseBuffer;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = hitSoundBufferRef.current;

    // 대역 통과 필터로 중고역만 살려서 울림 없는 드럼/클릭 느낌
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.Q.setValueAtTime(0.9, now);

    const envGain = ctx.createGain();
    const baseLevel = Math.max(0.0001, masterGain.gain.value * 0.6);
    envGain.gain.setValueAtTime(baseLevel, now);
    envGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, baseLevel * 0.04),
      now + duration
    );

    noiseSource.connect(filter).connect(envGain).connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + duration);

    noiseSource.onended = () => {
      try {
        noiseSource.disconnect();
        filter.disconnect();
        envGain.disconnect();
      } catch {
        // ignore
      }
    };
  }, []);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch {
          // ignore
        }
        audioCtxRef.current = null;
        hitGainRef.current = null;
        hitSoundBufferRef.current = null;
      }
    };
  }, []);

  return {
    play,
    setVolume,
    ensureContext,
  };
}
