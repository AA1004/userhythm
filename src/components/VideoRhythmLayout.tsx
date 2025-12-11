import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { waitForYouTubeAPI } from '../utils/youtube';

type VideoRhythmLayoutProps = {
  videoId?: string | null;
  /** 배경 동영상(BGA) 사용 여부 */
  bgaEnabled?: boolean;
  /** 게임 상태에 따라 BGA를 재생/일시정지할지 여부 */
  shouldPlayBga?: boolean;
  /** 게임 진행 시간에 맞춘 BGA 재생 위치(초) */
  bgaCurrentSeconds?: number | null;
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
  children,
}) => {
  const backgroundPlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const [backgroundPlayer, setBackgroundPlayer] = useState<any>(null);
  const backgroundPlayerReadyRef = useRef(false);
  const lastBgaSeekRef = useRef<number | null>(null);
  const lastLayoutSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const layoutRafRef = useRef<number | null>(null);

  const applyBackgroundPlayerLayout = useCallback((player: any) => {
    const container = backgroundPlayerContainerRef.current;
    if (!container || !player) return;

    const rect = container.getBoundingClientRect();
    const containerWidth = Math.max(1, rect.width);
    const containerHeight = Math.max(1, rect.height);
    const containerAspect = containerWidth / containerHeight;
    const videoAspect = 16 / 9;

    // 컨테이너에 딱 맞게 채우되, 불필요한 과스케일 방지
    const overscan = 1.0;
    let targetWidth: number;
    let targetHeight: number;

    if (containerAspect > videoAspect) {
      // 컨테이너가 더 넓음 → 높이에 맞추어 가로를 확장
      targetHeight = containerHeight * overscan;
      targetWidth = targetHeight * videoAspect;
    } else {
      // 컨테이너가 더 좁음 → 가로에 맞추어 세로를 확장
      targetWidth = containerWidth * overscan;
      targetHeight = targetWidth / videoAspect;
    }

    const roundedWidth = Math.round(targetWidth);
    const roundedHeight = Math.round(targetHeight);

    if (
      lastLayoutSizeRef.current.width === roundedWidth &&
      lastLayoutSizeRef.current.height === roundedHeight
    ) {
      return;
    }
    lastLayoutSizeRef.current = { width: roundedWidth, height: roundedHeight };

    const iframe = player.getIframe?.();
    if (iframe) {
      iframe.style.position = 'absolute';
      iframe.style.top = '50%';
      iframe.style.left = '50%';
      iframe.style.width = `${targetWidth}px`;
      iframe.style.height = `${targetHeight}px`;
      iframe.style.transform = 'translate(-50%, -50%)';
      iframe.style.pointerEvents = 'none';
      iframe.style.objectFit = 'cover';
    }

    if (player.setSize) {
      player.setSize(targetWidth, targetHeight);
    }
  }, []);

  // 배경용 YouTube 플레이어 초기화
  useEffect(() => {
    if (!videoId || !bgaEnabled) {
      if (backgroundPlayer) {
        try {
          backgroundPlayer.destroy?.();
        } catch {
          // ignore
        }
        setBackgroundPlayer(null);
      }
      backgroundPlayerReadyRef.current = false;
      return;
    }

    if (!backgroundPlayerContainerRef.current) return;

    let isCancelled = false;
    let playerInstance: any = null;
    let resizeHandler: (() => void) | null = null;

    waitForYouTubeAPI().then(() => {
      if (isCancelled) return;
      if (!window.YT || !window.YT.Player) return;

      const container = backgroundPlayerContainerRef.current;
      if (!container) return;

      const playerId = `bga-player-${videoId}`;
      // React 노드가 교체되지 않도록 컨테이너 내부에 마운트 노드를 생성해 전달
      const mountNode = document.createElement('div');
      mountNode.id = `${playerId}-mount`;
      container.innerHTML = '';
      container.appendChild(mountNode);

      try {
        playerInstance = new window.YT.Player(mountNode as any, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            mute: 1,
            playsinline: 1,
            enablejsapi: 1,
            rel: 0,
            modestbranding: 1,
            loop: 1,
            playlist: videoId,
          } as any,
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;
              const player = event.target;
              backgroundPlayerReadyRef.current = true;
              setBackgroundPlayer(player);
              try {
                player.mute?.();
              } catch {
                // ignore
              }
              applyBackgroundPlayerLayout(player);
              resizeHandler = () => {
                if (layoutRafRef.current !== null) return;
                layoutRafRef.current = requestAnimationFrame(() => {
                  layoutRafRef.current = null;
                  applyBackgroundPlayerLayout(player);
                });
              };
              window.addEventListener('resize', resizeHandler, { passive: true });
            },
          },
        });
      } catch {
        // ignore
      }
    });

    return () => {
      isCancelled = true;
      backgroundPlayerReadyRef.current = false;
      if (layoutRafRef.current) {
        cancelAnimationFrame(layoutRafRef.current);
        layoutRafRef.current = null;
      }
      if (playerInstance) {
        try {
          playerInstance.destroy?.();
        } catch {
          // ignore
        }
        if (resizeHandler) {
          window.removeEventListener('resize', resizeHandler);
        }
      }
      if (backgroundPlayerContainerRef.current) {
        backgroundPlayerContainerRef.current.innerHTML = '';
      }
      setBackgroundPlayer(null);
    };
  }, [videoId, bgaEnabled]);

  // 게임 상태에 따라 BGA 재생/일시정지
  useEffect(() => {
    if (!backgroundPlayer || !backgroundPlayerReadyRef.current) return;

    try {
      if (shouldPlayBga && bgaEnabled && videoId) {
        backgroundPlayer.playVideo?.();
      } else {
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
      if (!backgroundPlayerReadyRef.current) return;
      if (!bgaEnabled || !videoId) return;

      try {
        backgroundPlayer.playVideo?.();
        if (!shouldPlayBga) {
          backgroundPlayer.pauseVideo?.();
        }
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
    if (typeof bgaCurrentSeconds !== 'number') return;

    try {
      const currentSeconds = backgroundPlayer.getCurrentTime?.() ?? 0;
      const diff = Math.abs(currentSeconds - bgaCurrentSeconds);

      if (diff > 0.3 || lastBgaSeekRef.current === null) {
        backgroundPlayer.seekTo(bgaCurrentSeconds, true);
        lastBgaSeekRef.current = bgaCurrentSeconds;
        if (!shouldPlayBga) {
          backgroundPlayer.pauseVideo?.();
        }
      }
    } catch {
      // ignore
    }
  }, [bgaCurrentSeconds, backgroundPlayer, shouldPlayBga]);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start', // 맨 위로 붙임
        justifyContent: 'center',
        overflow: 'hidden',
        background: CHART_EDITOR_THEME.backgroundGradient,
      }}
    >
      {/* 유튜브 배경 레이어 (있을 때만) */}
      {videoId && bgaEnabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            zIndex: 0,
            pointerEvents: 'none', // 배경은 클릭 불가, 게임 영역만 인터랙션
          }}
        >
          {/* 약간 확대해서 여백까지 자연스럽게 영상으로 채움 */}
          <div
            ref={backgroundPlayerContainerRef}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '120%',
              height: '120%',
            }}
          />
        </div>
      )}

      {/* 배경 위에 덮는 그라디언트/딤 레이어 (가독성 확보용) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background: videoId && bgaEnabled
            ? 'radial-gradient(circle at top, rgba(15,23,42,0.35), rgba(15,23,42,0.92))'
            : CHART_EDITOR_THEME.backgroundGradient,
        }}
      />

      {/* 실제 게임/채보/자막 오버레이 콘텐츠 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: 16,
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

