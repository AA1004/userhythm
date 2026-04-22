type GameplayMetricName =
  | 'noteRender'
  | 'visibleNoteFilter'
  | 'visibleCursor'
  | 'missScan'
  | 'judgeScan'
  | 'hitProcessing'
  | 'reactRender'
  | 'activeSubtitle'
  | 'bgaSync'
  | 'webglRender'
  | 'spritePoolUpdate'
  | 'effectRender';

interface MetricBucket {
  count: number;
  totalMs: number;
  maxMs: number;
  totalItems: number;
}

const PROFILE_FLAG_KEY = 'userhythm:profile-gameplay';
const REPORT_INTERVAL_MS = 1000;
const buckets = new Map<GameplayMetricName, MetricBucket>();
let enabledCache: boolean | null = null;
let lastReportAt = 0;

export const isGameplayProfilerEnabled = () => {
  if (enabledCache !== null) return enabledCache;
  try {
    enabledCache = localStorage.getItem(PROFILE_FLAG_KEY) === '1';
  } catch {
    enabledCache = false;
  }
  return enabledCache;
};

export const recordGameplayMetric = (
  name: GameplayMetricName,
  durationMs: number,
  itemCount: number = 0
) => {
  if (!isGameplayProfilerEnabled()) return;

  const bucket = buckets.get(name) ?? {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    totalItems: 0,
  };
  bucket.count += 1;
  bucket.totalMs += durationMs;
  bucket.maxMs = Math.max(bucket.maxMs, durationMs);
  bucket.totalItems += itemCount;
  buckets.set(name, bucket);

  const now = performance.now();
  if (now - lastReportAt < REPORT_INTERVAL_MS) return;
  lastReportAt = now;

  const report = Array.from(buckets.entries()).reduce<Record<string, string>>(
    (acc, [metricName, value]) => {
      const avgMs = value.totalMs / Math.max(1, value.count);
      const avgItems = value.totalItems / Math.max(1, value.count);
      acc[metricName] = `${avgMs.toFixed(2)}ms avg / ${value.maxMs.toFixed(2)}ms max / ${avgItems.toFixed(1)} items`;
      return acc;
    },
    {}
  );

  console.info('[gameplay profile]', report);
  buckets.clear();
};
