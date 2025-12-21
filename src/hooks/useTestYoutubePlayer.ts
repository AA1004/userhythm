import { useState, useEffect, useRef, RefObject } from 'react';
import { waitForYouTubeAPI } from '../utils/youtube';
import { getAudioBaseSeconds, getAudioPositionSeconds, AudioSettings } from '../utils/gameHelpers';

export interface UseTestYoutubePlayerOptions {
  isTestMode: boolean;
  gameStarted: boolean;
  currentTime: number;
  videoId: string | null;
  audioSettings: AudioSettings | null;
  externalPlayer?: any | null;
}

export interface UseTestYoutubePlayerReturn {
  playerRef: RefObject<HTMLDivElement>;
  isReady: boolean;
  pause: () => void;
  destroy: () => void;
}

export function useTestYoutubePlayer({
  isTestMode,
  gameStarted,
  currentTime,
  videoId,
  audioSettings,
  externalPlayer,
}: UseTestYoutubePlayerOptions): UseTestYoutubePlayerReturn {
  const [player, setPlayer] = useState<any>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const playerReadyRef = useRef(false);
  const audioHasStartedRef = useRef(false);
  const lastResyncTimeRef = useRef(0);
  const isExternalPlayerRef = useRef(false);

  // External player가 있으면 재사용
  useEffect(() => {
    if (externalPlayer && isTestMode && videoId) {
      setPlayer(externalPlayer);
      playerReadyRef.current = true;
      isExternalPlayerRef.current = true;

      // External player 설정
      if (audioSettings) {
        try {
          const { playbackSpeed } = audioSettings;
          const startTimeSec = getAudioBaseSeconds(audioSettings);
          externalPlayer.setPlaybackRate?.(playbackSpeed);
          externalPlayer.seekTo(startTimeSec, true);
          // 미리듣기에서 볼륨이 낮아져 있을 수 있으므로 100으로 복원
          externalPlayer.setVolume?.(100);
        } catch (e) {
          console.warn('External player 설정 실패:', e);
        }
      }
      return;
    } else {
      isExternalPlayerRef.current = false;
    }
  }, [externalPlayer, isTestMode, videoId, audioSettings]);

  // YouTube 플레이어 초기화
  useEffect(() => {
    if (!isTestMode || !videoId) return;
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
          playerVars: {
            autoplay: 0,
            controls: 0,
            enablejsapi: 1,
          } as any,
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;

              const player = event.target;
              playerReadyRef.current = true;
              setPlayer(player);
              playerInstance = player;

              console.log('✅ 테스트 YouTube 플레이어 준비 완료');
              
              // 플레이어가 준비되면 설정만 하고, 실제 재생은 게임 시작 후에 수행
              setTimeout(() => {
                if (!isCancelled && player && audioSettings) {
                  try {
                    const { playbackSpeed } = audioSettings;
                    const startTimeSec = getAudioBaseSeconds(audioSettings);
                    
                    // 재생 속도 설정
                    player.setPlaybackRate?.(playbackSpeed);
                    
                    // 시작 위치로 이동 (미리 이동)
                    player.seekTo(startTimeSec, true);
                    
                    console.log(`🎵 YouTube 플레이어 준비 완료 (${startTimeSec}초, ${playbackSpeed}x) - 게임 시작 후 재생`);
                  } catch (e) {
                    console.warn('YouTube 플레이어 설정 실패:', e);
                  }
                }
              }, 100);
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
  }, [isTestMode, videoId, audioSettings]);

  // Test mode YouTube audio sync
  useEffect(() => {
    if (!isTestMode || !gameStarted) return;
    if (!player || !playerReadyRef.current) return;
    if (!audioSettings) return;

    const { playbackSpeed } = audioSettings;

    try {
      player.setPlaybackRate?.(playbackSpeed);
    } catch (e) {
      console.warn("YouTube playback speed update failed:", e);
    }

    const cueSeconds = getAudioBaseSeconds(audioSettings);

    if (currentTime < 0) {
      audioHasStartedRef.current = false;
      try {
        player.pauseVideo?.();
        player.seekTo(cueSeconds, true);
      } catch (e) {
        console.warn("YouTube cueing failed:", e);
      }
      return;
    }

    if (!audioHasStartedRef.current) {
      try {
        player.seekTo(cueSeconds, true);
        player.playVideo?.();
        audioHasStartedRef.current = true;
        console.log(`YouTube test playback start (${cueSeconds.toFixed(2)}s)`);
      } catch (e) {
        console.warn("YouTube initial playback failed:", e);
      }
      return;
    }

    const desiredSeconds = getAudioPositionSeconds(currentTime, audioSettings);
    const currentSeconds = player.getCurrentTime?.() ?? 0;
    const now = Date.now();

    // 임계값: 0.5초 이상 차이날 때만 리싱크
    // 쿨다운: 마지막 리싱크 후 2초 이내에는 리싱크하지 않음
    const RESYNC_THRESHOLD = 0.5;
    const RESYNC_COOLDOWN = 2000;

    if (
      Math.abs(currentSeconds - desiredSeconds) > RESYNC_THRESHOLD &&
      now - lastResyncTimeRef.current > RESYNC_COOLDOWN
    ) {
      try {
        player.seekTo(desiredSeconds, true);
        lastResyncTimeRef.current = now;
        console.log(`YouTube resync: ${currentSeconds.toFixed(2)}s → ${desiredSeconds.toFixed(2)}s (차이: ${Math.abs(currentSeconds - desiredSeconds).toFixed(2)}s)`);
      } catch (e) {
        console.warn("YouTube resync failed:", e);
      }
    }
  }, [isTestMode, gameStarted, currentTime, player, audioSettings]);

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
        // External player는 destroy하지 않고 pause만
        if (isExternalPlayerRef.current) {
          player.pauseVideo?.();
        } else {
          player.destroy?.();
        }
      } catch (e) {
        console.warn('테스트 플레이어 정리 실패:', e);
      }
    }
    if (!isExternalPlayerRef.current) {
      setPlayer(null);
      playerReadyRef.current = false;
      if (playerRef.current) {
        playerRef.current.innerHTML = '';
      }
    }
  };

  return {
    playerRef,
    isReady: playerReadyRef.current,
    pause,
    destroy,
  };
}

