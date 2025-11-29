import { useEffect, useRef, useState } from 'react';
import { waitForYouTubeAPI } from '../utils/youtube';

interface UseYoutubeAudioOptions {
  videoId?: string | null;
  currentTimeMs: number;
  setCurrentTimeMs: (timeMs: number) => void;
  isPlaying: boolean;
}

interface UseYoutubeAudioResult {
  containerRef: React.RefObject<HTMLDivElement>;
  isReady: boolean;
}

/**
 * 자막 에디터용 간단 YouTube 오디오 컨트롤러
 * - controls 없이 숨겨진 플레이어를 만들고
 * - currentTimeMs / isPlaying 과 동기화합니다.
 */
export function useYoutubeAudio({
  videoId,
  currentTimeMs,
  setCurrentTimeMs,
  isPlaying,
}: UseYoutubeAudioOptions): UseYoutubeAudioResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // 플레이어 초기화
  useEffect(() => {
    if (!videoId) {
      readyRef.current = false;
      setIsReady(false);
      if (playerRef.current) {
        try {
          playerRef.current.destroy?.();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
      return;
    }

    if (!containerRef.current) return;

    let isCancelled = false;

    waitForYouTubeAPI().then(() => {
      if (isCancelled) return;
      if (!window.YT || !window.YT.Player) return;

      const el = containerRef.current;
      if (!el) return;

      // 기존 플레이어 정리
      if (playerRef.current) {
        try {
          playerRef.current.destroy?.();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }

      const playerId = `subtitle-audio-${videoId}`;
      if (el.id !== playerId) {
        el.id = playerId;
      }

      try {
        const player = new window.YT.Player(playerId, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            enablejsapi: 1,
          } as any,
          events: {
            onReady: () => {
              if (isCancelled) return;
              readyRef.current = true;
              setIsReady(true);
              // 초기 위치로 이동
              try {
                player.seekTo(currentTimeMs / 1000, true);
                // 자막 에디터에 들어왔을 때는 자동 재생하지 않음
                player.pauseVideo?.();
              } catch {
                // ignore
              }
            },
          },
        });

        playerRef.current = player;
      } catch (e) {
        console.error('Subtitle audio player 생성 실패:', e);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [videoId, currentTimeMs]);

  // 재생/일시정지 동기화
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    try {
      if (isPlaying) {
        // 재생 버튼을 눌렀을 때는 타임라인 위치에서 재생 시작
        // 단, 플레이어 시간과 차이가 크지 않으면 seekTo 생략
        const playerTime = (player.getCurrentTime?.() ?? 0) * 1000;
        const timeDiff = Math.abs(playerTime - currentTimeMs);
        if (timeDiff > 200) {
          // 차이가 200ms 이상일 때만 시크
          player.seekTo(currentTimeMs / 1000, true);
        }
        player.playVideo?.();
      } else {
        player.pauseVideo?.();
      }
    } catch (e) {
      console.warn('Subtitle audio 재생 제어 실패:', e);
    }
  }, [isPlaying, currentTimeMs]);

  // 재생 중일 때 플레이어 시간 → currentTimeMs 동기화
  useEffect(() => {
    if (!isPlaying) return;

    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      if (!isPlaying) return; // 재생 중이 아니면 동기화 중단

      try {
        const t = player.getCurrentTime?.() ?? 0;
        setCurrentTimeMs(Math.floor(t * 1000));
      } catch {
        // ignore
      }
    }, 200); // 200ms마다 동기화 (주기 완화)

    return () => {
      window.clearInterval(id);
    };
  }, [isPlaying, setCurrentTimeMs]);

  // 타임라인에서 시간 변경 시 플레이어에 시크 (재생 중이 아닐 때만)
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    if (isPlaying) return; // 재생 중에는 플레이어 기준으로만 흐르게

    try {
      const playerTime = (player.getCurrentTime?.() ?? 0) * 1000;
      const diff = Math.abs(playerTime - currentTimeMs);
      if (diff > 200) {
        // 차이가 200ms 이상일 때만 시크 (허용 오차 완화)
        player.seekTo(currentTimeMs / 1000, true);
      }
    } catch {
      // ignore
    }
  }, [currentTimeMs, isPlaying]);

  return { containerRef, isReady };
}


