/**
 * 자막 스타일 정의
 */
export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number; // px
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string; // hex color
  backgroundColor?: string; // optional background
  textAlign?: 'left' | 'center' | 'right';
}

/**
 * 기본 자막 스타일
 */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Noto Sans KR, sans-serif',
  fontSize: 24,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#FFFFFF',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  textAlign: 'center',
};

/**
 * 자막 큐 (개별 자막 항목)
 */
export interface SubtitleCue {
  id: string;
  chartId: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  style: SubtitleStyle;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 자막 데이터 생성용 (id, createdAt, updatedAt 제외)
 */
export type SubtitleCueCreate = Omit<SubtitleCue, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * 자막 데이터 업데이트용
 */
export type SubtitleCueUpdate = Partial<Omit<SubtitleCue, 'id' | 'chartId' | 'createdAt'>>;

/**
 * 폰트 프리셋 목록
 */
export const FONT_PRESETS = [
  { label: 'Noto Sans KR', value: 'Noto Sans KR, sans-serif' },
  { label: 'Noto Serif KR', value: 'Noto Serif KR, serif' },
  { label: 'Pretendard', value: 'Pretendard, sans-serif' },
  { label: 'Gothic A1', value: 'Gothic A1, sans-serif' },
  { label: 'Jua', value: 'Jua, sans-serif' },
  { label: 'Black Han Sans', value: 'Black Han Sans, sans-serif' },
];

/**
 * 폰트 크기 프리셋
 */
export const FONT_SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64];

/**
 * 색상 프리셋
 */
export const COLOR_PRESETS = [
  '#FFFFFF', // 흰색
  '#FFFF00', // 노랑
  '#00FF00', // 초록
  '#00FFFF', // 시안
  '#FF00FF', // 마젠타
  '#FF0000', // 빨강
  '#FFA500', // 주황
  '#FF69B4', // 핑크
  '#87CEEB', // 하늘색
  '#000000', // 검정
];

