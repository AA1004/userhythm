import React from 'react';
import { Score as ScoreType } from '../types/game';

interface ScoreProps {
  score: ScoreType;
}

export const Score: React.FC<ScoreProps> = ({ score }) => {
  const total = score.perfect + score.great + score.good + score.miss;
  const accuracy =
    total > 0
      ? ((score.perfect * 100 + score.great * 80 + score.good * 50) /
          (total * 100)) *
        100
      : 0;

  return (
    <div
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
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div>
          <span style={{ color: '#FFD700', fontWeight: 'bold' }}>Perfect: </span>
          <span>{score.perfect}</span>
        </div>
        <div>
          <span style={{ color: '#00FF00', fontWeight: 'bold' }}>Great: </span>
          <span>{score.great}</span>
        </div>
        <div>
          <span style={{ color: '#00BFFF', fontWeight: 'bold' }}>Good: </span>
          <span>{score.good}</span>
        </div>
        <div>
          <span style={{ color: '#FF4500', fontWeight: 'bold' }}>Miss: </span>
          <span>{score.miss}</span>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 'bold' }}>Combo: </span>
          <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '16px' }}>{score.combo}</span>
        </div>
        <div>
          <span style={{ fontWeight: 'bold' }}>Max: </span>
          <span>{score.maxCombo}</span>
        </div>
        <div>
          <span style={{ fontWeight: 'bold' }}>Accuracy: </span>
          <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{accuracy.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
};

