import React from 'react';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { BrandLogo } from './BrandLogo';

type AuthUser = {
  id: string;
  email?: string;
  role?: string;
  profile?: any;
};

interface GameMenuProps {
  authUser: AuthUser | null;
  canEditCharts: boolean;
  canSeeAdminMenu: boolean;
  userDisplayName: string;
  roleChessIcon: string;
  isAdmin: boolean;
  isModerator: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onAdmin: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onSettings: () => void;
  ensureEditorAccess: () => boolean;
}

export const GameMenu: React.FC<GameMenuProps> = ({
  authUser,
  canEditCharts,
  canSeeAdminMenu,
  userDisplayName,
  roleChessIcon,
  isAdmin,
  isModerator,
  onPlay,
  onEdit,
  onAdmin,
  onLogin,
  onLogout,
  onSettings,
  ensureEditorAccess,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '0 24px',
          boxSizing: 'border-box',
          textAlign: 'center',
          pointerEvents: 'auto',
        }}
      >
        {/* 히어로 영역 */}
        <div style={{ marginBottom: '32px' }}>
          <BrandLogo
            title="UseRhythm"
            tagline={'누구나 리듬게임 채보를 만들고,\n친구들과 플레이를 공유해 보세요.'}
            size="lg"
            markStyle="overlap"
            gradient={CHART_EDITOR_THEME.titleGradient}
            strokeColor={CHART_EDITOR_THEME.rootBackground}
            glow={CHART_EDITOR_THEME.titleGlow}
          />
        </div>

        {/* 메인 액션 버튼들 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            marginBottom: 32,
          }}
        >
          {/* 플레이 버튼 */}
          <button
            style={{
              padding: '18px 40px',
              fontSize: '20px',
              background: CHART_EDITOR_THEME.buttonPrimaryBg,
              color: CHART_EDITOR_THEME.buttonPrimaryText,
              border: 'none',
              borderRadius: CHART_EDITOR_THEME.radiusLg,
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.18s ease-out',
              boxShadow: CHART_EDITOR_THEME.shadowSoft,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = CHART_EDITOR_THEME.buttonPrimaryBgHover;
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = CHART_EDITOR_THEME.buttonPrimaryBg;
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            onClick={onPlay}
          >
            ▶️ 플레이
          </button>

          {/* 채보 만들기 버튼 */}
          <button
            style={{
              padding: '16px 40px',
              fontSize: '18px',
              background: CHART_EDITOR_THEME.ctaButtonGradient,
              color: CHART_EDITOR_THEME.textPrimary,
              border: `1px solid ${CHART_EDITOR_THEME.accentStrong}`,
              borderRadius: CHART_EDITOR_THEME.radiusLg,
              cursor: canEditCharts ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              transition: 'all 0.18s ease-out',
              boxShadow: `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`,
              opacity: canEditCharts ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (!canEditCharts) return;
              e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 6px 16px ${CHART_EDITOR_THEME.accentSoft}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`;
            }}
            onClick={() => {
              if (!ensureEditorAccess()) return;
              onEdit();
            }}
            title={
              !canEditCharts && isSupabaseConfigured
                ? 'Google 로그인 후 이용할 수 있습니다.'
                : undefined
            }
          >
            ✏️ 채보 만들기
          </button>

          {/* 관리자 버튼 (보조 액션) */}
          {canSeeAdminMenu && (
            <button
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                background: CHART_EDITOR_THEME.ctaButtonGradient,
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusMd,
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                boxShadow: `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradientHover;
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = `0 6px 16px ${CHART_EDITOR_THEME.accentSoft}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.ctaButtonGradient;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${CHART_EDITOR_THEME.accentSoft}`;
              }}
              onClick={onAdmin}
            >
              🔐 관리자
            </button>
          )}
        </div>

        {/* 로그인/설정 영역 */}
        <div style={{ marginBottom: 24 }}>
          {isSupabaseConfigured && !authUser ? (
            <button
              onClick={onLogin}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                background: 'transparent',
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                cursor: 'pointer',
                marginRight: '8px',
              }}
            >
              🔑 Google 로그인
            </button>
          ) : authUser ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: CHART_EDITOR_THEME.textSecondary }}>
                <span>
                  {roleChessIcon} {userDisplayName}
                </span>
                {(isAdmin || isModerator) && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.25px',
                      color: isAdmin ? '#fecaca' : '#c7d2fe',
                      background: isAdmin
                        ? 'rgba(239, 68, 68, 0.16)'
                        : 'rgba(56, 189, 248, 0.12)',
                      border: isAdmin
                        ? '1px solid rgba(239, 68, 68, 0.55)'
                        : '1px solid rgba(56, 189, 248, 0.55)',
                      borderRadius: CHART_EDITOR_THEME.radiusSm,
                      textTransform: 'uppercase',
                    }}
                  >
                    {isAdmin ? 'ADMIN' : 'MODERATOR'}
                  </span>
                )}
              </div>
              <button
                onClick={onSettings}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  background: 'transparent',
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  cursor: 'pointer',
                }}
              >
                ⚙️ 설정
              </button>
              <button
                onClick={onLogout}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  background: 'transparent',
                  color: CHART_EDITOR_THEME.textSecondary,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  cursor: 'pointer',
                }}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={onSettings}
              style={{
                padding: '6px 16px',
                fontSize: '13px',
                background: CHART_EDITOR_THEME.buttonGhostBg,
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                cursor: 'pointer',
              }}
            >
              ⚙ 설정
            </button>
          )}
        </div>

        {isSupabaseConfigured && !authUser && (
          <p
            style={{
              fontSize: '12px',
              color: CHART_EDITOR_THEME.textSecondary,
            }}
          >
            채보 만들기는 Google 로그인 후 이용할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
};

