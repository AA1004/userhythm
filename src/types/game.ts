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

// 속도/변속 관련 타입
// - SpeedChange: 시간(ms) 기준 절대 BPM
// - BPMChange: 비트 인덱스 기준 BPM 변경(기존 ChartEditor용)
export interface SpeedChange {
  id: number;
  startTimeMs: number; // 변속 시작 시간(ms)
  endTimeMs: number | null; // 변속 종료 시간(ms) - null이면 곡 끝까지
  bpm: number; // 이 구간에서 적용할 절대 BPM
}

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
  bpm?: number;
  speedChanges?: SpeedChange[];
  chartId?: string;
}

export interface SubtitleEditorChartData {
  chartId: string;
  notes: Note[];
  bpm: number;
  youtubeVideoId?: string | null;
  youtubeUrl?: string;
  title?: string;
}
