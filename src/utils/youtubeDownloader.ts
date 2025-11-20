// YouTube 다운로드 유틸리티
// 백엔드 서버를 통해 YouTube 영상을 다운로드하고 분석

const SERVER_URL = 'http://localhost:3001';

export interface YouTubeDownloadResult {
  success: boolean;
  blob?: Blob;
  error?: string;
}

// YouTube 영상 다운로드 (서버를 통해)
export async function downloadYouTubeAudio(
  videoId: string,
  onProgress?: (progress: number) => void
): Promise<YouTubeDownloadResult> {
  try {
    // 서버 상태 확인
    const healthCheck = await fetch(`${SERVER_URL}/api/health`);
    if (!healthCheck.ok) {
      return {
        success: false,
        error: '서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.',
      };
    }

    onProgress?.(0.1);

    // 다운로드 요청
    const response = await fetch(`${SERVER_URL}/api/youtube/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ videoId }),
    });

    onProgress?.(0.3);

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || '다운로드 실패',
      };
    }

    onProgress?.(0.5);

    // 응답을 Blob으로 변환
    const blob = await response.blob();
    onProgress?.(1.0);

    return {
      success: true,
      blob,
    };
  } catch (error) {
    console.error('YouTube 다운로드 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }
}

// 서버 사용 가능 여부 확인
export async function isServerAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3초 타임아웃
    });
    return response.ok;
  } catch {
    return false;
  }
}

