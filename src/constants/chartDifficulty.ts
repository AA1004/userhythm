export interface ChartDifficultyDefinition {
  id: string;
  label: string;
  color: string;
  order: number;
}

export const ADMIN_CHART_DIFFICULTY_OPTIONS = [
  '1', '2', '3', '4', '5',
  '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15',
  '15下', '15中', '15上',
] as const;

const ADMIN_DIFFICULTY_COLOR_MAP: Record<string, string> = {
  '1': '#43a047',
  '2': '#4caf50',
  '3': '#66bb6a',
  '4': '#7cb342',
  '5': '#9ccc65',
  '6': '#c0ca33',
  '7': '#d4e157',
  '8': '#fdd835',
  '9': '#ffca28',
  '10': '#ffb300',
  '11': '#fb8c00',
  '12': '#f4511e',
  '13': '#ef5350',
  '14': '#e53935',
  '15': '#d32f2f',
  '15下': '#c62828',
  '15中': '#ad1457',
  '15上': '#7b1fa2',
};

export const CHART_DIFFICULTIES: ChartDifficultyDefinition[] = [
  { id: 'easy', label: 'Easy', color: '#4CAF50', order: 10 },
  { id: 'normal', label: 'Normal', color: '#2196F3', order: 20 },
  { id: 'hard', label: 'Hard', color: '#FF9800', order: 30 },
  { id: 'expert', label: 'Expert', color: '#f44336', order: 40 },
  { id: 'insane', label: 'INSANE', color: '#b91c1c', order: 50 },
];

export function normalizeAdminChartDifficulty(difficulty?: string | null): string {
  return (difficulty ?? '').trim();
}

export function isAdminChartDifficulty(difficulty?: string | null): boolean {
  const normalized = normalizeAdminChartDifficulty(difficulty);
  return ADMIN_CHART_DIFFICULTY_OPTIONS.includes(normalized as typeof ADMIN_CHART_DIFFICULTY_OPTIONS[number]);
}

export function getDisplayChartDifficulty(
  difficulty?: string | null,
  adminDifficulty?: string | null
): string | null {
  const preferred = normalizeAdminChartDifficulty(adminDifficulty);
  if (preferred) return preferred;
  const fallback = (difficulty ?? '').trim();
  return fallback || null;
}

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
  if (isAdminChartDifficulty(difficulty)) {
    return ADMIN_DIFFICULTY_COLOR_MAP[normalizeAdminChartDifficulty(difficulty)] ?? '#616161';
  }
  return getChartDifficultyDefinition(difficulty)?.color ?? '#616161';
}
