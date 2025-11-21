export type Lane = 0 | 1 | 2 | 3;

export type NoteType = 'tap' | 'hold';

export interface Note {
  id: number;
  lane: Lane;
  time: number; // 시작 시각 (ms)
  duration: number; // 지속 시간 (ms) - 탭은 0
  endTime: number; // time + duration
  type: NoteType;
  y: number;
  hit: boolean;
}

export type JudgeType = 'perfect' | 'great' | 'good' | 'miss';

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

