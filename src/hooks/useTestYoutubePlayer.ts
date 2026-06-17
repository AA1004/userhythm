import { useState, useEffect, useRef, RefObject, MutableRefObject } from 'react';
import { waitForYouTubeAPI, YOUTUBE_EMBED_HOST } from '../utils/youtube';
import { getAudioBaseSeconds, getAudioPositionSeconds, AudioSettings } from '../utils/gameHelpers';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import { PerformanceMode } from '../constants/gameVisualSettings';

export interface UseTestYoutubePlayerOptions {
  audioSessionActive: boolean;
  gameStarted: boolean;
  gameEnded: boolean;
  currentTimeRef: MutableRefObject<number>;
  videoId: string | null;
  audioSettings: AudioSettings | null;
  externalPlayer?: any | null;
  volume?: number; // 0-100
  performanceMode?: PerformanceMode;
  onPlaybackEnded?: () => void;
}

export interface UseTestYoutubePlayerReturn {
  playerRef: RefObject<HTMLDivElement>;
  isReady: boolean;
  pause: () => void;
  destroy: () => void;
}

export function useTestYoutubePlayer({
  audioSessionActive,
  gameStarted,
  gameEnded,
  currentTimeRef,
  videoId,
  audioSettings,
  externalPlayer,
  volume = 100,
  performanceMode = 'balanced',
  onPlaybackEnded,
}: UseTestYoutubePlayerOptions): UseTestYoutubePlayerReturn {
  const [player, setPlayer] = useState<any>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const playerReadyRef = useRef(false);
  const audioHasStartedRef = useRef(false);
  const audioPrewarmedRef = useRef(false);
  const audioPlaybackEndedRef = useRef(false);
  const lastResyncTimeRef = useRef(0);
  const lastCueSeekTimeRef = useRef(0);
  const lastPrewarmAttemptAtRef = useRef(0);
  const lastAudioSyncCheckAtRef = useRef(0);
  const isExternalPlayerRef = useRef(false);
  const latestVolumeRef = useRef(volume);
  const onPlaybackEndedRef = useRef(onPlaybackEnded);

  useEffect(() => {
    latestVolumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    onPlaybackEndedRef.current = onPlaybackEnded;
  }, [onPlaybackEnded]);

  const markPlaybackEnded = () => {
    if (audioPlaybackEndedRef.current) return;
    audioHasStartedRef.current = false;
    audioPrewarmedRef.current = false;
    audioPlaybackEndedRef.current = true;
    onPlaybackEndedRef.current?.();
  };

  // External player가 있으면 재사용
  useEffect(() => {
    if (externalPlayer && audioSessionActive && videoId) {
      setPlayer(externalPlayer);
      playerReadyRef.current = true;
      isExternalPlayerRef.current = true;
      // 새 게임 시작이므로 오디오 상태 리셋
      audioHasStartedRef.current = false;
      audioPrewarmedRef.current = false;
      audioPlaybackEndedRef.current = false;
      lastPrewarmAttemptAtRef.current = 0;

      // External player 설정
      if (audioSettings) {
        try {
          const { playbackSpeed } = audioSettings;
          const startTimeSec = getAudioBaseSeconds(audioSettings);
          externalPlayer.mute?.();
          externalPlayer.pauseVideo?.();
          externalPlayer.setPlaybackRate?.(playbackSpeed);
          externalPlayer.seekTo(startTimeSec, true);
          externalPlayer.setVolume?.(volume);
        } catch (e) {
          console.warn('External player 설정 실패:', e);
        }
      }
      return;
    } else {
      isExternalPlayerRef.current = false;
    }
  }, [externalPlayer, audioSessionActive, videoId, audioSettings, volume]);

  // YouTube 플레이어 초기화
  useEffect(() => {
    if (!audioSessionActive || !videoId) return;
    if (externalPlayer && isExternalPlayerRef.current) return; // External player 사용 중이면 skip
    if (!playerRef.current) return;

    let playerInstance: any = null;
    let isCancelled = false;

    const cleanup = (playerInstance: any) => {
      if (playerInstance) {
        try {
          if (typeof playerInstance.destroy === 'function') {
            playerInstance.destroy();
          }
        } catch (e) {
          console.warn('테스트 플레이어 정리 실패:', e);
        }
      }
      setPlayer(null);
      playerReadyRef.current = false;
    };

    // 기존 플레이어 정리
    setPlayer((currentPlayer: any) => {
      if (currentPlayer) {
        cleanup(currentPlayer);
      }
      return null;
    });
    playerReadyRef.current = false;
    // 새 게임 시작이므로 오디오 상태 리셋
    audioHasStartedRef.current = false;
    audioPrewarmedRef.current = false;
    audioPlaybackEndedRef.current = false;
    lastCueSeekTimeRef.current = 0;
    lastPrewarmAttemptAtRef.current = 0;
    lastResyncTimeRef.current = 0;
    lastAudioSyncCheckAtRef.current = 0;

    waitForYouTubeAPI().then(() => {
      if (isCancelled) return;

      if (!window.YT || !window.YT.Player) {
        console.error('YouTube IFrame API를 로드하지 못했습니다.');
        return;
      }

      const playerElement = playerRef.current;
      if (!playerElement || isCancelled) return;

      const videoIdValue = videoId;
      if (!videoIdValue) return;

      const playerId = `test-youtube-player-${videoIdValue}`;
      // React 관리 노드가 교체되지 않도록 내부 마운트 노드에만 YouTube를 주입
      const mountNode = document.createElement('div');
      mountNode.id = `${playerId}-mount`;
      playerElement.innerHTML = '';
      playerElement.appendChild(mountNode);

      try {
        playerInstance = new window.YT.Player(mountNode as any, {
          videoId: videoIdValue,
          host: YOUTUBE_EMBED_HOST,
          playerVars: {
            autoplay: 0,
            controls: 0,
            mute: 1,
            enablejsapi: 1,
            rel: 0,
            playsinline: 1,
            fs: 0,
            disablekb: 1,
            iv_load_policy: 3,
            modestbranding: 1,
          } as any,
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;

              const player = event.target;
              playerReadyRef.current = true;
              setPlayer(player);
              playerInstance = player;

              console.log('✅ 테스트 YouTube 플레이어 준비 완료');

              if (audioSettings) {
                try {
                  const { playbackSpeed } = audioSettings;
                  const cueSeconds = getAudioBaseSeconds(audioSettings);
                  player.mute?.();
                  player.pauseVideo?.();
                  player.setVolume?.(latestVolumeRef.current);
                  player.setPlaybackRate?.(playbackSpeed);
                  player.seekTo(cueSeconds, true);
                } catch (e) {
                  console.warn('YouTube 플레이어 초기 큐 설정 실패:', e);
                }
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;
              if (event.data !== window.YT?.PlayerState?.ENDED) return;
              markPlaybackEnded();
              try {
                event.target.mute?.();
                event.target.pauseVideo?.();
              } catch {
                // ignore
              }
            },
          },
        });
      } catch (e) {
        console.error('테스트 플레이어 생성 실패:', e);
      }
    });

    return () => {
      isCancelled = true;
      if (playerInstance) {
        cleanup(playerInstance);
      }
      if (playerRef.current) {
        playerRef.current.innerHTML = '';
      }
    };
  }, [audioSessionActive, videoId, audioSettings, externalPlayer]);

  // Gameplay YouTube audio sync.
  // Keep this off React's visual clock path; currentTimeRef is the gameplay source time.
  useEffect(() => {
    if (!player || !playerReadyRef.current) return;

    if (!audioSessionActive || !gameStarted || gameEnded || !audioSettings) {
      try {
        audioHasStartedRef.current = false;
        audioPrewarmedRef.current = false;
        audioPlaybackEndedRef.current = false;
        player.pauseVideo?.();
      } catch (e) {
        console.warn("YouTube stop on inactive session failed:", e);
      }
      return;
    }

    const { playbackSpeed } = audioSettings;

    try {
      player.setPlaybackRate?.(playbackSpeed);
    } catch (e) {
      console.warn("YouTube playback speed update failed:", e);
    }

    const cueSeconds = getAudioBaseSeconds(audioSettings);
    let timerId: number | null = null;
    let cancelled = false;

    const syncOnce = () => {
      const shouldProfile = isGameplayProfilerEnabled();
      const syncStart = shouldProfile ? performance.now() : 0;
      const currentTime = currentTimeRef.current;

      if (currentTime < 0) {
        audioHasStartedRef.current = false;
        audioPlaybackEndedRef.current = false;
        try {
          const now = Date.now();
          if (!audioPrewarmedRef.current && now - lastPrewarmAttemptAtRef.current > 350) {
            lastPrewarmAttemptAtRef.current = now;
            player.mute?.();
            player.setVolume?.(latestVolumeRef.current);
            player.setPlaybackRate?.(playbackSpeed);
            player.seekTo(cueSeconds, true);
            player.playVideo?.();
            audioPrewarmedRef.current = true;
            lastCueSeekTimeRef.current = now;
          }
        } catch (e) {
          audioPrewarmedRef.current = false;
          console.warn("YouTube prewarm failed:", e);
        }
        if (shouldProfile) {
          recordGameplayMetric('audioSync', performance.now() - syncStart, 0);
        }
        return;
      }

      if (audioPlaybackEndedRef.current) {
        if (shouldProfile) {
          recordGameplayMetric('audioSync', performance.now() - syncStart, 0);
        }
        return;
      }

      const durationSeconds = player.getDuration?.() ?? 0;
      const desiredSeconds = getAudioPositionSeconds(currentTime, audioSettings);
      const hasKnownDuration = Number.isFinite(durationSeconds) && durationSeconds > 0.5;
      if (hasKnownDuration && desiredSeconds >= durationSeconds - 0.12) {
        try {
          player.mute?.();
          player.pauseVideo?.();
        } catch (e) {
          console.warn("YouTube stop at media end failed:", e);
        }
        audioHasStartedRef.current = false;
        audioPrewarmedRef.current = false;
        markPlaybackEnded();
        if (shouldProfile) {
          recordGameplayMetric('audioSync', performance.now() - syncStart, durationSeconds);
        }
        return;
      }

      if (!audioHasStartedRef.current) {
        try {
          // 미리듣기에서 볼륨이 낮아져 있을 수 있으므로 설정 볼륨으로 복원하고 음소거 해제
          player.unMute?.();
          player.setVolume?.(latestVolumeRef.current);
          player.seekTo(desiredSeconds, true);
          player.playVideo?.();
          audioHasStartedRef.current = true;
          audioPrewarmedRef.current = false;
          lastCueSeekTimeRef.current = Date.now();
          console.log(
            `YouTube test playback start (${desiredSeconds.toFixed(2)}s, volume: ${latestVolumeRef.current})`
          );
        } catch (e) {
          console.warn("YouTube initial playback failed:", e);
        }
        if (shouldProfile) {
          recordGameplayMetric('audioSync', performance.now() - syncStart, 1);
        }
        return;
      }

      const now = Date.now();
      const syncCheckIntervalMs =
        performanceMode === 'performance' ? 1500 : performanceMode === 'quality' ? 850 : 1200;
      if (now - lastAudioSyncCheckAtRef.current < syncCheckIntervalMs) {
        if (shouldProfile) {
          recordGameplayMetric('audioSync', performance.now() - syncStart, 0);
        }
        return;
      }
      lastAudioSyncCheckAtRef.current = now;

      const currentSeconds = player.getCurrentTime?.() ?? 0;
      const playerState = player.getPlayerState?.();

      if (playerState !== window.YT?.PlayerState?.PLAYING) {
        try {
          player.playVideo?.();
        } catch (e) {
          console.warn("YouTube resume failed:", e);
        }
      }

      // 임계값: 0.5초 이상 차이날 때만 리싱크
      // 쿨다운: 마지막 리싱크 후 2초 이내에는 리싱크하지 않음
      const RESYNC_THRESHOLD =
        performanceMode === 'performance' ? 0.8 : performanceMode === 'quality' ? 0.5 : 0.65;
      const RESYNC_COOLDOWN =
        performanceMode === 'performance' ? 2800 : performanceMode === 'quality' ? 2000 : 2400;

      if (
        Math.abs(currentSeconds - desiredSeconds) > RESYNC_THRESHOLD &&
        now - lastResyncTimeRef.current > RESYNC_COOLDOWN
      ) {
        try {
          player.seekTo(desiredSeconds, true);
          lastResyncTimeRef.current = now;
          console.log(`YouTube resync: ${currentSeconds.toFixed(2)}s -> ${desiredSeconds.toFixed(2)}s (diff: ${Math.abs(currentSeconds - desiredSeconds).toFixed(2)}s)`);
        } catch (e) {
          console.warn("YouTube resync failed:", e);
        }
      }
      if (shouldProfile) {
        recordGameplayMetric('audioSync', performance.now() - syncStart, Math.abs(currentSeconds - desiredSeconds));
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      const currentTime = currentTimeRef.current;
      const delayMs =
        currentTime < 250 || !audioHasStartedRef.current
          ? 33
          : performanceMode === 'performance'
          ? 1600
          : performanceMode === 'quality'
          ? 1000
          : 1300;
      timerId = window.setTimeout(() => {
        syncOnce();
        scheduleNext();
      }, delayMs);
    };

    syncOnce();
    scheduleNext();
    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [audioSessionActive, gameStarted, gameEnded, currentTimeRef, player, audioSettings, performanceMode]);

  // 볼륨 변경 시 실시간 반영
  useEffect(() => {
    if (!player || !playerReadyRef.current) return;
    try {
      player.setVolume?.(volume);
    } catch (e) {
      console.warn("YouTube volume update failed:", e);
    }
  }, [player, volume]);

  const pause = () => {
    if (player && playerReadyRef.current) {
      try {
        player.pauseVideo?.();
      } catch (e) {
        console.warn('YouTube 일시정지 실패:', e);
      }
    }
  };

  const destroy = () => {
    if (player) {
      try {
        // External player도 세션 꼬임 방지를 위해 최종적으로 destroy까지 수행
        // (ChartSelect -> Game handoff 동안에는 ChartSelect가 destroy하지 않음)
        player.pauseVideo?.();
        player.destroy?.();
      } catch (e) {
        console.warn('테스트 플레이어 정리 실패:', e);
      }
    }
    setPlayer(null);
    playerReadyRef.current = false;
    isExternalPlayerRef.current = false;
    if (playerRef.current) {
      playerRef.current.innerHTML = '';
    }
  };

  return {
    playerRef,
    isReady: playerReadyRef.current,
    pause,
    destroy,
  };
}

