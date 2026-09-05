import React from 'react';
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
  onWorkInProgress: () => void;
  onEdit: () => void;
  onAdmin: () => void;
  onTutorial: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onSettings: () => void;
  ensureEditorAccess: () => boolean;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
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
  onWorkInProgress,
  onEdit,
  onAdmin,
  onTutorial,
  onLogin,
  onLogout,
  onSettings,
  ensureEditorAccess,
  leftPanel,
  rightPanel,
}) => {
  const editorTitle =
    !canEditCharts && isSupabaseConfigured
      ? 'Google 로그인 후 이용할 수 있습니다.'
      : undefined;

  return (
    <div className="game-menu-shell">
      <div className="game-menu-lanes" aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className="game-menu-layout">
        {leftPanel && (
          <aside className="game-menu-side game-menu-side--left" aria-label="Version report">
            {leftPanel}
          </aside>
        )}

        <section className="game-menu-panel" aria-label="UseRhythm main menu">
          <div className="game-menu-main">
            <div className="game-menu-hero">
              <BrandLogo
                title="UseRhythm"
                tagline={'리듬을 플레이하고, 직접 만드세요.'}
                size="lg"
                markStyle="overlap"
                gradient="linear-gradient(#e5f2ed, #e5f2ed)"
                strokeColor="transparent"
                glow="none"
              />
            </div>

          </div>

          <div className="game-menu-actions">
            <button
              className="game-menu-action game-menu-action--primary"
              onClick={onPlay}
            >
              <span>플레이</span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </button>

            <button
              className="game-menu-action game-menu-action--secondary"
              onClick={onWorkInProgress}
            >
              <span>제작 중인 채보</span>
              <small>WIP</small>
            </button>

            <button
              className="game-menu-action game-menu-action--secondary"
              disabled={!canEditCharts}
              onClick={() => {
                if (!ensureEditorAccess()) return;
                onEdit();
              }}
              title={editorTitle}
            >
              <span>채보 만들기</span>
              <small>EDITOR</small>
            </button>

            {canSeeAdminMenu && (
              <button
                className="game-menu-action game-menu-action--compact"
                onClick={onAdmin}
              >
                관리자
              </button>
            )}

            <button
              className="game-menu-action game-menu-action--ghost"
              onClick={onTutorial}
            >
              도움말
            </button>
          </div>

          <div className="game-menu-account">
            {isSupabaseConfigured && !authUser ? (
              <div className="game-menu-userbar">
                <button
                  className="game-menu-link"
                  onClick={onSettings}
                >
                  설정
                </button>
                <button
                  className="game-menu-link"
                  onClick={onLogin}
                >
                  Google 로그인
                </button>
              </div>
            ) : authUser ? (
              <div className="game-menu-userbar">
                <div className="game-menu-user">
                  <span>{roleChessIcon} {userDisplayName}</span>
                  {(isAdmin || isModerator) && (
                    <span className="game-menu-role">
                      {isAdmin ? 'ADMIN' : 'MODERATOR'}
                    </span>
                  )}
                </div>
                <button
                  className="game-menu-link"
                  onClick={onSettings}
                >
                  설정
                </button>
                <button
                  className="game-menu-link game-menu-link--muted"
                  onClick={onLogout}
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                className="game-menu-link"
                onClick={onSettings}
              >
                설정
              </button>
            )}
          </div>

          {isSupabaseConfigured && !authUser && (
            <p className="game-menu-note">
              채보 만들기는 Google 로그인 후 이용할 수 있습니다.
            </p>
          )}
        </section>

        {rightPanel && (
          <aside className="game-menu-side game-menu-side--right" aria-label="Notice">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
};

