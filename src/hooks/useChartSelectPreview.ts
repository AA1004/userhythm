import { useCallback, useEffect, useRef, useState } from 'react';
import { PREVIEW_BGA_OPACITY } from '../constants/gameConstants';
import { waitForYouTubeAPI, YOUTUBE_EMBED_HOST } from '../utils/youtube';

const PREVIEW_VOLUME = 35;
const LOOP_CHECK_DELAY_MS = 180;

export interface ChartSelectPreviewSpec {
  videoId: string;
  previewStartSec: number;
  previewEndSec: number;
  fallbackUrl: string;
}

export const useChartSelectPreview = (spec: ChartSelectPreviewSpec | null) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const [opacity, setOpacity] = useState(0);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const clearLoopTimer = useCallback(() => {
    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  }, []);

  const pausePreview = useCallback(() => {
    clearLoopTimer();
    try {
      playerRef.current?.pauseVideo?.();
    } catch {
      // YouTube iframe can disappear during route changes.
    }
  }, [clearLoopTimer]);

  const destroyPreview = useCallback(() => {
    pausePreview();
    try {
      playerRef.current?.destroy?.();
    } catch {
      // Ignore teardown races from YouTube iframe internals.
    }
    playerRef.current = null;
    currentVideoIdRef.current = null;
    if (mountRef.current) {
      mountRef.current.innerHTML = '';
    }
    if (isMountedRef.current) {
      setOpacity(0);
      setFallbackUrl(null);
    }
  }, [pausePreview]);

  const startPlayback = useCallback(
    (player: any, previewStartSec: number, previewEndSec: number) => {
      clearLoopTimer();
      try {
        player.setVolume?.(PREVIEW_VOLUME);
        player.unMute?.();
        player.seekTo?.(previewStartSec, true);
        player.playVideo?.();
        if (isMountedRef.current) {
          setOpacity(PREVIEW_BGA_OPACITY);
        }
      } catch (error) {
        console.warn('Preview player setup failed:', error);
        return;
      }

      const tick = () => {
        try {
          const currentTime = player.getCurrentTime?.();
          if (typeof currentTime === 'number' && currentTime >= previewEndSec - 0.05) {
            player.seekTo?.(previewStartSec, true);
            player.setVolume?.(PREVIEW_VOLUME);
            player.unMute?.();
            player.playVideo?.();
          }
        } catch {
          // Ignore transient iframe read errors.
        }

        loopTimerRef.current = window.setTimeout(tick, LOOP_CHECK_DELAY_MS);
      };

      loopTimerRef.current = window.setTimeout(tick, LOOP_CHECK_DELAY_MS);
    },
    [clearLoopTimer]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
      destroyPreview();
    };
  }, [destroyPreview]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    pausePreview();

    if (!spec) {
      if (isMountedRef.current) {
        setOpacity(0);
        setFallbackUrl(null);
      }
      return;
    }

    setFallbackUrl(spec.fallbackUrl);

    if (currentVideoIdRef.current === spec.videoId && playerRef.current) {
      startPlayback(playerRef.current, spec.previewStartSec, spec.previewEndSec);
      return () => {
        pausePreview();
      };
    }

    if (playerRef.current) {
      destroyPreview();
    }

    void waitForYouTubeAPI().then(() => {
      if (requestIdRef.current !== requestId || !isMountedRef.current) return;
      if (!window.YT?.Player) {
        console.error('YouTube IFrame API is not available.');
        return;
      }

      const container = mountRef.current;
      if (!container) return;

      container.innerHTML = '';
      const mountNode = document.createElement('div');
      mountNode.id = `chart-select-preview-${requestId}-${Date.now()}`;
      container.appendChild(mountNode);

      try {
        new window.YT.Player(mountNode as any, {
          videoId: spec.videoId,
          host: YOUTUBE_EMBED_HOST,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            mute: 0,
            enablejsapi: 1,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: (event: any) => {
              if (requestIdRef.current !== requestId || !isMountedRef.current) {
                try {
                  event.target?.destroy?.();
                } catch {
                  // Ignore teardown races.
                }
                return;
              }

              const player = event.target;
              playerRef.current = player;
              currentVideoIdRef.current = spec.videoId;
              const iframe = player.getIframe?.();
              if (iframe) {
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.pointerEvents = 'none';
              }
              startPlayback(player, spec.previewStartSec, spec.previewEndSec);
            },
          },
        } as any);
      } catch (error) {
        console.error('Preview player create failed:', error);
      }
    });

    return () => {
      pausePreview();
    };
  }, [destroyPreview, pausePreview, spec, startPlayback]);

  return {
    mountRef,
    opacity,
    fallbackUrl,
    disposePreview: destroyPreview,
  };
};
