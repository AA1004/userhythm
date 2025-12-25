// 채보 판정값을 한 곳에서 관리하기 위한 설정 파일입니다.
// 필요에 따라 아래 숫자를 수정하면 전체 판정 로직에 즉시 반영됩니다.

export interface JudgeWindowConfig {
  /**
   * Perfect 판정 허용 범위 (±ms)
   */
  perfect: number;
  /**
   * Great 판정 허용 범위 (±ms)
   */
  great: number;
  /**
   * Good 판정 허용 범위 (±ms)
   */
  good: number;
}

export interface JudgeScoreConfig {
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

export interface JudgeConfig {
  windows: JudgeWindowConfig;
  /** 롱노트를 떼는 판정 윈도우 (일반 판정보다 여유롭게 설정) */
  holdReleaseWindows: JudgeWindowConfig;
  scores: JudgeScoreConfig;
  /** Miss 판정 기준값 (노트가 판정선을 지나간 후 Miss로 처리되는 시간, ms) */
  missThreshold: number;
  /** 노트 검색 범위 (키 입력 시 판정 가능한 최대 시간 차이, ms) */
  noteSearchRange: number;
}

export const judgeConfig: JudgeConfig = {
  windows: {
    perfect: 45,  // ±45ms (일반 리듬게임 수준)
    great: 90,    // ±90ms
    good: 135,    // ±135ms
  },
  // 롱노트 떼기 판정은 일반 판정보다 1.25배 더 여유롭게
  holdReleaseWindows: {
    perfect: 56,  // ±56ms (45ms의 1.25배)
    great: 112,   // ±112ms (90ms의 1.25배)
    good: 168,    // ±168ms (135ms의 1.25배)
  },
  scores: {
    perfect: 100,
    great: 80,
    good: 50,
    miss: 0,
  },
  /** Miss 판정 기준값: 노트가 판정선을 지나간 후 Miss로 처리되는 시간 */
  missThreshold: 135,
  /** 노트 검색 범위: 키 입력 시 판정 가능한 최대 시간 차이 */
  noteSearchRange: 135,
};
