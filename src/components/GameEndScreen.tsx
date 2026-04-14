import React from 'react';
import { GameState } from '../types/game';

interface GameEndScreenProps {
  isTestMode: boolean;
  accuracy: number;
  score: GameState['score'];
  bgaMaskOpacity: number;
  onRetest?: () => void;
  onReturnToEditor?: () => void;
  onReturnToPlayList?: () => void;
  onReset: () => void;
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
  onRetest,
  onReturnToEditor,
  onReturnToPlayList,
  onReset,
}) => {
  // Hide result UI during BGA-only interlude sections.
  if (bgaMaskOpacity >= 1) {
    return null;
  }

  const grade = getResultGrade(accuracy);
  const totalNotes = score.perfect + score.great + score.good + score.miss;
  const accuracyAngle = Math.max(0, Math.min(100, accuracy)) * 3.6;
  const title = isTestMode ? '테스트 종료' : '게임 종료';
  const subtitle = isTestMode
    ? '채보 테스트 결과를 확인하고 바로 수정 흐름으로 돌아갈 수 있습니다.'
    : '플레이 결과가 정산되었습니다.';

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

  return (
    <div className="game-end-screen" role="dialog" aria-modal="true" aria-label={title}>
      <div className="game-end-panel">
        <div className="game-end-ambient" aria-hidden="true" />

        <div className="game-end-copy">
          <p className="game-end-eyebrow">{isTestMode ? 'TEST RESULT' : 'PLAY RESULT'}</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="game-end-summary">
          <div
            className="game-end-accuracy-ring"
            style={{ '--accuracy-angle': `${accuracyAngle}deg` } as React.CSSProperties}
            aria-label={`정확도 ${accuracy.toFixed(2)} 퍼센트`}
          >
            <span className="game-end-grade">{grade}</span>
            <strong>{accuracy.toFixed(2)}%</strong>
            <small>ACCURACY</small>
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

        <div className="game-end-actions">
          {actions.map((action) => (
            <ResultActionButton key={action.label} {...action} />
          ))}
        </div>
      </div>
    </div>
  );
};
