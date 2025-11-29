// YouTube URL에서 Video ID 추출
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// YouTube URL 유효성 검증
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

// YouTube IFrame API 타입 정의
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          videoId: string;
          playerVars?: {
            autoplay?: number;
            controls?: number;
            start?: number;
            enablejsapi?: number;
          };
          events?: {
            onReady?: (event: any) => void;
            onStateChange?: (event: any) => void;
            onError?: (event: any) => void;
          };
        }
      ) => {
        playVideo: () => void;
        pauseVideo: () => void;
        stopVideo: () => void;
        seekTo: (seconds: number, allowSeek?: boolean) => void;
        getCurrentTime: () => number;
        getDuration: () => number;
        getPlayerState: () => number;
        setVolume: (volume: number) => void;
        mute: () => void;
        unMute: () => void;
        destroy: () => void;
      };
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

// YouTube IFrame API 로드 확인
export function waitForYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      resolve();
    };

    // 타임아웃 처리 (5초)
    setTimeout(() => {
      if (window.YT && window.YT.Player) {
        resolve();
      } else {
        console.error('YouTube IFrame API 로드 실패');
        resolve(); // 에러가 나도 진행
      }
    }, 5000);
  });
}

// YouTube 영상 길이 가져오기 (초 단위)
export function getYouTubeVideoDuration(videoId: string): Promise<number | null> {
  return new Promise((resolve) => {
    waitForYouTubeAPI().then(() => {
      if (!window.YT || !window.YT.Player) {
        console.error('YouTube IFrame API를 사용할 수 없습니다.');
        resolve(null);
        return;
      }

      // 임시 플레이어 생성 (숨김)
      const tempPlayerId = `temp-youtube-player-${Date.now()}`;
      const tempDiv = document.createElement('div');
      tempDiv.id = tempPlayerId;
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);

      let player: any = null;

      try {
        player = new window.YT.Player(tempPlayerId, {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: any) => {
              try {
                const duration = event.target.getDuration();
                // 플레이어 정리
                if (player) {
                  player.destroy();
                }
                document.body.removeChild(tempDiv);
                resolve(duration);
              } catch (error) {
                console.error('영상 길이 가져오기 실패:', error);
                if (player) {
                  player.destroy();
                }
                document.body.removeChild(tempDiv);
                resolve(null);
              }
            },
            onError: (event: any) => {
              console.error('YouTube 플레이어 오류:', event);
              if (player) {
                player.destroy();
              }
              document.body.removeChild(tempDiv);
              resolve(null);
            },
          },
        });
      } catch (error) {
        console.error('YouTube 플레이어 생성 실패:', error);
        document.body.removeChild(tempDiv);
        resolve(null);
      }

      // 타임아웃 처리 (10초)
      setTimeout(() => {
        if (player) {
          try {
            const duration = player.getDuration();
            if (duration && duration > 0) {
              player.destroy();
              document.body.removeChild(tempDiv);
              resolve(duration);
              return;
            }
          } catch (e) {
            // 무시
          }
        }
        if (player) {
          player.destroy();
        }
        if (document.getElementById(tempPlayerId)) {
          document.body.removeChild(tempDiv);
        }
        resolve(null);
      }, 10000);
    });
  });
}

// 초를 분:초 형식으로 변환
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

