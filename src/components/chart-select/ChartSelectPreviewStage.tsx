import React from 'react';
import { PREVIEW_TRANSITION_DURATION_MS } from '../../constants/gameConstants';

interface ChartSelectPreviewStageProps {
  mountRef: React.MutableRefObject<HTMLDivElement | null>;
  fallbackUrl: string | null;
  opacity: number;
}

export const ChartSelectPreviewStage: React.FC<ChartSelectPreviewStageProps> = ({
  mountRef,
  fallbackUrl,
  opacity,
}) => {
  return (
    <div
      className="chart-select-shell__backdrop"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        opacity,
        transition: `opacity ${PREVIEW_TRANSITION_DURATION_MS}ms ease-in-out`,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <div
        ref={mountRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '177.78vh',
          height: '100vh',
          minWidth: '100%',
          minHeight: '56.25vw',
          pointerEvents: 'none',
        }}
      />
      {fallbackUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${fallbackUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: -1,
          }}
        />
      )}
    </div>
  );
};
