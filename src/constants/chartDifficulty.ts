export interface ChartDifficultyDefinition {
  id: string;
  label: string;
  color: string;
  order: number;
}

export const CHART_DIFFICULTIES: ChartDifficultyDefinition[] = [
  { id: 'easy', label: 'Easy', color: '#4CAF50', order: 10 },
  { id: 'normal', label: 'Normal', color: '#2196F3', order: 20 },
  { id: 'hard', label: 'Hard', color: '#FF9800', order: 30 },
  { id: 'expert', label: 'Expert', color: '#f44336', order: 40 },
  { id: 'insane', label: 'INSANE', color: '#b91c1c', order: 50 },
];

export function normalizeChartDifficulty(difficulty?: string | null): string {
  return (difficulty ?? '').trim().toLowerCase();
}

export function getChartDifficultyDefinition(
  difficulty?: string | null
): ChartDifficultyDefinition | undefined {
  const normalized = normalizeChartDifficulty(difficulty);
  return CHART_DIFFICULTIES.find((entry) => entry.id === normalized);
}

export function getChartDifficultyColor(difficulty?: string | null): string {
  return getChartDifficultyDefinition(difficulty)?.color ?? '#616161';
}
