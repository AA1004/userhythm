import { SpeedChange } from '../types/game';

/**
 * 주어진 시간(timeMs)에서 적용되는 BPM을 계산합니다.
 * - speedChanges는 시간 순으로 정렬되어 있다고 가정하지 않고, 내부에서 정렬합니다.
 * - startTimeMs <= timeMs < endTimeMs 인 마지막 구간의 bpm을 사용합니다.
 * - 어떤 구간에도 속하지 않으면 baseBpm을 반환합니다.
 */
export function getEffectiveBPM(
  timeMs: number,
  baseBpm: number,
  speedChanges: SpeedChange[]
): number {
  if (!speedChanges || speedChanges.length === 0) return baseBpm;

  const sorted = [...speedChanges].sort(
    (a, b) => a.startTimeMs - b.startTimeMs
  );

  let effectiveBpm = baseBpm;

  for (const change of sorted) {
    if (timeMs >= change.startTimeMs) {
      if (change.endTimeMs == null || timeMs < change.endTimeMs) {
        effectiveBpm = change.bpm;
      }
    } else {
      // 이후 구간들은 더 뒤 시간대이므로 중단
      break;
    }
  }

  return effectiveBpm;
}

/**
 * 특정 시점의 스크롤 속도 배율을 반환합니다.
 * - baseBpm 대비 몇 배 빠른지(>1 빠름, <1 느림)를 의미합니다.
 */
export function getScrollSpeedMultiplier(
  timeMs: number,
  baseBpm: number,
  speedChanges: SpeedChange[]
): number {
  if (baseBpm <= 0) return 1;
  const bpm = getEffectiveBPM(timeMs, baseBpm, speedChanges);
  return bpm / baseBpm;
}

/**
 * 노트의 낙하 시간(fallDuration)을 변속에 맞게 보정합니다.
 *
 * 현재 구현:
 * - 노트의 판정 시각(noteTime)에 적용되는 BPM을 기준으로
 *   baseFallDuration을 배율로 스케일링합니다.
 * - 예) baseBpm=120, 변속Bpm=180 -> multiplier=1.5 -> 더 빠르게 떨어지도록
 *       fallDuration = baseFallDuration * (baseBpm / effectiveBpm)
 *
 * 향후 필요 시, 변속 구간을 여러 개 통과하는 경우에 대해
 * 구간별 적분 방식으로 확장할 수 있습니다.
 */
export function getNoteFallDuration(
  noteTimeMs: number,
  _currentTimeMs: number,
  baseBpm: number,
  speedChanges: SpeedChange[],
  baseFallDuration: number
): number {
  if (baseBpm <= 0 || baseFallDuration <= 0) {
    return baseFallDuration;
  }

  const effectiveBpm = getEffectiveBPM(noteTimeMs, baseBpm, speedChanges);
  if (effectiveBpm <= 0) return baseFallDuration;

  const ratio = baseBpm / effectiveBpm;
  return baseFallDuration * ratio;
}


