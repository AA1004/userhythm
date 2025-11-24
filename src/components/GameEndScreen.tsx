import React from 'react';
import { GameState } from '../types/game';

interface GameEndScreenProps {
  isTestMode: boolean;
  accuracy: number;
  score: GameState['score'];
  onRetest?: () => void;
  onReturnToEditor?: () => void;
  onReset: () => void;
}

export const GameEndScreen: React.FC<GameEndScreenProps> = ({
  isTestMode,
  accuracy,
  score,
  onRetest,
  onReturnToEditor,
  onReset,
}) => {
  if (isTestMode) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#fff',
          backgroundColor: 'rgba(0,0,0,0.85)',
          padding: '32px',
          borderRadius: '12px',
          minWidth: '360px',
        }}
      >
        <h1 style={{ fontSize: '40px', marginBottom: '20px' }}>테스트 종료</h1>
        <div style={{ fontSize: '20px', marginBottom: '28px' }}>
          <div>정확도: {accuracy.toFixed(2)}%</div>
          <div>최대 콤보: {score.maxCombo}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {onRetest && (
            <button
              onClick={onRetest}
              style={{
                padding: '14px 24px',
                fontSize: '18px',
                backgroundColor: '#4CAF50',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              🔁 다시 테스트
            </button>
          )}
          {onReturnToEditor && (
            <button
              onClick={onReturnToEditor}
              style={{
                padding: '14px 24px',
                fontSize: '18px',
                backgroundColor: '#FF9800',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              ✏️ 에디터로 돌아가기
            </button>
          )}
          <button
            onClick={onReset}
            style={{
              padding: '14px 24px',
              fontSize: '18px',
              backgroundColor: '#616161',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            🏠 메인 메뉴
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#fff',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: '32px',
        borderRadius: '12px',
      }}
    >
      <h1 style={{ fontSize: '48px', marginBottom: '32px' }}>게임 종료</h1>
      <div style={{ fontSize: '24px', marginBottom: '32px' }}>
        <div>최대 콤보: {score.maxCombo}</div>
        <div>정확도: {accuracy.toFixed(2)}%</div>
      </div>
      <button
        onClick={onReset}
        style={{
          padding: '16px 32px',
          fontSize: '24px',
          backgroundColor: '#2196F3',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        다시 시작
      </button>
    </div>
  );
};







