import React from 'react';
import { Score as ScoreType } from '../types/game';

interface ScoreProps {
  score: ScoreType;
}

const ScoreComponent: React.FC<ScoreProps> = ({ score }) => {
  const total = score.perfect + score.great + score.good + score.miss;
  const accuracy =
    total > 0
      ? ((score.perfect * 100 + score.great * 80 + score.good * 50) /
          (total * 100)) *
        100
      : 0;

  return (
    <div
      className="score-hud"
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        color: '#fff',
        fontSize: '14px',
        fontFamily: 'monospace',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: '12px 16px',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        gap: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        whiteSpace: 'nowrap',
        zIndex: 1000,
      }}
    >
      <div className="score-hud__row" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div className="score-hud__item score-hud__item--perfect">
          <span className="score-hud__label" style={{ color: '#FFD700', fontWeight: 'bold' }}>Perfect: </span>
          <span className="score-hud__value">{score.perfect}</span>
        </div>
        <div className="score-hud__item score-hud__item--great">
          <span className="score-hud__label" style={{ color: '#00FF00', fontWeight: 'bold' }}>Great: </span>
          <span className="score-hud__value">{score.great}</span>
        </div>
        <div className="score-hud__item score-hud__item--good">
          <span className="score-hud__label" style={{ color: '#00BFFF', fontWeight: 'bold' }}>Good: </span>
          <span className="score-hud__value">{score.good}</span>
        </div>
        <div className="score-hud__item score-hud__item--miss">
          <span className="score-hud__label" style={{ color: '#FF4500', fontWeight: 'bold' }}>Miss: </span>
          <span className="score-hud__value">{score.miss}</span>
        </div>
      </div>
      
      <div className="score-hud__row score-hud__row--summary" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div className="score-hud__item">
          <span className="score-hud__label" style={{ fontWeight: 'bold' }}>Combo: </span>
          <span className="score-hud__value score-hud__value--combo" style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '16px' }}>{score.combo}</span>
        </div>
        <div className="score-hud__item">
          <span className="score-hud__label" style={{ fontWeight: 'bold' }}>Max: </span>
          <span className="score-hud__value">{score.maxCombo}</span>
        </div>
        <div className="score-hud__item">
          <span className="score-hud__label" style={{ fontWeight: 'bold' }}>Accuracy: </span>
          <span className="score-hud__value score-hud__value--accuracy" style={{ color: '#4CAF50', fontWeight: 'bold' }}>{accuracy.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
};

// Prevent unnecessary re-renders with React.memo
export const Score = React.memo(ScoreComponent, (prevProps, nextProps) => {
  // Skip render if all score fields are unchanged
  return (
    prevProps.score.perfect === nextProps.score.perfect &&
    prevProps.score.great === nextProps.score.great &&
    prevProps.score.good === nextProps.score.good &&
    prevProps.score.miss === nextProps.score.miss &&
    prevProps.score.combo === nextProps.score.combo &&
    prevProps.score.maxCombo === nextProps.score.maxCombo
  );
});

