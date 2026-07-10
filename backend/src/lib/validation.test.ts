import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'unit-test-secret';
process.env.FRONTEND_ORIGIN = 'https://userhythm.kr';

async function main() {
  const {
    createOAuthState,
    resolveSafeRedirectTarget,
    verifyOAuthState,
  } = await import('./oauthState');
  const {
    validateChartDataJson,
  } = await import('./chartData');
  const {
    validateScoreSubmission,
  } = await import('./scoreValidation');
  const {
    signPlaySessionToken,
    verifyPlaySessionToken,
  } = await import('./playSession');

  const validChartJson = JSON.stringify({
    bpm: 128,
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    adminDifficulty: 'secret-admin-label',
    notes: [
      { id: 50, lane: 1, time: 1000, duration: 0, endTime: 1000, type: 'tap' },
      { id: 10, lane: 2, time: 2000, duration: 500, endTime: 2500, type: 'hold' },
    ],
    bgaVisibilityIntervals: [
      { id: 'hide-1', startTimeMs: 0, endTimeMs: 1000, mode: 'hidden', fadeInMs: 100 },
    ],
    subtitles: [
      { id: 'sub-1', startTimeMs: 100, endTimeMs: 800, text: 'hello', style: {} },
    ],
  });

  assert.equal(
    resolveSafeRedirectTarget('/editor?tab=charts'),
    'https://userhythm.kr/editor?tab=charts'
  );
  assert.equal(resolveSafeRedirectTarget('https://evil.example/path'), 'https://userhythm.kr/');
  assert.equal(resolveSafeRedirectTarget('//evil.example/path'), 'https://userhythm.kr/');

  const state = createOAuthState('/charts');
  assert.equal(verifyOAuthState(state)?.redirect, 'https://userhythm.kr/charts');
  assert.equal(verifyOAuthState(`${state}tampered`), null);

  const userChart = validateChartDataJson(validChartJson, {
    allowAdminDifficulty: false,
    routeBpm: 128,
  });
  assert.equal(userChart.ok, true);
  if (!userChart.ok) throw new Error('expected valid user chart');
  assert.equal(userChart.expectedJudgments, 3);
  assert.equal(userChart.chartData.adminDifficulty, undefined);
  assert.equal(userChart.chartData.youtubeVideoId, 'dQw4w9WgXcQ');

  const adminChart = validateChartDataJson(validChartJson, {
    allowAdminDifficulty: true,
    routeBpm: 128,
  });
  assert.equal(adminChart.ok, true);
  if (!adminChart.ok) throw new Error('expected valid admin chart');
  assert.equal(adminChart.adminDifficulty, 'secret-admin-label');

  const normalizedContractChart = validateChartDataJson(
    JSON.stringify({
      bpm: 180,
      notes: [
        { lane: 0, time: 0, duration: 500 }, // duration-only hold
        { lane: 1, time: 0, endTime: 500 }, // endTime-only hold
        { lane: 2, time: 0, duration: 20, type: 'hold' }, // short hold becomes tap
        { lane: 3, time: 0, duration: 500, type: 'tap' }, // duration wins over declared type
        { lane: 0, time: 250, duration: 0, type: 'tap' }, // overlaps the first hold
        { lane: 1, time: 0, duration: 0, type: 'tap' }, // overlaps the endTime-only hold
      ],
    })
  );
  assert.equal(normalizedContractChart.ok, true);
  if (!normalizedContractChart.ok) throw new Error('expected normalized contract chart');
  assert.deepEqual(
    normalizedContractChart.chartData.notes.map((note) => ({
      id: note.id,
      lane: note.lane,
      duration: note.duration,
      endTime: note.endTime,
      type: note.type,
    })),
    [
      { id: 1, lane: 0, duration: 500, endTime: 500, type: 'hold' },
      { id: 2, lane: 1, duration: 500, endTime: 500, type: 'hold' },
      { id: 3, lane: 2, duration: 0, endTime: 0, type: 'tap' },
      { id: 4, lane: 3, duration: 500, endTime: 500, type: 'hold' },
    ]
  );
  assert.equal(normalizedContractChart.expectedJudgments, 7);

  const invalidLane = validateChartDataJson(
    JSON.stringify({ bpm: 120, notes: [{ lane: 9, time: 0, duration: 0, type: 'tap' }] })
  );
  assert.deepEqual(invalidLane, { ok: false, error: 'invalid_note_lane' });

  const validScore = validateScoreSubmission(
    {
      chartId: 'chart-1',
      accuracy: 100,
      score: { perfect: 3, great: 0, good: 0, miss: 0, maxCombo: 3 },
    },
    adminChart.dataJson
  );
  assert.equal(validScore.ok, true);
  if (!validScore.ok) throw new Error('expected valid score');
  assert.equal(validScore.accuracy, 100);

  const invalidTotal = validateScoreSubmission(
    { score: { perfect: 2, great: 0, good: 0, miss: 0, maxCombo: 2 } },
    adminChart.dataJson
  );
  assert.deepEqual(invalidTotal, { ok: false, error: 'score_count_mismatch' });

  const invalidCombo = validateScoreSubmission(
    { score: { perfect: 1, great: 0, good: 0, miss: 2, maxCombo: 2 } },
    adminChart.dataJson
  );
  assert.deepEqual(invalidCombo, { ok: false, error: 'invalid_max_combo' });

  const token = signPlaySessionToken({
    chartId: 'chart-1',
    chartHash: adminChart.chartHash,
    expectedJudgments: adminChart.expectedJudgments,
  });
  const verified = verifyPlaySessionToken(token, {
    chartId: 'chart-1',
    chartHash: adminChart.chartHash,
    expectedJudgments: adminChart.expectedJudgments,
  });
  assert.equal(verified.ok, true);
  if (!verified.ok) throw new Error('expected valid play session');

  const mismatched = verifyPlaySessionToken(token, {
    chartId: 'chart-1',
    chartHash: 'different-hash',
    expectedJudgments: adminChart.expectedJudgments,
  });
  assert.deepEqual(mismatched, { ok: false, error: 'play_session_chart_changed' });

  console.log('validation helper tests passed');
}

void main();
