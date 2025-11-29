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

<<<<<<< HEAD
// BPM 변속 관련 타입
export interface BPMChange {
  id: number;
  beatIndex: number; // 변속이 시작되는 비트 인덱스
  bpm: number; // 새로운 BPM
}

// 곡 정보 (변속 포함)
export interface SongInfo {
  baseBpm: number; // 기본 BPM
  bpmChanges: BPMChange[]; // BPM 변속 목록 (비트 인덱스 기준 정렬)
  durationSeconds: number; // 영상 길이 (초)
  totalBeats: number; // 계산된 총 비트 수
}

export interface TimeSignatureEvent {
  id: number;
  beatIndex: number; // 곡 전체 기준 비트 인덱스
  beatsPerMeasure: number; // 예: 4(4/4), 3(3/4)
}

export interface ChartTestPayload {
  notes: Note[];
  startTimeMs: number;
  youtubeVideoId: string | null;
  youtubeUrl: string;
  playbackSpeed: number;
  audioOffsetMs?: number;
}

export interface SubtitleEditorChartData {
  chartId: string;
  notes: Note[];
  bpm: number;
  youtubeVideoId?: string | null;
  youtubeUrl?: string;
  title?: string;
}

=======


// BPM change type
export interface BPMChange {
  id: number;
  beatIndex: number;
  bpm: number;
}
>>>>>>> 3fd4119591065306316a17aa46653447590ade12
