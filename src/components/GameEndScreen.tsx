import React from 'react';
import { GameState } from '../types/game';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

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
  // 간주 구간에서는 종료 화면 숨김
  if (bgaMaskOpacity >= 1) {
    return null;
  }

  if (isTestMode) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: CHART_EDITOR_THEME.textPrimary,
          backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
          padding: '32px',
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          minWidth: '360px',
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          boxShadow: CHART_EDITOR_THEME.shadowSoft,
        }}
      >
        <h1
          style={{
            fontSize: '40px',
            marginBottom: '20px',
            color: CHART_EDITOR_THEME.textPrimary,
          }}
        >
          테스트 종료
        </h1>
        <div
          style={{
            fontSize: '20px',
            marginBottom: '28px',
            color: CHART_EDITOR_THEME.textSecondary,
          }}
        >
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
                background: CHART_EDITOR_THEME.ctaButtonGradient,
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                e.currentTarget.style.transform = 'translateY(0)';
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
                background: CHART_EDITOR_THEME.ctaButtonGradient,
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              ✏️ 에디터로 돌아가기
            </button>
          )}
          {onReturnToPlayList && (
            <button
              onClick={onReturnToPlayList}
              style={{
                padding: '14px 24px',
                fontSize: '18px',
                background: CHART_EDITOR_THEME.ctaButtonGradient,
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              📋 플레이 목록으로
            </button>
          )}
          <button
            onClick={onReset}
            style={{
              padding: '14px 24px',
              fontSize: '18px',
              background: 'transparent',
              color: CHART_EDITOR_THEME.textPrimary,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = CHART_EDITOR_THEME.surface;
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.transform = 'translateY(0)';
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
        color: CHART_EDITOR_THEME.textPrimary,
        backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
        padding: '32px',
        borderRadius: CHART_EDITOR_THEME.radiusLg,
        border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        boxShadow: CHART_EDITOR_THEME.shadowSoft,
      }}
    >
      <h1
        style={{
          fontSize: '48px',
          marginBottom: '32px',
          color: CHART_EDITOR_THEME.textPrimary,
        }}
      >
        게임 종료
      </h1>
      <div
        style={{
          fontSize: '24px',
          marginBottom: '32px',
          color: CHART_EDITOR_THEME.textSecondary,
        }}
      >
        <div>최대 콤보: {score.maxCombo}</div>
        <div>정확도: {accuracy.toFixed(2)}%</div>
      </div>
      <button
        onClick={onReset}
        style={{
          padding: '16px 32px',
          fontSize: '24px',
          background: CHART_EDITOR_THEME.ctaButtonGradient,
          color: CHART_EDITOR_THEME.textPrimary,
          border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
          borderRadius: CHART_EDITOR_THEME.radiusMd,
          cursor: 'pointer',
          fontWeight: 'bold',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        다시 시작
      </button>
    </div>
  );
};







