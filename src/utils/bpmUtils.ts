import { BPMChange, SongInfo } from '../types/game';

/**
 * BPM으로 1비트의 길이(ms)를 계산
 */
export function getBeatDuration(bpm: number): number {
  return (60 / bpm) * 1000; // ms
}

/**
 * BPM으로 1비트의 길이(초)를 계산
 */
export function getBeatDurationSeconds(bpm: number): number {
  return 60 / bpm;
}

/**
 * 영상 길이와 BPM으로 총 비트 수 계산 (단일 BPM)
 * @param durationSeconds 영상 길이 (초)
 * @param bpm BPM
 * @returns 총 비트 수
 */
export function calculateTotalBeats(durationSeconds: number, bpm: number): number {
  return (durationSeconds * bpm) / 60;
}

/**
 * 변속을 고려한 총 비트 수 계산
 * @param durationSeconds 영상 길이 (초)
 * @param baseBpm 기본 BPM
 * @param bpmChanges BPM 변속 목록 (beatIndex 기준 정렬 필요)
 * @returns 총 비트 수
 */
export function calculateTotalBeatsWithChanges(
  durationSeconds: number,
  baseBpm: number,
  bpmChanges: BPMChange[]
): number {
  // 변속이 없으면 단순 계산
  if (!bpmChanges || bpmChanges.length === 0) {
    return calculateTotalBeats(durationSeconds, baseBpm);
  }

  // 변속 목록을 beatIndex 기준 정렬
  const sortedChanges = [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);

  // 시간을 소비하면서 비트 수 계산
  let totalBeats = 0;
  let currentBpm = baseBpm;
  let currentTimeSeconds = 0;

  for (const change of sortedChanges) {
    // 이 변속 지점까지의 비트 수 계산
    const beatsInThisSection = change.beatIndex - totalBeats;
    
    if (beatsInThisSection > 0) {
      // 이 구간에서 소비되는 시간 계산
      const timeForSection = (beatsInThisSection * 60) / currentBpm;
      currentTimeSeconds += timeForSection;
      
      // 영상 길이를 초과하면 중단
      if (currentTimeSeconds >= durationSeconds) {
        // 남은 시간으로 비트 수 계산
        const remainingTime = durationSeconds - (currentTimeSeconds - timeForSection);
        const remainingBeats = (remainingTime * currentBpm) / 60;
        return totalBeats + remainingBeats;
      }
      
      totalBeats = change.beatIndex;
    }
    
    // BPM 변경
    currentBpm = change.bpm;
  }

  // 마지막 구간: 남은 시간으로 비트 수 계산
  const remainingTime = durationSeconds - currentTimeSeconds;
  if (remainingTime > 0) {
    totalBeats += (remainingTime * currentBpm) / 60;
  }

  return totalBeats;
}

/**
 * 비트 인덱스를 시간(ms)으로 변환 (변속 고려)
 * @param beatIndex 비트 인덱스
 * @param baseBpm 기본 BPM
 * @param bpmChanges BPM 변속 목록
 * @returns 시간 (ms)
 */
export function beatIndexToTime(
  beatIndex: number,
  baseBpm: number,
  bpmChanges: BPMChange[]
): number {
  if (!bpmChanges || bpmChanges.length === 0) {
    return (beatIndex * 60 * 1000) / baseBpm;
  }

  const sortedChanges = [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);
  
  let timeMs = 0;
  let currentBpm = baseBpm;
  let currentBeatIndex = 0;

  for (const change of sortedChanges) {
    if (change.beatIndex >= beatIndex) {
      // 목표 비트 인덱스에 도달
      const beatsInThisSection = beatIndex - currentBeatIndex;
      timeMs += (beatsInThisSection * 60 * 1000) / currentBpm;
      return timeMs;
    }

    // 이 변속 지점까지의 시간 계산
    const beatsInThisSection = change.beatIndex - currentBeatIndex;
    timeMs += (beatsInThisSection * 60 * 1000) / currentBpm;
    
    currentBeatIndex = change.beatIndex;
    currentBpm = change.bpm;
  }

  // 마지막 구간
  const remainingBeats = beatIndex - currentBeatIndex;
  timeMs += (remainingBeats * 60 * 1000) / currentBpm;

  return timeMs;
}

/**
 * 시간(ms)을 비트 인덱스로 변환 (변속 고려)
 * @param timeMs 시간 (ms)
 * @param baseBpm 기본 BPM
 * @param bpmChanges BPM 변속 목록
 * @returns 비트 인덱스
 */
export function timeToBeatIndex(
  timeMs: number,
  baseBpm: number,
  bpmChanges: BPMChange[]
): number {
  if (!bpmChanges || bpmChanges.length === 0) {
    return (timeMs * baseBpm) / (60 * 1000);
  }

  const sortedChanges = [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);
  
  let currentTimeMs = 0;
  let currentBpm = baseBpm;
  let currentBeatIndex = 0;

  for (const change of sortedChanges) {
    // 이 변속 지점까지의 시간
    const beatsInThisSection = change.beatIndex - currentBeatIndex;
    const timeForSection = (beatsInThisSection * 60 * 1000) / currentBpm;
    
    if (currentTimeMs + timeForSection >= timeMs) {
      // 목표 시간이 이 구간 내에 있음
      const remainingTime = timeMs - currentTimeMs;
      const beatsInRemainingTime = (remainingTime * currentBpm) / (60 * 1000);
      return currentBeatIndex + beatsInRemainingTime;
    }

    currentTimeMs += timeForSection;
    currentBeatIndex = change.beatIndex;
    currentBpm = change.bpm;
  }

  // 마지막 구간
  const remainingTime = timeMs - currentTimeMs;
  const beatsInRemainingTime = (remainingTime * currentBpm) / (60 * 1000);
  return currentBeatIndex + beatsInRemainingTime;
}

/**
 * 특정 비트 인덱스에서의 BPM 가져오기
 * @param beatIndex 비트 인덱스
 * @param baseBpm 기본 BPM
 * @param bpmChanges BPM 변속 목록
 * @returns 해당 위치의 BPM
 */
export function getBpmAtBeatIndex(
  beatIndex: number,
  baseBpm: number,
  bpmChanges: BPMChange[]
): number {
  if (!bpmChanges || bpmChanges.length === 0) {
    return baseBpm;
  }

  const sortedChanges = [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);
  
  let currentBpm = baseBpm;
  
  for (const change of sortedChanges) {
    if (change.beatIndex > beatIndex) {
      break;
    }
    currentBpm = change.bpm;
  }

  return currentBpm;
}

/**
 * 특정 시간에서의 BPM 가져오기
 * @param timeMs 시간 (ms)
 * @param baseBpm 기본 BPM
 * @param bpmChanges BPM 변속 목록
 * @returns 해당 시간의 BPM
 */
export function getBpmAtTime(
  timeMs: number,
  baseBpm: number,
  bpmChanges: BPMChange[]
): number {
  const beatIndex = timeToBeatIndex(timeMs, baseBpm, bpmChanges);
  return getBpmAtBeatIndex(beatIndex, baseBpm, bpmChanges);
}

/**
 * SongInfo 객체 생성 (총 비트 수 자동 계산)
 */
export function createSongInfo(
  durationSeconds: number,
  baseBpm: number,
  bpmChanges: BPMChange[] = []
): SongInfo {
  const totalBeats = calculateTotalBeatsWithChanges(durationSeconds, baseBpm, bpmChanges);
  
  return {
    baseBpm,
    bpmChanges,
    durationSeconds,
    totalBeats,
  };
}

/**
 * 비트 수를 마디와 비트로 변환
 * @param beatIndex 비트 인덱스
 * @param beatsPerMeasure 마디당 비트 수 (기본 4)
 * @returns { measure: number, beat: number }
 */
export function beatToMeasureAndBeat(
  beatIndex: number,
  beatsPerMeasure: number = 4
): { measure: number; beat: number } {
  const measure = Math.floor(beatIndex / beatsPerMeasure) + 1;
  const beat = (beatIndex % beatsPerMeasure) + 1;
  return { measure, beat };
}

/**
 * 마디와 비트를 비트 인덱스로 변환
 * @param measure 마디 번호 (1부터 시작)
 * @param beat 비트 번호 (1부터 시작)
 * @param beatsPerMeasure 마디당 비트 수 (기본 4)
 * @returns 비트 인덱스
 */
export function measureAndBeatToBeatIndex(
  measure: number,
  beat: number,
  beatsPerMeasure: number = 4
): number {
  return (measure - 1) * beatsPerMeasure + (beat - 1);
}

/**
 * 영상 길이를 비트 수로 변환 후 포맷팅
 * @param durationSeconds 영상 길이 (초)
 * @param baseBpm 기본 BPM
 * @param bpmChanges BPM 변속 목록
 * @param beatsPerMeasure 마디당 비트 수 (기본 4)
 * @returns 포맷팅된 문자열 (예: "32마디 + 2비트")
 */
export function formatSongLength(
  durationSeconds: number,
  baseBpm: number,
  bpmChanges: BPMChange[] = [],
  beatsPerMeasure: number = 4
): string {
  const totalBeats = calculateTotalBeatsWithChanges(durationSeconds, baseBpm, bpmChanges);
  const { measure, beat } = beatToMeasureAndBeat(totalBeats, beatsPerMeasure);
  
  if (beat === 1) {
    return `${measure}마디`;
  }
  return `${measure - 1}마디 + ${beat - 1}비트`;
}

/**
 * 총 비트 수를 시간(초)으로 변환 (변속 고려)
 */
export function totalBeatsToSeconds(
  totalBeats: number,
  baseBpm: number,
  bpmChanges: BPMChange[] = []
): number {
  return beatIndexToTime(totalBeats, baseBpm, bpmChanges) / 1000;
}


