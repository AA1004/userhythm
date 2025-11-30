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
  const latestTimeRef = useRef(currentTimeMs);

  useEffect(() => {
    latestTimeRef.current = currentTimeMs;
  }, [currentTimeMs]);

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
                player.seekTo(latestTimeRef.current / 1000, true);
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
  }, [videoId]);

  // 재생/일시정지 제어
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    try {
      if (isPlaying) {
        if (!wasPlayingRef.current) {
          // 재생 시작: 현재 위치에서 재생
          player.seekTo(latestTimeRef.current / 1000, true);
          player.playVideo?.();
        }
      } else {
        // 일시정지
        player.pauseVideo?.();
      }
    } catch (e) {
      console.warn('Subtitle audio 재생 제어 실패:', e);
    }

    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // 일시정지 상태에서 타임라인 클릭 시 시크
  const prevTimeRef = useRef(currentTimeMs);
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    if (isPlaying) {
      prevTimeRef.current = currentTimeMs;
      return; // 재생 중에는 시크하지 않음
    }

    // 일시정지 상태에서 시간이 변경되면 시크
    if (Math.abs(currentTimeMs - prevTimeRef.current) > 100) {
      try {
        player.seekTo(currentTimeMs / 1000, true);
        prevTimeRef.current = currentTimeMs;
      } catch {
        // ignore
      }
    }
  }, [currentTimeMs, isPlaying]);

  return { containerRef, isReady };
}


