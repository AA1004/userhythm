import React from 'react';

type BrandLogoSize = 'lg' | 'md';
type BrandLogoMarkStyle = 'left' | 'overlap';

export interface BrandLogoProps {
  title?: string;
  tagline?: string;
  size?: BrandLogoSize;
  markStyle?: BrandLogoMarkStyle;
  gradient?: string;
  strokeColor?: string;
  glow?: string;
}

const SIZE_STYLES: Record<BrandLogoSize, { titlePx: number; markPx: number; letterSpacingEm: number }> = {
  lg: { titlePx: 42, markPx: 42, letterSpacingEm: 0.06 },
  md: { titlePx: 33, markPx: 34, letterSpacingEm: 0.05 },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({ title = 'UseRhythm', tagline, size = 'lg', markStyle = 'left' }) => {
  const styles = SIZE_STYLES[size];
  return (
    <div className="ur-brand">
      <div
        className={markStyle === 'overlap' ? 'ur-brand__grid ur-brand__grid--overlap' : 'ur-brand__grid'}
        style={{
          '--ur-logo-size': `${styles.titlePx}px`,
          '--ur-logo-mark-size': `${styles.markPx}px`,
          '--ur-logo-letter-spacing': `${styles.letterSpacingEm}em`,
        } as React.CSSProperties}
      >
        <svg className="ur-brand__mark" width={styles.markPx} height={styles.markPx} viewBox="0 0 48 48" aria-hidden="true">
          <path d="M4 39h40M8 34V12m11 22V7m10 27V15m11 19V10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <div className="ur-brand__text">
          <h1 className="ur-logo" aria-label={title}>{title}</h1>
          {tagline ? <p className="ur-tagline">{tagline}</p> : null}
        </div>
      </div>
    </div>
  );
};
