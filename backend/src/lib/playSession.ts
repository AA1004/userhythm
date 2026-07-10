import jwt, { JwtPayload } from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const PLAY_SESSION_TYPE = 'play_session';
export const PLAY_SESSION_MAX_AGE_SEC = 60 * 60 * 6;
const MAX_FUTURE_SKEW_MS = 30_000;

export interface PlaySessionClaims {
  type: typeof PLAY_SESSION_TYPE;
  chartId: string;
  chartHash: string;
  expectedJudgments: number;
  startedAt: number;
  nonce: string;
}

export type PlaySessionVerificationResult =
  | { ok: true; claims: PlaySessionClaims }
  | { ok: false; error: string };

const getTokenSecret = (): string =>
  process.env.PLAY_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-change-me');

export const isPlaySessionSecretConfigured = (): boolean => getTokenSecret().length > 0;

export const signPlaySessionToken = (input: {
  chartId: string;
  chartHash: string;
  expectedJudgments: number;
}): string => {
  const secret = getTokenSecret();
  if (!secret) {
    throw new Error('play_session_secret_missing');
  }

  const claims: PlaySessionClaims = {
    type: PLAY_SESSION_TYPE,
    chartId: input.chartId,
    chartHash: input.chartHash,
    expectedJudgments: input.expectedJudgments,
    startedAt: Date.now(),
    nonce: randomUUID(),
  };

  return jwt.sign(claims, secret, { expiresIn: PLAY_SESSION_MAX_AGE_SEC });
};
const isClaimsPayload = (decoded: string | JwtPayload): decoded is JwtPayload & PlaySessionClaims => {
  if (typeof decoded === 'string') return false;
  return (
    decoded.type === PLAY_SESSION_TYPE &&
    typeof decoded.chartId === 'string' &&
    typeof decoded.chartHash === 'string' &&
    typeof decoded.expectedJudgments === 'number' &&
    typeof decoded.startedAt === 'number' &&
    typeof decoded.nonce === 'string'
  );
};

export const verifyPlaySessionToken = (
  token: string | null | undefined,
  expected: {
    chartId: string;
    chartHash: string;
    expectedJudgments: number;
  }
): PlaySessionVerificationResult => {
  const secret = getTokenSecret();
  if (!secret) return { ok: false, error: 'play_session_not_configured' };
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing_play_session' };

  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    return { ok: false, error: 'invalid_play_session' };
  }

  if (!isClaimsPayload(decoded)) return { ok: false, error: 'invalid_play_session' };
  if (decoded.chartId !== expected.chartId) return { ok: false, error: 'play_session_chart_mismatch' };
  if (decoded.chartHash !== expected.chartHash) return { ok: false, error: 'play_session_chart_changed' };
  if (decoded.expectedJudgments !== expected.expectedJudgments) {
    return { ok: false, error: 'play_session_count_mismatch' };
  }
  if (decoded.startedAt > Date.now() + MAX_FUTURE_SKEW_MS) {
    return { ok: false, error: 'invalid_play_session' };
  }

  return {
    ok: true,
    claims: {
      type: PLAY_SESSION_TYPE,
      chartId: decoded.chartId,
      chartHash: decoded.chartHash,
      expectedJudgments: decoded.expectedJudgments,
      startedAt: decoded.startedAt,
      nonce: decoded.nonce,
    },
  };
};
