import { judgeConfig } from '../config/judgeConfig';
import { JudgeType } from '../types/game';

export function judgeTiming(timeDiff: number): JudgeType {
  const { windows } = judgeConfig;
  const absDiff = Math.abs(timeDiff);
  
  if (absDiff <= windows.perfect) {
    return 'perfect';
  } else if (absDiff <= windows.great) {
    return 'great';
  } else if (absDiff <= windows.good) {
    return 'good';
  } else {
    return 'miss';
  }
}

/**
 * 롱노트를 떼는 타이밍 판정 (일반 판정보다 여유로움)
 */
export function judgeHoldReleaseTiming(timeDiff: number): JudgeType {
  const { holdReleaseWindows } = judgeConfig;
  const absDiff = Math.abs(timeDiff);
  
  if (absDiff <= holdReleaseWindows.perfect) {
    return 'perfect';
  } else if (absDiff <= holdReleaseWindows.great) {
    return 'great';
  } else if (absDiff <= holdReleaseWindows.good) {
    return 'good';
  } else {
    return 'miss';
  }
}

export function getJudgeScore(judge: JudgeType): number {
  const score = judgeConfig.scores[judge];
  return typeof score === 'number' ? score : 0;
}

