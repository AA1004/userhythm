/**
 * 자막 스타일 / 레이아웃 / 효과 정의
 *
 * - ChartEditor / SubtitleEditor / Game 플레이 화면에서 공통으로 사용됩니다.
 */
export type SubtitleHorizontalAlign = 'left' | 'center' | 'right';
export type SubtitleVerticalAlign = 'top' | 'middle' | 'bottom';

export interface SubtitlePosition {
  /** 0~1 비율 기준 X 좌표 (0 = 왼쪽, 1 = 오른쪽) */
  x: number;
  /** 0~1 비율 기준 Y 좌표 (0 = 위, 1 = 아래) */
  y: number;
}

export type SubtitleEffectType = 'none' | 'fade';

export interface SubtitleStyle {
  /** 폰트 패밀리 */
  fontFamily: string;
  /** 폰트 크기(px) */
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  /** 글자 색 (hex 또는 rgba) */
  color: string;
  /** 텍스트 박스 배경색 (기본 배경) */
  backgroundColor?: string;
  /** 배경 투명도 (0~1, backgroundColor가 있을 때 사용) */
  backgroundOpacity?: number;
  /** 배경 표시 여부 (false면 배경 숨김) */
  showBackground?: boolean;
  /** 외곽선 색상 */
  outlineColor?: string;
  /** 수평 정렬 */
  textAlign?: SubtitleHorizontalAlign;

  /**
   * 위치 및 정렬 (0~1 비율 좌표 기반)
   * - position: 기준점 위치
   * - align.horizontal / vertical: 기준점이 텍스트의 어느 지점인지
   */
  position?: SubtitlePosition;
  align?: {
    horizontal: SubtitleHorizontalAlign;
    vertical: SubtitleVerticalAlign;
  };
  /** 회전 각도 (deg) */
  rotationDeg?: number;

  /**
   * 트랙 식별자
   * - 여러 자막 트랙(상단/하단/효과 자막 등)을 구분하기 위한 용도
   * - DB 스키마에는 별도 컬럼이 없으므로 style JSON 안에 함께 저장합니다.
   */
  trackId?: string;

  /** 전환 효과 (in/out) */
  inEffect?: SubtitleEffectType;
  outEffect?: SubtitleEffectType;
  inDurationMs?: number;
  outDurationMs?: number;
}

/**
 * 기본 자막 스타일
 * - 하단 중앙에 배치된 일반 가사 자막을 기준으로 합니다.
 */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Noto Sans KR, sans-serif',
  fontSize: 24,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.5,
  showBackground: true,
  outlineColor: '#000000',
  textAlign: 'center',
  position: { x: 0.5, y: 0.9 },
  align: {
    horizontal: 'center',
    vertical: 'bottom',
  },
  rotationDeg: 0,
  trackId: 'default',
  inEffect: 'none',
  outEffect: 'none',
  inDurationMs: 120,
  outDurationMs: 120,
};

/**
 * 자막 큐 (개별 자막 항목)
 */
export interface SubtitleCue {
  id: string;
  chartId: string;
  /**
   * 자막이 속한 트랙 ID
   * - 지정되지 않은 경우 style.trackId 또는 'default'로 간주합니다.
   */
  trackId?: string;
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
 * 사용자 폰트 저장/로드 유틸리티
 */
const CUSTOM_FONTS_STORAGE_KEY = 'subtitleCustomFonts';

export interface CustomFont {
  label: string;
  value: string;
}

export const getCustomFonts = (): CustomFont[] => {
  try {
    const stored = localStorage.getItem(CUSTOM_FONTS_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as CustomFont[];
  } catch {
    return [];
  }
};

export const saveCustomFonts = (fonts: CustomFont[]): void => {
  try {
    localStorage.setItem(CUSTOM_FONTS_STORAGE_KEY, JSON.stringify(fonts));
  } catch (error) {
    console.error('Failed to save custom fonts:', error);
  }
};

export const addCustomFont = (label: string, value: string): void => {
  const fonts = getCustomFonts();
  // 중복 체크
  if (fonts.some((f) => f.value === value)) return;
  fonts.push({ label, value });
  saveCustomFonts(fonts);
};

export const removeCustomFont = (value: string): void => {
  const fonts = getCustomFonts();
  const filtered = fonts.filter((f) => f.value !== value);
  saveCustomFonts(filtered);
};

/**
 * 모든 폰트 목록 (프리셋 + 사용자 폰트)
 */
export const getAllFonts = (): CustomFont[] => {
  const customFonts = getCustomFonts();
  return [...FONT_PRESETS, ...customFonts];
};

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

/**
 * 자막 트랙 정의
 * - 에디터에서 여러 레이어(상단 설명, 하단 가사, 효과 자막)를 구분하기 위한 타입
 */
export interface SubtitleTrack {
  id: string;
  name: string;
  /**
   * 기본 위치 프리셋
   * - top: 상단, middle: 중앙, bottom: 하단
   */
  positionPreset: 'top' | 'middle' | 'bottom';
  /** 해당 트랙에 기본으로 적용할 스타일 (필요한 부분만 덮어쓰기) */
  defaultStyle?: Partial<SubtitleStyle>;
}

export const DEFAULT_SUBTITLE_TRACKS: SubtitleTrack[] = [
  {
    id: 'track-1',
    name: '트랙 1',
    positionPreset: 'bottom',
    defaultStyle: {
      position: { x: 0.5, y: 0.9 },
      align: { horizontal: 'center', vertical: 'bottom' },
      trackId: 'track-1',
    },
  },
];

