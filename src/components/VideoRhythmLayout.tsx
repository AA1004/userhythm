import React, { useEffect, useRef, useState } from 'react';
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
  const userInteractedRef = useRef(false);

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
      if (playerInstance) {
        try {
          playerInstance.destroy?.();
        } catch {
          // ignore
        }
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
      userInteractedRef.current = true;
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
        alignItems: 'center',
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
            zIndex: 0,
            pointerEvents: 'none', // 배경은 클릭 불가, 게임 영역만 인터랙션
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
