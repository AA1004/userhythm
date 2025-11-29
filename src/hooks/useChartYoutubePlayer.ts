import { useState, useRef, useEffect, useCallback } from 'react';
import { extractYouTubeVideoId, waitForYouTubeAPI, getYouTubeVideoDuration } from '../utils/youtube';

interface UseChartYoutubePlayerOptions {
  currentTime: number;
  setCurrentTime: (time: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  volume: number;
  isDraggingPlayhead: boolean;
}

/**
 * YouTube 플레이어 관리 커스텀 훅
 * 플레이어 초기화, 재생 제어, 비디오 길이 로딩 등을 담당
 */
export function useChartYoutubePlayer({
  currentTime,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  volume,
  isDraggingPlayhead,
}: UseChartYoutubePlayerOptions) {
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubePlayer, setYoutubePlayer] = useState<any>(null);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(null);
  const [isLoadingDuration, setIsLoadingDuration] = useState<boolean>(false);

  const youtubePlayerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerReadyRef = useRef(false);
  const lastSyncTimeRef = useRef(0);

  // YouTube URL에서 Video ID 추출
  useEffect(() => {
    if (!youtubeUrl) {
      setYoutubeVideoId(null);
      return;
    }

    const videoId = extractYouTubeVideoId(youtubeUrl);
    setYoutubeVideoId(videoId);
  }, [youtubeUrl]);

  // 비디오 길이 로딩
  useEffect(() => {
    if (!youtubeVideoId) {
      setVideoDurationSeconds(null);
      return;
    }

    setIsLoadingDuration(true);
    getYouTubeVideoDuration(youtubeVideoId)
      .then((duration) => {
        setVideoDurationSeconds(duration);
        setIsLoadingDuration(false);
      })
      .catch(() => {
        setIsLoadingDuration(false);
      });
  }, [youtubeVideoId]);

  // YouTube 플레이어 초기화
  useEffect(() => {
    if (!youtubeVideoId || !youtubePlayerRef.current) return;

    let playerInstance: any = null;
    let isCancelled = false;

    const cleanup = (player: any) => {
      if (player) {
        try {
          if (typeof player.destroy === 'function') {
            player.destroy();
          }
        } catch (e) {
          console.warn('YouTube 플레이어 정리 실패:', e);
        }
      }
      youtubePlayerReadyRef.current = false;
    };

    // 기존 플레이어 정리
    setYoutubePlayer((currentPlayer: any) => {
      if (currentPlayer) {
        cleanup(currentPlayer);
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

      const playerId = `youtube-player-${videoId}`;
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
              try {
                const currentVideoId = player.getVideoData?.()?.video_id;

                if (currentVideoId !== youtubeVideoId) {
                  console.warn('플레이어 비디오 ID 불일치:', currentVideoId, 'vs', youtubeVideoId);
                  return;
                }
              } catch (e) {
                console.warn('비디오 ID 확인 실패:', e);
              }

              if (isCancelled) return;

              youtubePlayerReadyRef.current = true;
              setYoutubePlayer(player);
              playerInstance = player;

              // 초기 볼륨 설정
              try {
                player.setVolume(volume);
              } catch (e) {
                console.warn('볼륨 설정 실패:', e);
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;

              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false);
                setCurrentTime(0);
              }
            },
          },
        });
      } catch (e) {
        console.error('플레이어 생성 실패:', e);
      }
    });

    return () => {
      isCancelled = true;
      if (playerInstance) {
        cleanup(playerInstance);
      }
    };
  }, [youtubeVideoId, setIsPlaying, setCurrentTime, volume]);

  // 재생/일시정지 제어
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;

    try {
      if (isPlaying) {
        youtubePlayer.playVideo?.();
      } else {
        youtubePlayer.pauseVideo?.();
      }
    } catch (e) {
      console.warn('재생 제어 실패:', e);
    }
  }, [isPlaying, youtubePlayer]);

  // 재생 속도 제어
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;

    try {
      youtubePlayer.setPlaybackRate?.(playbackSpeed);
    } catch (e) {
      console.warn('재생 속도 설정 실패:', e);
    }
  }, [playbackSpeed, youtubePlayer]);

  // 볼륨 제어
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;

    try {
      youtubePlayer.setVolume(volume);
    } catch (e) {
      console.warn('볼륨 설정 실패:', e);
    }
  }, [volume, youtubePlayer]);

  // 현재 시간 동기화 (드래그 중이 아닐 때만)
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;
    if (isDraggingPlayhead) return;

    const syncInterval = setInterval(() => {
      if (!youtubePlayer || !youtubePlayerReadyRef.current) return;
      if (isDraggingPlayhead) return;

      try {
        const playerTime = youtubePlayer.getCurrentTime?.() ?? 0;
        const playerTimeMs = playerTime * 1000;

        // 차이가 100ms 이상이면 동기화
        if (Math.abs(playerTimeMs - currentTime) > 100) {
          setCurrentTime(playerTimeMs);
          lastSyncTimeRef.current = playerTimeMs;
        } else {
          // 작은 차이는 플레이어 시간을 따라감
          setCurrentTime(playerTimeMs);
        }
      } catch (e) {
        console.warn('시간 동기화 실패:', e);
      }
    }, 100); // 100ms마다 동기화

    return () => clearInterval(syncInterval);
  }, [youtubePlayer, currentTime, isDraggingPlayhead, setCurrentTime]);

  // 시크 함수
  const seekTo = useCallback(
    (timeMs: number) => {
      if (!youtubePlayer || !youtubePlayerReadyRef.current) return;

      try {
        const timeSeconds = timeMs / 1000;
        youtubePlayer.seekTo(timeSeconds, true);
        setCurrentTime(timeMs);
        lastSyncTimeRef.current = timeMs;
      } catch (e) {
        console.warn('시크 실패:', e);
      }
    },
    [youtubePlayer, setCurrentTime]
  );

  // YouTube URL 제출 핸들러
  const handleYouTubeUrlSubmit = useCallback(() => {
    if (!youtubeUrl) return;

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      alert('유효한 YouTube URL을 입력해주세요.');
      return;
    }

    setYoutubeVideoId(videoId);
  }, [youtubeUrl]);

  // YouTube URL 붙여넣기 핸들러
  const handleYouTubeUrlPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const videoId = extractYouTubeVideoId(pastedText);

    if (videoId) {
      setYoutubeUrl(pastedText);
      setYoutubeVideoId(videoId);
    }
  }, []);

  return {
    youtubeUrl,
    setYoutubeUrl,
    youtubeVideoId,
    youtubePlayer,
    videoDurationSeconds,
    isLoadingDuration,
    handleYouTubeUrlSubmit,
    handleYouTubeUrlPaste,
    seekTo,
    youtubePlayerRef,
  };
}
