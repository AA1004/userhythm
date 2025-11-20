import { JudgeType } from '../types/game';

const PERFECT_THRESHOLD = 50; // ±50ms
const GREAT_THRESHOLD = 100; // ±100ms
const GOOD_THRESHOLD = 150; // ±150ms

export function judgeTiming(timeDiff: number): JudgeType {
  const absDiff = Math.abs(timeDiff);
  
  if (absDiff <= PERFECT_THRESHOLD) {
    return 'perfect';
  } else if (absDiff <= GREAT_THRESHOLD) {
    return 'great';
  } else if (absDiff <= GOOD_THRESHOLD) {
    return 'good';
  } else {
    return 'miss';
  }
}

export function getJudgeScore(judge: JudgeType): number {
  switch (judge) {
    case 'perfect':
      return 100;
    case 'great':
      return 80;
    case 'good':
      return 50;
    case 'miss':
      return 0;
    default:
      return 0;
  }
}

