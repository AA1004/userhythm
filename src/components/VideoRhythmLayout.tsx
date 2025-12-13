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
  const [isBgVisible, setIsBgVisible] = useState(false);
  const backgroundPlayerReadyRef = useRef(false);
  const lastBgaSeekRef = useRef<number | null>(null);
  const lastLayoutSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const layoutRafRef = useRef<number | null>(null);

  const applyBackgroundPlayerLayout = useCallback((player: any, isInitial: boolean = false) => {
    const container = backgroundPlayerContainerRef.current;
    if (!container || !player) return;

    const rect = container.getBoundingClientRect();
    const roundedWidth = Math.max(1, Math.round(rect.width));
    const roundedHeight = Math.max(1, Math.round(rect.height));

    if (!isInitial) {
      // 리사이즈 시에만 크기 체크 (초기 설정은 항상 실행)
      if (
        lastLayoutSizeRef.current.width === roundedWidth &&
        lastLayoutSizeRef.current.height === roundedHeight
      ) {
        return;
      }
    }
    lastLayoutSizeRef.current = { width: roundedWidth, height: roundedHeight };

    const iframe = player.getIframe?.();
    if (iframe) {
      if (isInitial) {
        // 초기: 크게 설정해서 YouTube UI가 컨테이너 밖으로 나가게 함
        iframe.style.position = 'absolute';
        iframe.style.top = '-15%';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '130%';
        iframe.style.transform = 'none';
        iframe.style.pointerEvents = 'none';
        iframe.style.transition = 'none'; // 초기에는 transition 없음
        iframe.style.objectFit = 'cover';
        iframe.style.objectPosition = 'center center';
        iframe.style.backgroundColor = 'black';
      } else {
        // 최종: 원래 크기로 설정 (transition으로 부드럽게 전환)
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.transform = 'none';
        iframe.style.pointerEvents = 'none';
        iframe.style.transition = 'top 300ms ease-out, height 300ms ease-out'; // 부드러운 전환
        iframe.style.objectFit = 'cover';
        iframe.style.objectPosition = 'center center';
        iframe.style.backgroundColor = 'black';
      }
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
                disablekb: 1,
                fs: 0,
            mute: 1,
            playsinline: 1,
            enablejsapi: 1,
            rel: 0,
            modestbranding: 1,
                iv_load_policy: 3,
                showinfo: 0,
                autohide: 1,
                origin: typeof window !== 'undefined' ? window.location.origin : undefined,
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
              
              // 초기: 크게 설정해서 YouTube UI가 컨테이너 밖으로 나가게 함
              applyBackgroundPlayerLayout(player, true);
              
              // 200ms 후 원래 크기로 부드럽게 전환
              setTimeout(() => {
                if (isCancelled) return;
                applyBackgroundPlayerLayout(player, false);
              }, 200);
              
              resizeHandler = () => {
                if (layoutRafRef.current !== null) return;
                layoutRafRef.current = requestAnimationFrame(() => {
                  layoutRafRef.current = null;
                  applyBackgroundPlayerLayout(player, false);
                });
              };
              window.addEventListener('resize', resizeHandler, { passive: true });

              // UI 깜빡임 방지: 준비 직후 잠시 숨겼다가 노출
              setIsBgVisible(false);
              setTimeout(() => setIsBgVisible(true), 120);
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
        if (layoutRafRef.current) {
          cancelAnimationFrame(layoutRafRef.current);
          layoutRafRef.current = null;
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
          {/* 화면에 딱 맞게 배치 */}
          <div
            ref={backgroundPlayerContainerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: isBgVisible ? 1 : 0,
              transition: 'opacity 180ms ease-out',
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

