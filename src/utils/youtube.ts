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

