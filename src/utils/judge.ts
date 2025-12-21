import { judgeConfig } from '../config/judgeConfig';
import { JudgeType } from '../types/game';

/**
 * 타이밍 판정
 * @param timeDiff 노트 시간 - 현재 시간 (양수: 노트가 아직 안 옴, 음수: 노트가 지나감)
 * @returns 판정 결과 (null: 너무 일찍 쳐서 판정 불가)
 */
export function judgeTiming(timeDiff: number): JudgeType | null {
  const { windows } = judgeConfig;
  const absDiff = Math.abs(timeDiff);

  if (absDiff <= windows.perfect) {
    return 'perfect';
  } else if (absDiff <= windows.great) {
    return 'great';
  } else if (absDiff <= windows.good) {
    return 'good';
  } else if (timeDiff < 0) {
    // 노트가 지나간 경우에만 miss (늦게 침)
    return 'miss';
  } else {
    // 너무 일찍 친 경우 - 판정하지 않음
    return null;
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

