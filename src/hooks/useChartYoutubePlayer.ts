import { useState, useRef, useEffect, useCallback } from 'react';
import { extractYouTubeVideoId, waitForYouTubeAPI, getYouTubeVideoDuration } from '../utils/youtube';

interface UseChartYoutubePlayerOptions {
  currentTime: number;
  setCurrentTime: (time: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  volume: number;
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
}: UseChartYoutubePlayerOptions) {
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubeVideoTitle, setYoutubeVideoTitle] = useState<string>('');
  const [youtubePlayer, setYoutubePlayer] = useState<any>(null);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(null);
  const [isLoadingDuration, setIsLoadingDuration] = useState<boolean>(false);

  const youtubePlayerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerReadyRef = useRef(false);
  const lastSyncTimeRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const latestTimeRef = useRef(0);

  // YouTube URL에서 Video ID 추출
  useEffect(() => {
    if (!youtubeUrl) {
      setYoutubeVideoId(null);
      setYoutubeVideoTitle('');
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
        // 플레이어가 준비되어 있으면 플레이어에서도 길이 확인
        if (youtubePlayer && youtubePlayerReadyRef.current) {
          try {
            const playerDuration = youtubePlayer.getDuration?.();
            if (playerDuration && playerDuration > 0) {
              // 플레이어 길이와 API 길이 중 더 큰 값 사용
              setVideoDurationSeconds(Math.max(duration || 0, playerDuration));
            } else {
              setVideoDurationSeconds(duration);
            }
          } catch (e) {
            setVideoDurationSeconds(duration);
          }
        } else {
        setVideoDurationSeconds(duration);
        }
        setIsLoadingDuration(false);
      })
      .catch(() => {
        setIsLoadingDuration(false);
      });
  }, [youtubeVideoId, youtubePlayer]);

  // 플레이어가 준비된 후 길이 재확인
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;
    if (videoDurationSeconds !== null && videoDurationSeconds > 0) return; // 이미 유효한 길이가 있으면 스킵

    // 플레이어에서 길이 가져오기 시도
    try {
      const playerDuration = youtubePlayer.getDuration?.();
      if (playerDuration && playerDuration > 0) {
        setVideoDurationSeconds(playerDuration);
      }
    } catch (e) {
      // 무시
    }
  }, [youtubePlayer, videoDurationSeconds]);

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
      // React가 관리하는 요소가 YouTube API에 의해 교체되지 않도록 내부 마운트 노드를 만들어 전달한다.
      const mountNode = document.createElement('div');
      mountNode.id = `${playerId}-mount`;
      playerElement.innerHTML = '';
      playerElement.appendChild(mountNode);

      try {
        playerInstance = new window.YT.Player(mountNode as any, {
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

              try {
                const videoData = player.getVideoData?.();
                if (videoData?.title) {
                  setYoutubeVideoTitle(videoData.title);
                }
              } catch (err) {
                console.warn('YouTube 제목 정보를 불러오지 못했습니다.', err);
              }

              // 초기 볼륨 설정
              try {
                player.setVolume(volume);
              } catch (e) {
                console.warn('볼륨 설정 실패:', e);
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;

              // 재생 버튼으로만 제어하므로, 플레이어 상태 변경 시 UI 상태를 자동으로 변경하지 않음
              // 단, 영상이 끝났을 때만 시간을 초기화
              if (event.data === window.YT.PlayerState.ENDED) {
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
      // 마운트 노드 정리
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.innerHTML = '';
      }
    };
  }, [youtubeVideoId, setIsPlaying, setCurrentTime, volume]);

  // latest currentTime snapshot (재생 시작 시점에서 사용)
  useEffect(() => {
    latestTimeRef.current = currentTime;
  }, [currentTime]);

  // 재생/일시정지 제어 (YouTube 쪽만 제어, 타임라인은 별도 동기화)
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;

    const ensurePlaying = () => {
      try {
        const playerState = youtubePlayer.getPlayerState?.();
        if (
          typeof window !== 'undefined' &&
          window.YT &&
          playerState !== window.YT.PlayerState.PLAYING
        ) {
          youtubePlayer.playVideo?.();
        }
      } catch (e) {
        console.warn('재생 상태 확인 실패:', e);
      }
    };

    try {
      if (isPlaying) {
        if (!wasPlayingRef.current) {
          const timeSeconds = latestTimeRef.current / 1000;
          youtubePlayer.seekTo(timeSeconds, true);
          youtubePlayer.playVideo?.();
        } else {
          ensurePlaying();
        }
      } else {
        youtubePlayer.pauseVideo?.();
      }
    } catch (e) {
      console.warn('재생 제어 실패:', e);
    }

    wasPlayingRef.current = isPlaying;
  }, [isPlaying, youtubePlayer]);

  // 플레이어가 새로 생성되면 재생 상태 초기화
  useEffect(() => {
    wasPlayingRef.current = false;
  }, [youtubePlayer]);

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

  // 현재 시간 동기화 제거: 에디터 타이머가 단일 시간 소스가 되도록 유지

  // 시크 함수
  const seekTo = useCallback(
    (timeMs: number, options?: { shouldPause?: boolean; snapOnly?: boolean }) => {
      if (!youtubePlayer || !youtubePlayerReadyRef.current) return;

      const { shouldPause = false, snapOnly = false } = options || {};

      try {
        const timeSeconds = timeMs / 1000;
        
        // snapOnly 모드: 플레이어에는 시크하지 않고 에디터 시간만 업데이트
        if (!snapOnly) {
          youtubePlayer.seekTo(timeSeconds, true);
        }
        
        setCurrentTime(timeMs);
        lastSyncTimeRef.current = timeMs;
        latestTimeRef.current = timeMs;
        
        // 재생선 클릭 시 명시적으로 일시정지
        if (shouldPause) {
          youtubePlayer.pauseVideo?.();
        }
      } catch (e) {
        console.warn('시크 실패:', e);
      }
    },
    [youtubePlayer, setCurrentTime]
  );

  // YouTube URL 제출 핸들러
  const handleYouTubeUrlSubmit = useCallback((customUrl?: string) => {
    const targetUrl = customUrl ?? youtubeUrl;
    if (!targetUrl) return;

    const videoId = extractYouTubeVideoId(targetUrl);
    if (!videoId) {
      alert('유효한 YouTube URL을 입력해주세요.');
      return;
    }

    setYoutubeUrl(targetUrl);
    setYoutubeVideoId(videoId);
    setYoutubeVideoTitle('');
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
    youtubeVideoTitle,
    youtubePlayer,
    videoDurationSeconds,
    isLoadingDuration,
    handleYouTubeUrlSubmit,
    handleYouTubeUrlPaste,
    seekTo,
    youtubePlayerRef,
  };
}
