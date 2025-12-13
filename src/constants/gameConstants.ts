// 4개 레인을 더 붙이도록 배치: 각 레인 100px 너비, 4개 = 400px
// 좌우 여백을 3분의 1로 줄임: (700 - 400) / 2 / 3 = 50px
// 각 레인 중앙: 50 + 50 = 100px, 이후 100px씩 간격
// 판정선: 50px ~ 450px (4개 레인 영역)
export const LANE_POSITIONS = [100, 200, 300, 400] as const;
export const JUDGE_LINE_LEFT = 50; // 판정선 시작 위치 (첫 레인 왼쪽)
export const JUDGE_LINE_WIDTH = 400; // 판정선 너비 (4개 레인 영역)
export const JUDGE_LINE_Y = 640;

export const DEFAULT_GAME_DURATION = 30000; // 30초 (기본 랜덤 게임 / 리셋 시 사용)
export const MAX_CHART_DURATION = 300000; // 5분 (채보 기반 게임의 상한값)
export const START_DELAY_MS = 4000;
export const BASE_FALL_DURATION = 2000; // 기본 노트 낙하 시간(ms)

export const DEFAULT_KEY_BINDINGS: [string, string, string, string] = ['D', 'F', 'J', 'K'];

// localStorage 키 상수들
export const DISPLAY_NAME_STORAGE_KEY = 'rhythmGameDisplayName';
export const KEY_BINDINGS_STORAGE_KEY = 'rhythmGameKeyBindings';
export const NOTE_SPEED_STORAGE_KEY = 'rhythmGameNoteSpeed';
export const BGA_ENABLED_STORAGE_KEY = 'rhythmGameBgaEnabled';

