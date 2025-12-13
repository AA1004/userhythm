import { useState, useEffect, useMemo, RefObject } from 'react';
import { GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT } from '../constants/gameLayout';

export interface UseGameViewSizeOptions {
  containerRef: RefObject<HTMLDivElement>;
}

export interface UseGameViewSizeReturn {
  viewSize: { width: number; height: number };
  subtitleArea: { left: number; top: number; width: number; height: number };
}

export function useGameViewSize({ containerRef }: UseGameViewSizeOptions): UseGameViewSizeReturn {
  const [viewSize, setViewSize] = useState({ width: GAME_VIEW_WIDTH, height: GAME_VIEW_HEIGHT });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateSize = () => {
      setViewSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef]);

  // 자막 좌표 영역: 16:9 비율 (에디터 프리뷰와 동일)
  // 게임 화면 높이를 기준으로 16:9 영역을 계산하여 좌우로 확장
  const subtitleArea = useMemo(() => {
    const containerHeight = viewSize.height || GAME_VIEW_HEIGHT;
    const containerWidth = viewSize.width || GAME_VIEW_WIDTH;
    
    // 16:9 비율로 자막 영역 계산 (높이 기준)
    const SUBTITLE_ASPECT_RATIO = 16 / 9;
    const subtitleWidth = containerHeight * SUBTITLE_ASPECT_RATIO;
    const subtitleHeight = containerHeight;
    
    // 게임 화면 중앙에 정렬 (좌우로 확장됨)
    const offsetLeft = (containerWidth - subtitleWidth) / 2;
    
    return {
      left: offsetLeft,
      top: 0,
      width: subtitleWidth,
      height: subtitleHeight,
    };
  }, [viewSize]);

  return {
    viewSize,
    subtitleArea,
  };
}

