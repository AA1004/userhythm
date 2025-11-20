export type Lane = 0 | 1 | 2 | 3;

export type JudgeType = 'perfect' | 'great' | 'good' | 'miss' | null;

export interface Note {
  id: number;
  lane: Lane;
  time: number; // 노트가 판정선에 도달하는 시간 (ms)
  y: number; // 화면상 y 좌표
  hit: boolean; // 이미 맞췄는지
}

export interface Score {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  combo: number;
  maxCombo: number;
}

export interface GameState {
  notes: Note[];
  score: Score;
  currentTime: number;
  gameStarted: boolean;
  gameEnded: boolean;
}

