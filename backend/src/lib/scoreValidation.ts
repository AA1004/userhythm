import { validateChartDataJson, ValidatedChartData } from './chartData';

export interface ScoreCounts {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  maxCombo: number;
}

export type ScoreValidationResult =
  | {
      ok: true;
      counts: ScoreCounts;
      accuracy: number;
      chart: ValidatedChartData;
    }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readNonNegativeInteger = (
  source: Record<string, unknown>,
  key: keyof ScoreCounts
): number | null => {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
};

const calculateAccuracy = (counts: Omit<ScoreCounts, 'maxCombo'>, expectedJudgments: number): number => {
  if (expectedJudgments <= 0) return 0;
  return ((counts.perfect * 100 + counts.great * 80 + counts.good * 50) / (expectedJudgments * 100)) * 100;
};

export const validateScoreSubmission = (
  body: unknown,
  chartDataJson: string
): ScoreValidationResult => {
  if (!isRecord(body)) return { ok: false, error: 'invalid_body' };

  const chart = validateChartDataJson(chartDataJson, { allowAdminDifficulty: true });
  if (!chart.ok) return { ok: false, error: 'invalid_chart_data' };
  if (chart.expectedJudgments <= 0) return { ok: false, error: 'chart_has_no_judgments' };

  const scoreSource = isRecord(body.score) ? body.score : body;
  const perfect = readNonNegativeInteger(scoreSource, 'perfect');
  const great = readNonNegativeInteger(scoreSource, 'great');
  const good = readNonNegativeInteger(scoreSource, 'good');
  const miss = readNonNegativeInteger(scoreSource, 'miss');
  const maxCombo = readNonNegativeInteger(scoreSource, 'maxCombo');

  if (perfect === null || great === null || good === null || miss === null || maxCombo === null) {
    return { ok: false, error: 'invalid_score_counts' };
  }

  const total = perfect + great + good + miss;
  if (total !== chart.expectedJudgments) {
    return { ok: false, error: 'score_count_mismatch' };
  }

  if (
    perfect > chart.expectedJudgments ||
    great > chart.expectedJudgments ||
    good > chart.expectedJudgments ||
    miss > chart.expectedJudgments ||
    maxCombo > chart.expectedJudgments
  ) {
    return { ok: false, error: 'score_count_too_large' };
  }

  const hitJudgments = perfect + great + good;
  if (maxCombo > hitJudgments) {
    return { ok: false, error: 'invalid_max_combo' };
  }

  const accuracy = calculateAccuracy({ perfect, great, good, miss }, chart.expectedJudgments);
  const clientAccuracy = typeof body.accuracy === 'number' ? body.accuracy : null;
  if (clientAccuracy !== null) {
    if (!Number.isFinite(clientAccuracy) || clientAccuracy < 0 || clientAccuracy > 100) {
      return { ok: false, error: 'invalid_accuracy' };
    }
    if (Math.abs(clientAccuracy - accuracy) > 0.05) {
      return { ok: false, error: 'accuracy_mismatch' };
    }
  }

  return {
    ok: true,
    counts: { perfect, great, good, miss, maxCombo },
    accuracy,
    chart,
  };
};
