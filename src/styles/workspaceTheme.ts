import { CHART_EDITOR_THEME } from '../components/ChartEditor/constants';

// Opt-in UI palette: gameplay colors and timeline geometry stay untouched.
export const WORKSPACE_THEME = {
  ...CHART_EDITOR_THEME,
  surfaceElevated: '#10181f',
  textPrimary: '#e8eeeb',
  textSecondary: '#a6b3b3',
  textMuted: '#849495',
  borderSubtle: '#2a373d',
  borderStrong: '#526663',
  accent: '#79ddba',
  accentStrong: '#79ddba',
  buttonPrimaryBg: '#79ddba',
  buttonPrimaryBgHover: '#99e8cb',
  buttonPrimaryText: '#10251e',
  buttonGhostBgHover: '#1b292e',
  radiusSm: 6,
  radiusMd: 6,
  radiusLg: 8,
  shadowSoft: 'none',
  shadowStrong: 'none',
  titleGlow: 'none',
} as const;
