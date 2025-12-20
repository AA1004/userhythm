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

// 화면 표시 관련 상수
/** 화면 위에서 노트가 보이기 시작하는 여유 시간 (ms) */
export const NOTE_VISIBILITY_BUFFER_MS = 200;
/** 판정 피드백 표시 시간 (ms) */
export const JUDGE_FEEDBACK_DURATION_MS = 800;

// 미리듣기 설정
export const PREVIEW_FADE_DURATION_MS = 200; // 미리듣기 오디오 페이드 인/아웃 시간 (ms)
export const PREVIEW_TRANSITION_DURATION_MS = 360; // 채보 전환 시 BGA 페이드 시간 (ms)
export const PREVIEW_VOLUME = 30; // 미리듣기 볼륨 (0-100)
export const PREVIEW_BGA_OPACITY = 0.25; // 미리듣기 BGA 배경 투명도

// localStorage 키 상수들
export const DISPLAY_NAME_STORAGE_KEY = 'rhythmGameDisplayName';
export const KEY_BINDINGS_STORAGE_KEY = 'rhythmGameKeyBindings';
export const NOTE_SPEED_STORAGE_KEY = 'rhythmGameNoteSpeed';
export const BGA_ENABLED_STORAGE_KEY = 'rhythmGameBgaEnabled';
export const JUDGE_LINE_Y_STORAGE_KEY = 'rhythmGameJudgeLineY';

