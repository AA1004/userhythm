import React from 'react';
import { GameState } from '../types/game';

interface GameEndScreenProps {
  isTestMode: boolean;
  accuracy: number;
  score: GameState['score'];
  bgaMaskOpacity: number;
  timingOffsetRecommendation?: {
    recommendedOffsetMs: number | null;
    sampleCount: number;
    source: 'speed' | 'global' | null;
    averageDeviationMs: number | null;
  };
  onRetest?: () => void;
  onReturnToEditor?: () => void;
  onReturnToPlayList?: () => void;
  onReset: () => void;
  onApplyTimingOffsetRecommendation?: () => void;
}

interface ResultAction {
  label: string;
  variant: 'primary' | 'secondary';
  onClick: () => void;
}

const getResultGrade = (accuracy: number) => {
  if (accuracy >= 99.5) return 'SS';
  if (accuracy >= 95) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  return 'C';
};

const ResultActionButton: React.FC<ResultAction> = ({ label, variant, onClick }) => (
  <button
    className={`game-end-action game-end-action--${variant}`}
    type="button"
    onClick={onClick}
  >
    {label}
  </button>
);

export const GameEndScreen: React.FC<GameEndScreenProps> = ({
  isTestMode,
  accuracy,
  score,
  bgaMaskOpacity,
  timingOffsetRecommendation,
  onRetest,
  onReturnToEditor,
  onReturnToPlayList,
  onReset,
  onApplyTimingOffsetRecommendation,
}) => {
  // Hide result UI during BGA-only interlude sections.
  if (bgaMaskOpacity >= 1) {
    return null;
  }

  const grade = getResultGrade(accuracy);
  const totalNotes = score.perfect + score.great + score.good + score.miss;
  const accuracyAngle = Math.max(0, Math.min(100, accuracy)) * 3.6;
  const isFullCombo = totalNotes > 0 && score.miss === 0 && score.maxCombo >= totalNotes;
  const title = isTestMode ? '테스트 종료' : '게임 종료';
  const subtitle = isTestMode
    ? '채보 테스트 결과를 확인하고 바로 수정 흐름으로 돌아갈 수 있습니다.'
    : '플레이 결과가 정산되었습니다.';
  const accentLabel = isFullCombo ? 'FULL COMBO' : grade === 'SS' ? 'MAXIMUM' : 'RESULT';

  const stats = [
    { label: 'Perfect', value: score.perfect, tone: 'gold' },
    { label: 'Great', value: score.great, tone: 'green' },
    { label: 'Good', value: score.good, tone: 'blue' },
    { label: 'Miss', value: score.miss, tone: 'red' },
    { label: 'Max Combo', value: score.maxCombo, tone: 'plain' },
    { label: 'Total Notes', value: totalNotes, tone: 'plain' },
  ];

  const actions: ResultAction[] = isTestMode
    ? [
        ...(onRetest ? [{ label: '다시 테스트', variant: 'primary' as const, onClick: onRetest }] : []),
        ...(onReturnToEditor
          ? [{ label: '에디터로 돌아가기', variant: 'primary' as const, onClick: onReturnToEditor }]
          : []),
        ...(onReturnToPlayList
          ? [{ label: '플레이 목록으로', variant: 'primary' as const, onClick: onReturnToPlayList }]
          : []),
        { label: '메인 메뉴', variant: 'secondary', onClick: onReset },
      ]
    : [{ label: '다시 시작', variant: 'primary', onClick: onReset }];

  const showTimingRecommendation =
    !isTestMode &&
    !!timingOffsetRecommendation &&
    timingOffsetRecommendation.recommendedOffsetMs !== null;

  return (
    <div className="game-end-screen" role="dialog" aria-modal="true" aria-label={title}>
      <div className="game-end-panel">
        <div className="game-end-ambient" aria-hidden="true" />
        <div className="game-end-grid" aria-hidden="true" />

        {isFullCombo && (
          <div className="game-end-full-combo" aria-hidden="true">
            <div className="game-end-full-combo__flare game-end-full-combo__flare--left" />
            <div className="game-end-full-combo__flare game-end-full-combo__flare--right" />
            <span className="game-end-full-combo__eyebrow">CLEAR BONUS</span>
            <strong>FULL COMBO</strong>
            <small>모든 노트를 끊김 없이 연결했습니다.</small>
          </div>
        )}

        <div className="game-end-hero">
          <div className="game-end-copy">
            <p className="game-end-eyebrow">{isTestMode ? 'TEST RESULT' : 'PLAY RESULT'}</p>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div className="game-end-rank-block">
            <span className="game-end-rank-block__label">{accentLabel}</span>
            <strong className="game-end-rank-block__grade">{grade}</strong>
            <span className="game-end-rank-block__caption">
              {isFullCombo ? '노 미스 클리어' : score.miss === 0 ? '클린 클리어' : '결과 정산 완료'}
            </span>
          </div>
        </div>

        <div className="game-end-summary">
          <div className="game-end-primary-metrics">
            <div
              className="game-end-accuracy-ring"
              style={{ '--accuracy-angle': `${accuracyAngle}deg` } as React.CSSProperties}
              aria-label={`정확도 ${accuracy.toFixed(2)} 퍼센트`}
            >
              <span className="game-end-grade">{grade}</span>
              <strong>{accuracy.toFixed(2)}%</strong>
              <small>ACCURACY</small>
            </div>

            <div className="game-end-primary-stack">
              <div className="game-end-primary-card">
                <span>MAX COMBO</span>
                <strong>{score.maxCombo}</strong>
              </div>
              <div className="game-end-primary-card">
                <span>TOTAL NOTES</span>
                <strong>{totalNotes}</strong>
              </div>
              <div className={`game-end-primary-card game-end-primary-card--${isFullCombo ? 'highlight' : 'subtle'}`}>
                <span>CLEAR STATE</span>
                <strong>{isFullCombo ? 'FULL COMBO' : score.miss === 0 ? 'NO MISS' : `${score.miss} MISS`}</strong>
              </div>
            </div>
          </div>

          <div className="game-end-stats">
            {stats.map((item) => (
              <div className={`game-end-stat game-end-stat--${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        {!isTestMode && timingOffsetRecommendation && (
          <div
            style={{
              marginTop: '18px',
              padding: '16px',
              borderRadius: '18px',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              background: 'rgba(15, 23, 42, 0.58)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ color: 'rgba(226,232,240,0.72)', fontSize: '12px', marginBottom: '6px' }}>
                실전 플레이 기반 보정
              </div>
              <div style={{ color: '#f8fafc', fontSize: '22px', fontWeight: 800 }}>
                {showTimingRecommendation
                  ? `${timingOffsetRecommendation.recommendedOffsetMs! > 0 ? '+' : ''}${timingOffsetRecommendation.recommendedOffsetMs}ms`
                  : `표본 ${timingOffsetRecommendation.sampleCount}개`}
              </div>
              <div style={{ color: 'rgba(226,232,240,0.72)', fontSize: '12px', marginTop: '4px' }}>
                {showTimingRecommendation
                  ? `${timingOffsetRecommendation.source === 'speed' ? '현재 노트속도 기준' : '전체 플레이 기준'} · 평균 편차 ${timingOffsetRecommendation.averageDeviationMs}ms`
                  : '최소 12개 이상 쌓이면 추천값이 계산됩니다.'}
              </div>
            </div>
            {showTimingRecommendation && onApplyTimingOffsetRecommendation && (
              <button
                type="button"
                onClick={onApplyTimingOffsetRecommendation}
                style={{
                  padding: '12px 18px',
                  borderRadius: '14px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #5eead4 0%, #facc15 48%, #fb7185 100%)',
                  color: '#0f172a',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                추천값 적용
              </button>
            )}
          </div>
        )}

        <div className="game-end-actions">
          {actions.map((action) => (
            <ResultActionButton key={action.label} {...action} />
          ))}
        </div>
      </div>
    </div>
  );
};
