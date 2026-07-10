export function getChartPayload(raw: unknown): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const value = raw as Record<string, any>;
  return value.chart && typeof value.chart === 'object' && !Array.isArray(value.chart)
    ? value.chart as Record<string, any>
    : value;
}
