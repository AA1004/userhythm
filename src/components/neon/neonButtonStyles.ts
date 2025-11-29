import { CHART_EDITOR_THEME } from '../ChartEditor/constants';

/**
 * 네온 스타일 CTA 버튼의 기본 스타일 객체를 반환합니다.
 * hover/active 상태는 onMouseEnter/onMouseLeave에서 처리합니다.
 */
export const getNeonButtonStyle = (variant: 'primary' | 'secondary' = 'primary') => {
  const baseStyle: React.CSSProperties = {
    padding: '20px 40px',
    fontSize: '22px',
    background: CHART_EDITOR_THEME.ctaButtonGradient,
    color: CHART_EDITOR_THEME.textPrimary,
    border: variant === 'primary' 
      ? `1px solid ${CHART_EDITOR_THEME.accentStrong}` 
      : `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
    borderRadius: CHART_EDITOR_THEME.radiusLg,
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.2s',
    boxShadow: `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`,
  };

  return baseStyle;
};

/**
 * 네온 버튼의 hover 핸들러를 반환합니다.
 */
export const getNeonButtonHoverHandlers = () => ({
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
    e.currentTarget.style.transform = 'translateY(-2px)';
    e.currentTarget.style.boxShadow = `0 6px 16px ${CHART_EDITOR_THEME.accentSoft}`;
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`;
  },
});

/**
 * 네온 스타일 카드 컨테이너의 기본 스타일을 반환합니다.
 */
export const getNeonCardStyle = (): React.CSSProperties => ({
  backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
  borderRadius: CHART_EDITOR_THEME.radiusLg,
  boxShadow: CHART_EDITOR_THEME.shadowSoft,
  padding: CHART_EDITOR_THEME.paddingLg,
});

