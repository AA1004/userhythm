// ChartEditor 상수 정의

export const AUTO_SAVE_KEY = 'chartEditorLastChart';
// 레인 중심 좌표 (래퍼 너비 400px 기준)
export const LANE_WIDTH = 100;
export const LANE_POSITIONS = [50, 150, 250, 350] as const;
export const TAP_NOTE_HEIGHT = 42;
export const PIXELS_PER_SECOND = 200;
export const TIMELINE_TOP_PADDING = 60;
export const TIMELINE_BOTTOM_PADDING = 640; // JUDGE_LINE_Y
export const MIN_TIMELINE_DURATION_MS = 120000;
export const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

// ChartEditor 전용 UI 테마 토큰
// - 색상, 여백, radius, shadow 등을 한 곳에서 관리해
//   인라인 스타일을 점진적으로 치환하기 위한 용도입니다.

export const CHART_EDITOR_THEME = {
  // 배경 계층
  rootBackground: '#020617', // 전체 배경 (거의 검정에 가까운 남색)
  surface: '#020617', // 기본 패널/카드 배경
  surfaceElevated: '#0b1120',
  sidebarBackground: '#020617',

  // 테두리/구분선
  borderSubtle: 'rgba(148, 163, 184, 0.35)',
  borderStrong: 'rgba(148, 163, 184, 0.8)',

  // 텍스트
  textPrimary: '#e5e7eb',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',

  // 액션 / 포커스 색
  accent: '#38bdf8', // 메인 포인트 (시안 계열)
  accentSoft: 'rgba(56, 189, 248, 0.14)',
  accentStrong: '#22d3ee',
  danger: '#f97373',

  // 버튼 / 카드 공통
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 14,
  paddingSm: 6,
  paddingMd: 10,
  paddingLg: 16,

  // 그림자 프리셋
  shadowSoft: '0 12px 30px rgba(15, 23, 42, 0.85)',
  shadowStrong: '0 0 0 1px rgba(34, 211, 238, 0.9), 0 22px 50px rgba(15, 23, 42, 0.95)',
  
  // 메인 화면 전용
  titleGradient: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 50%, #818cf8 100%)',
  titleGlow: '0 0 40px rgba(56, 189, 248, 0.5)',
  ctaButtonGradient: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(34, 211, 238, 0.15))',
  ctaButtonGradientHover: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(34, 211, 238, 0.25))',
  backgroundGradient: 'radial-gradient(circle at top, #020617 0%, #0b1120 40%, #020617 100%)',
} as const;

