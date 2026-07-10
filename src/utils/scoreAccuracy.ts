import type { Score } from '../types/game';

/** HUD, result, and server validation share Perfect 100 / Great 80 / Good 50. */
export function calculateScoreAccuracy(score: Pick<Score, 'perfect' | 'great' | 'good' | 'miss'>): number {
  const total = score.perfect + score.great + score.good + score.miss;
  if (total <= 0) return 100;
  return ((score.perfect * 100 + score.great * 80 + score.good * 50) / (total * 100)) * 100;
}
