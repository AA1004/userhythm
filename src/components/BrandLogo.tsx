import React from 'react';

type BrandLogoSize = 'lg' | 'md';

export interface BrandLogoProps {
  title?: string;
  tagline?: string;
  size?: BrandLogoSize;
  /**
   * 배경 클립 그라데이션. 예: CHART_EDITOR_THEME.titleGradient
   */
  gradient?: string;
  /**
   * 텍스트 외곽선(스트로크) 색상. 어두운 배경에서 글자가 더 또렷해짐.
   */
  strokeColor?: string;
  /**
   * 글로우(텍스트 섀도우) 값. 예: CHART_EDITOR_THEME.titleGlow
   */
  glow?: string;
}

const SIZE_STYLES: Record<
  BrandLogoSize,
  { titlePx: number; markPx: number; letterSpacingEm: number; strokePx: number }
> =
  {
    lg: { titlePx: 52, markPx: 44, letterSpacingEm: 0.12, strokePx: 2 },
    md: { titlePx: 44, markPx: 38, letterSpacingEm: 0.1, strokePx: 2 },
  };

export const BrandLogo: React.FC<BrandLogoProps> = ({
  title = 'UseRhythm',
  tagline,
  size = 'lg',
  gradient = 'linear-gradient(135deg, #38bdf8 0%, #818cf8 45%, #f0abfc 100%)',
  strokeColor = 'rgba(2, 6, 23, 0.95)',
  glow = '0 0 22px rgba(56,189,248,0.35), 0 0 42px rgba(129,140,248,0.22)',
}) => {
  const s = SIZE_STYLES[size];

  return (
    <div className="ur-brand">
      <div
        className="ur-brand__grid"
        style={
          {
            // CSS 변수로 넘겨서 스타일을 컴포넌트 밖(CSS)에서도 재사용
            '--ur-logo-gradient': gradient,
            '--ur-logo-stroke': strokeColor,
            '--ur-logo-glow': glow,
            '--ur-logo-size': `${s.titlePx}px`,
            '--ur-logo-letter-spacing': `${s.letterSpacingEm}em`,
            '--ur-logo-stroke-width': `${s.strokePx}px`,
          } as React.CSSProperties
        }
      >
        <svg
          className="ur-brand__mark"
          width={s.markPx}
          height={s.markPx}
          viewBox="0 0 64 64"
          aria-hidden="true"
        >
          {/* Neon ring */}
          <defs>
            <linearGradient id="urMarkGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#22d3ee" />
              <stop offset="0.55" stopColor="#818cf8" />
              <stop offset="1" stopColor="#f0abfc" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="22" fill="none" stroke="url(#urMarkGrad)" strokeWidth="4" />
          {/* Waveform */}
          <path
            d="M16 35c4 0 4-10 8-10s4 18 8 18 4-26 8-26 4 22 8 22 4-14 8-14"
            fill="none"
            stroke="white"
            strokeOpacity="0.9"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="ur-brand__titleWrap">
          <h1 className="ur-logo" aria-label={title}>
            <span className="ur-logo__fill">{title}</span>
          </h1>
        </div>
        {tagline ? <p className="ur-tagline">{tagline}</p> : null}
      </div>
    </div>
  );
};

