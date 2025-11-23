import { useState, useEffect, useRef } from 'react';
import { waitForYouTubeAPI } from '../utils/youtube';

interface TestAudioSettings {
  youtubeVideoId: string | null;
  youtubeUrl: string;
  startTimeMs: number;
  playbackSpeed: number;
}

interface UseTestAudioControllerOptions {
  isTestMode: boolean;
  gameStarted: boolean;
  currentTime: number;
  onReady?: () => void;
}

const BASE_FALL_DURATION = 3000; // 노트 낙하 시간 + 오프셋 (음악을 3초 늦게 시작)

export function useTestAudioController({
  isTestMode,
  gameStarted,
  currentTime,
  onReady,
}: UseTestAudioControllerOptions) {
  const [youtubePlayer, setYoutubePlayer] = useState<any>(null);
  const youtubePlayerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerReadyRef = useRef(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const audioSettingsRef = useRef<TestAudioSettings | null>(null);

  // 오디오 설정 설정
  const setAudioSettings = (settings: TestAudioSettings | null) => {
    audioSettingsRef.current = settings;
    if (settings?.youtubeVideoId) {
      setYoutubeVideoId(settings.youtubeVideoId);
    } else {
      setYoutubeVideoId(null);
    }
  };

  // 플레이어 정리
  const cleanupPlayer = (player: any) => {
    if (player) {
      try {
        if (typeof player.destroy === 'function') {
          player.destroy();
        }
      } catch (e) {
        console.warn('테스트 플레이어 정리 실패:', e);
      }
    }
    setYoutubePlayer(null);
    youtubePlayerReadyRef.current = false;
  };

  // YouTube 플레이어 초기화
  useEffect(() => {
    if (!isTestMode || !youtubeVideoId) return;
    if (!youtubePlayerRef.current) return;

    let playerInstance: any = null;
    let isCancelled = false;

    // 기존 플레이어 정리
    setYoutubePlayer((currentPlayer: any) => {
      if (currentPlayer) {
        cleanupPlayer(currentPlayer);
      }
      return null;
    });
    youtubePlayerReadyRef.current = false;

    waitForYouTubeAPI().then(() => {
      if (isCancelled) return;

      if (!window.YT || !window.YT.Player) {
        console.error('YouTube IFrame API를 로드하지 못했습니다.');
        return;
      }

      const playerElement = youtubePlayerRef.current;
      if (!playerElement || isCancelled) return;

      const videoId = youtubeVideoId;
      if (!videoId) return;

      const playerId = `test-youtube-player-${videoId}`;
      if (playerElement.id !== playerId) {
        playerElement.id = playerId;
      }

      try {
        playerInstance = new window.YT.Player(playerElement.id, {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            enablejsapi: 1,
          } as any,
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;

              const player = event.target;
              youtubePlayerReadyRef.current = true;
              setYoutubePlayer(player);
              playerInstance = player;

              console.log('✅ 테스트 YouTube 플레이어 준비 완료');

              // 플레이어가 준비되면 설정만 하고, 실제 재생은 게임 시작 후에 수행
              setTimeout(() => {
                if (!isCancelled && player && audioSettingsRef.current) {
                  try {
                    const { startTimeMs, playbackSpeed } = audioSettingsRef.current;
                    // 음악을 노트 낙하 시간만큼 늦게 시작 (노트가 판정선에 도달할 때 음악과 맞춤)
                    const startTimeSec = Math.max(0, (startTimeMs - BASE_FALL_DURATION) / 1000);

                    // 재생 속도 설정
                    player.setPlaybackRate?.(playbackSpeed);

                    // 시작 위치로 이동 (미리 이동)
                    player.seekTo(startTimeSec, true);

                    console.log(`🎵 YouTube 플레이어 준비 완료 (${startTimeSec}초, ${playbackSpeed}x) - 게임 시작 후 재생`);
                    onReady?.();
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
        cleanupPlayer(playerInstance);
      }
    };
  }, [isTestMode, youtubeVideoId, onReady]);

  // YouTube 오디오 동기화
  useEffect(() => {
    if (!isTestMode || !gameStarted) return;
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;
    if (!audioSettingsRef.current) return;

    // 게임 시작 시 즉시 재생 시도
    const initialPlayAttempt = setTimeout(() => {
      if (youtubePlayer && youtubePlayerReadyRef.current && audioSettingsRef.current) {
        try {
          const { startTimeMs, playbackSpeed } = audioSettingsRef.current;
          // 음악을 노트 낙하 시간만큼 늦게 시작
          const startTimeSec = Math.max(0, (startTimeMs - BASE_FALL_DURATION) / 1000);

          // 재생 속도 설정
          youtubePlayer.setPlaybackRate?.(playbackSpeed);

          // 시작 위치로 이동
          youtubePlayer.seekTo(startTimeSec, true);

          // 재생 시작
          youtubePlayer.playVideo?.();

          console.log(`🎵 YouTube 플레이어 재생 시작 (게임 시작, ${startTimeSec}초, ${playbackSpeed}x)`);
        } catch (e) {
          console.warn('YouTube 재생 실패:', e);
        }
      }
    }, 50); // 게임 시작 후 50ms 후에 재생 시도

    const syncInterval = setInterval(() => {
      if (!youtubePlayer || !youtubePlayerReadyRef.current) return;

      // 재생 상태 확인 - 항상 재생 중이어야 함
      const playerState = youtubePlayer.getPlayerState?.();
      if (
        typeof window !== 'undefined' &&
        window.YT &&
        playerState !== window.YT.PlayerState.PLAYING
      ) {
        try {
          youtubePlayer.playVideo?.();
          console.log('🎵 YouTube 플레이어 재생 시작 (동기화)');
        } catch (e) {
          console.warn('YouTube 재생 실패:', e);
        }
      }

      // 시간 동기화는 currentTime >= 0일 때만 수행 (게임이 실제로 시작된 후)
      if (currentTime >= 0) {
        // 음악을 노트 낙하 시간만큼 늦게 시작
        const desiredSeconds = Math.max(
          0,
          ((audioSettingsRef.current?.startTimeMs || 0) + currentTime - BASE_FALL_DURATION) / 1000
        );
        const currentSeconds = youtubePlayer.getCurrentTime?.() ?? 0;

        // 차이가 0.1초 이상일 때만 시키기
        if (Math.abs(currentSeconds - desiredSeconds) > 0.1) {
          try {
            youtubePlayer.seekTo(desiredSeconds, true);
            console.log(`⏱️ YouTube 시간 동기화: ${desiredSeconds.toFixed(2)}초`);
          } catch (e) {
            console.warn('YouTube 시간 시키기 실패:', e);
          }
        }
      }
    }, 50); // 50ms마다 동기화

    return () => {
      clearTimeout(initialPlayAttempt);
      clearInterval(syncInterval);
    };
  }, [isTestMode, gameStarted, currentTime, youtubePlayer]);

  // 플레이어 정지
  const pausePlayer = () => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.pauseVideo?.();
      } catch (e) {
        console.warn('YouTube 일시정지 실패:', e);
      }
    }
  };

  // 플레이어 정리
  const destroyPlayer = () => {
    if (youtubePlayer) {
      cleanupPlayer(youtubePlayer);
    }
    setYoutubeVideoId(null);
    audioSettingsRef.current = null;
  };

  return {
    youtubePlayerRef,
    setAudioSettings,
    pausePlayer,
    destroyPlayer,
  };
}
