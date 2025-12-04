import React, { useMemo } from 'react';

type YouTubeEmbedProps = {
  videoId: string;
  title?: string;
  /**
   * autoplay / mute / loop 등의 동작을 커스터마이즈하고 싶을 때 확장할 수 있도록
   * 기본 쿼리스트링을 오버라이드할 수 있는 옵션입니다.
   */
  queryParams?: string;
};

/**
 * 공통 YouTube 임베드 컴포넌트
 * - 항상 iframe을 사용하고, YouTube 서버에서 바로 재생합니다.
 * - 기본값은 배경형(autoplay, mute, loop)으로 설정해 영상만 보이고 소리는 나지 않게 합니다.
 *   (실제 게임 오디오는 기존 테스트용 YouTube 플레이어를 그대로 사용)
 */
export const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({
  videoId,
  title = 'YouTube video player',
  queryParams,
}) => {
  const src = useMemo(() => {
    const base = `https://www.youtube.com/embed/${videoId}`;
    // 배경용 기본 쿼리: 자동재생, 무음, 컨트롤러 숨김, 반복 재생
    const defaultParams =
      'autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=' +
      encodeURIComponent(videoId);

    return `${base}?${queryParams ?? defaultParams}`;
  }, [videoId, queryParams]);

  return (
    <iframe
      src={src}
      title={title}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: 'block',
      }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      loading="lazy"
    />
  );
};


