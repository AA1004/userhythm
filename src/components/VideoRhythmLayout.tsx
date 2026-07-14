import React, { useEffect, useRef, useState } from 'react';
import { waitForYouTubeAPI, YOUTUBE_EMBED_HOST } from '../utils/youtube';
import { isGameplayProfilerEnabled, recordGameplayMetric } from '../utils/gameplayProfiler';
import { PerformanceMode } from '../constants/gameVisualSettings';
import { getAudioPositionSeconds, type AudioSettings } from '../utils/gameHelpers';

type VideoRhythmLayoutProps = {
  videoId?: string | null;
  /** 배경 동영상(BGA) 사용 여부 */
  bgaEnabled?: boolean;
  /** 게임 상태에 따라 BGA를 재생/일시정지할지 여부 */
  shouldPlayBga?: boolean;
  /** 게임 진행 시간에 맞춘 BGA 재생 위치(초) */
  bgaCurrentSeconds?: number | null;
  bgaCurrentTimeRef?: React.MutableRefObject<number>;
  bgaAudioSettings?: AudioSettings | null;
  /** 간주 구간 오버레이 투명도 (0~1, 1이면 완전히 간주 구간) */
  bgaMaskOpacity?: number;
  /** 배경 동영상 투명도 (0~1, 값이 클수록 더 투명) */
  bgaOpacity?: number;
  performanceMode?: PerformanceMode;
  /** 실제 플레이 중에는 슬롯 HUD가 화면 하단에 닿도록 정렬한다. */
  contentVerticalAlign?: 'center' | 'bottom';
  children: React.ReactNode;
};

/**
 * 유튜브 영상을 전체 배경으로 두고,
 * 중앙에는 채보/게임 영역 + 최상단에는 자막 등의 오버레이를 올리는 레이아웃 컨테이너.
 *
 * - 배경 영상은 IFrame API로 제어하며, 무음/반복/커버 모드(잘려 보일 수 있음)로 재생됩니다.
 * - 실제 게임 오디오는 기존 테스트용 YouTube 플레이어를 그대로 사용합니다.
 * - 브라우저 자동재생 정책을 고려해, 유저 제스처 이후(플레이 시작 후)에만
 *   playVideo를 호출합니다.
 */
export const VideoRhythmLayout: React.FC<VideoRhythmLayoutProps> = ({
  videoId,
  bgaEnabled = true,
  shouldPlayBga = false,
  bgaCurrentSeconds = null,
  bgaCurrentTimeRef,
  bgaAudioSettings = null,
  bgaMaskOpacity = 0,
  bgaOpacity = 1,
  performanceMode: _performanceMode = 'quality',
  contentVerticalAlign = 'center',
  children,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const backgroundPlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const [backgroundPlayer, setBackgroundPlayer] = useState<any>(null);
  const backgroundPlayerRef = useRef<any>(null);
  const backgroundPlayerReadyRef = useRef(false);
  const backgroundPlaybackEndedRef = useRef(false);
  const lastBgaSeekRef = useRef<number | null>(null);
  const lastBgaSyncCheckAtRef = useRef(0);
  const lastElectronBgaStateAtRef = useRef(0);
  const userInteractedRef = useRef(false);

  const isBgaTimelineReady = () => {
    return !bgaCurrentTimeRef || bgaCurrentTimeRef.current >= 0;
  };

  const canPlayBgaNow = () => {
    return Boolean(shouldPlayBga && bgaEnabled && videoId && isBgaTimelineReady());
  };

  const getBgaCurrentSeconds = () => {
    if (bgaCurrentTimeRef && bgaAudioSettings) {
      return getAudioPositionSeconds(bgaCurrentTimeRef.current, bgaAudioSettings);
    }
    return typeof bgaCurrentSeconds === 'number' ? bgaCurrentSeconds : null;
  };

  const disposeBackgroundPlayer = (playerInstance?: any | null) => {
    const playerToDispose = playerInstance ?? backgroundPlayerRef.current;
    if (!playerToDispose) {
      backgroundPlayerReadyRef.current = false;
      backgroundPlayerRef.current = null;
      backgroundPlaybackEndedRef.current = false;
      lastBgaSeekRef.current = null;
      lastBgaSyncCheckAtRef.current = 0;
      setBackgroundPlayer(null);
      return;
    }

    try {
      playerToDispose.mute?.();
    } catch {
      // ignore
    }

    try {
      playerToDispose.pauseVideo?.();
    } catch {
      // ignore
    }

    try {
      playerToDispose.destroy?.();
    } catch {
      // ignore
    }

    backgroundPlayerReadyRef.current = false;
    backgroundPlayerRef.current = null;
    backgroundPlaybackEndedRef.current = false;
    lastBgaSeekRef.current = null;
    lastBgaSyncCheckAtRef.current = 0;
    setBackgroundPlayer(null);
  };

  useEffect(() => {
    const sendBounds = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect || !window.playerApi?.setBgaLayerBounds) return;
      window.playerApi.setBgaLayerBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    };

    sendBounds();
    if (!rootRef.current || !window.playerApi?.setBgaLayerBounds) return;

    const observer = new ResizeObserver(sendBounds);
    observer.observe(rootRef.current);
    window.addEventListener('resize', sendBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sendBounds);
      window.playerApi?.setBgaLayerBounds?.(null);
    };
  }, []);

  useEffect(() => {
    if (!window.playerApi?.setBgaLayerState) return;

    const now = performance.now();
    const forceStateUpdate = !videoId || !bgaEnabled || !shouldPlayBga || bgaMaskOpacity >= 1;
    if (!forceStateUpdate && now - lastElectronBgaStateAtRef.current < 250) return;
    lastElectronBgaStateAtRef.current = now;

    window.playerApi.setBgaLayerState({
      videoId: videoId ?? null,
      visible: Boolean(videoId && bgaEnabled && bgaMaskOpacity < 1),
      opacity: Math.max(0, Math.min(1, 1 - bgaOpacity)),
      currentSeconds: getBgaCurrentSeconds() ?? 0,
      shouldPlay: canPlayBgaNow(),
    });
  }, [videoId, bgaEnabled, bgaMaskOpacity, bgaOpacity, bgaCurrentSeconds, bgaCurrentTimeRef, bgaAudioSettings, shouldPlayBga]);

  // 배경용 YouTube 플레이어 초기화
  useEffect(() => {
    if (!videoId || !bgaEnabled) {
      disposeBackgroundPlayer();
      return;
    }

    if (!backgroundPlayerContainerRef.current) return;

    let isCancelled = false;
    let playerInstance: any = null;

    waitForYouTubeAPI().then(() => {
      if (isCancelled) return;
      if (!window.YT || !window.YT.Player) return;

      const container = backgroundPlayerContainerRef.current;
      if (!container) return;

      const playerId = `bga-player-${videoId}`;
      if (container.id !== playerId) {
        container.id = playerId;
      }

      try {
        playerInstance = new window.YT.Player(playerId, {
          videoId,
          host: YOUTUBE_EMBED_HOST,
          playerVars: {
            autoplay: 0,
            controls: 0,
            mute: 1,
            playsinline: 1,
            enablejsapi: 1,
            rel: 0,
            modestbranding: 1,
          } as any,
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;
              const player = event.target;
              backgroundPlayerReadyRef.current = true;
              backgroundPlayerRef.current = player;
              backgroundPlaybackEndedRef.current = false;
              lastBgaSeekRef.current = null;
              lastBgaSyncCheckAtRef.current = 0;
              setBackgroundPlayer(player);
              try {
                player.mute?.();
                player.pauseVideo?.();
                player.setPlaybackQuality?.('small');
                player.setSize?.(320, 180);
                // 게임 시작 전에 미리 재생해서 UI를 띄워놓기
                // 사용자 인터랙션이 필요하므로 pointerdown 이벤트에서 처리
              } catch {
                // ignore
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;
              if (event.data !== window.YT?.PlayerState?.ENDED) return;
              backgroundPlaybackEndedRef.current = true;
              disposeBackgroundPlayer(event.target);
            },
          },
        });
      } catch {
        // ignore
      }
    });

    return () => {
      isCancelled = true;
      disposeBackgroundPlayer(playerInstance);
    };
  }, [videoId, bgaEnabled]);

  // 게임 상태에 따라 BGA 재생/일시정지
  useEffect(() => {
    if (!backgroundPlayer || !backgroundPlayerReadyRef.current) return;

    try {
      if (canPlayBgaNow()) {
        if (backgroundPlaybackEndedRef.current) return;
        backgroundPlayer.playVideo?.();
      } else {
        backgroundPlayer.mute?.();
        backgroundPlayer.pauseVideo?.();
      }
    } catch {
      // ignore
    }
  }, [shouldPlayBga, bgaEnabled, videoId, backgroundPlayer]);

  // 자동재생 정책 회피: 사용자 입력(pointerdown)이 들어오면 즉시 재생 시도
  useEffect(() => {
    if (!backgroundPlayer) return;

    const handlePointerDown = () => {
      userInteractedRef.current = true;
      if (!backgroundPlayerReadyRef.current) return;
      if (!canPlayBgaNow()) return;

      try {
        backgroundPlayer.playVideo?.();
      } catch {
        // ignore
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [backgroundPlayer, shouldPlayBga, bgaEnabled, videoId]);

  // 게임 타임라인에 맞춰 BGA 위치도 함께 시크
  useEffect(() => {
    if (!backgroundPlayer || !backgroundPlayerReadyRef.current) return;
    if (!shouldPlayBga || !videoId || !bgaEnabled) return;

    let timerId: number | null = null;
    const sync = () => {
      const currentTargetSeconds = getBgaCurrentSeconds();
      if (typeof currentTargetSeconds !== 'number') return;

      try {
        if (!isBgaTimelineReady()) {
          backgroundPlayer.mute?.();
          backgroundPlayer.pauseVideo?.();
          return;
        }
        const shouldProfile = isGameplayProfilerEnabled();
        const syncStart = shouldProfile ? performance.now() : 0;
      if (backgroundPlaybackEndedRef.current) {
        if (shouldProfile) {
          recordGameplayMetric('bgaSync', performance.now() - syncStart, 0);
        }
        return;
      }
      const now = performance.now();
      const shouldForceSync = lastBgaSeekRef.current === null;
      const syncIntervalMs = 5000;
      if (!shouldForceSync && now - lastBgaSyncCheckAtRef.current < syncIntervalMs) {
        if (shouldProfile) {
          recordGameplayMetric('bgaSync', performance.now() - syncStart, 0);
        }
        return;
      }
      lastBgaSyncCheckAtRef.current = now;
      const currentSeconds = backgroundPlayer.getCurrentTime?.() ?? 0;
      const diff = Math.abs(currentSeconds - currentTargetSeconds);

      const seekThreshold = 0.45;
      if (diff > seekThreshold || lastBgaSeekRef.current === null) {
        backgroundPlayer.seekTo(currentTargetSeconds, true);
        lastBgaSeekRef.current = currentTargetSeconds;
      }
      if (shouldProfile) {
        recordGameplayMetric('bgaSync', performance.now() - syncStart, diff);
      }
      } catch {
      // ignore
      }
    };

    sync();
    timerId = window.setInterval(sync, 15000);
    return () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
    };
  }, [bgaCurrentSeconds, bgaCurrentTimeRef, bgaAudioSettings, backgroundPlayer, shouldPlayBga, videoId, bgaEnabled]);

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        alignItems: contentVerticalAlign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--ur-stage-background)',
      }}
    >
      {/* 유튜브 배경 레이어 (있을 때만) */}
      {videoId && bgaEnabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            opacity: 1 - bgaOpacity,
            pointerEvents: 'none', // 배경은 클릭 불가, 게임 영역만 인터랙션
            contain: 'layout style paint',
            isolation: 'isolate',
            transform: 'translateZ(0)',
          }}
        >
          {/* 화면에 딱 맞게 배치 */}
          <div
            ref={backgroundPlayerContainerRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
            }}
          />
          {/* 여백과 영상 경계를 자연스럽게 블렌딩하는 그라디언트 마스크 */}
          {!shouldPlayBga && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `
                  linear-gradient(to right, rgba(15,23,42,0.6) 0%, transparent 8%, transparent 92%, rgba(15,23,42,0.6) 100%),
                  linear-gradient(to bottom, rgba(15,23,42,0.6) 0%, transparent 8%, transparent 92%, rgba(15,23,42,0.6) 100%)
                `,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      )}

      {/* 배경 위에 덮는 그라디언트/딤 레이어 (가독성 확보용) */}
      {/* 간주 구간(bgaMaskOpacity >= 1)에서는 완전히 숨김 */}
      {bgaMaskOpacity < 1 && (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background: videoId && bgaEnabled
            ? shouldPlayBga
              ? 'rgba(15, 23, 42, 0.42)'
              : 'radial-gradient(circle at top, rgba(15,23,42,0.35), rgba(15,23,42,0.92))'
            : 'var(--ur-stage-background)',
          contain: 'layout style paint',
          transform: 'translateZ(0)',
        }}
      />
      )}

      {/* 실제 게임/채보/자막 오버레이 콘텐츠.
          레인 페이드는 게임 내부 레이어에서 처리한다. 여기서 children 전체를 숨기면
          자막까지 함께 사라지므로 layout wrapper는 항상 표시한다. */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: contentVerticalAlign === 'bottom' ? '16px 16px 0' : 16,
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 1280,
        }}
      >
        {children}
      </div>
    </div>
  );
};
