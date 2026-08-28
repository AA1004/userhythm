import React from 'react';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { BrandLogo } from './BrandLogo';

type AuthUser = { id: string; email?: string; role?: string; profile?: any };

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
  authUser, canEditCharts, canSeeAdminMenu, userDisplayName, roleChessIcon, isAdmin, isModerator,
  onPlay, onWorkInProgress, onEdit, onAdmin, onTutorial, onLogin, onLogout, onSettings,
  ensureEditorAccess, leftPanel, rightPanel,
}) => {
  const editorTitle = !canEditCharts && isSupabaseConfigured ? 'Google 로그인 후 이용할 수 있습니다.' : undefined;

  return (
    <div className="game-menu-shell">
      <div className="game-menu-lanes" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
      </div>
      <div className="game-menu-judge-line" aria-hidden="true" />

      <div className="game-menu-layout">
        <section className="game-menu-panel" aria-label="UseRhythm main menu">
          <div className="game-menu-main">
            <BrandLogo
              title="UseRhythm"
              tagline={'직접 만든 채보로 바로 플레이하고,\n친구들과 리듬을 공유하세요.'}
              size="lg"
              markStyle="left"
            />
          </div>

          <div className="game-menu-actions">
            <button className="game-menu-action game-menu-action--primary" onClick={onPlay}>플레이</button>
            <button className="game-menu-action" onClick={onWorkInProgress}>제작 중인 채보</button>
            <button
              className="game-menu-action"
              disabled={!canEditCharts}
              onClick={() => {
                if (ensureEditorAccess()) onEdit();
              }}
              title={editorTitle}
            >
              채보 만들기
            </button>
            {canSeeAdminMenu && <button className="game-menu-action game-menu-action--minor" onClick={onAdmin}>관리자</button>}
            <button className="game-menu-action game-menu-action--minor" onClick={onTutorial}>도움말</button>
          </div>

          <div className="game-menu-account">
            {isSupabaseConfigured && !authUser ? (
              <div className="game-menu-userbar">
                <button className="game-menu-link" onClick={onSettings}>설정</button>
                <button className="game-menu-link" onClick={onLogin}>Google 로그인</button>
              </div>
            ) : authUser ? (
              <div className="game-menu-userbar">
                <span className="game-menu-user">
                  {roleChessIcon} {userDisplayName}
                  {(isAdmin || isModerator) && <span className="game-menu-role">{isAdmin ? 'ADMIN' : 'MODERATOR'}</span>}
                </span>
                <button className="game-menu-link" onClick={onSettings}>설정</button>
                <button className="game-menu-link game-menu-link--muted" onClick={onLogout}>로그아웃</button>
              </div>
            ) : (
              <button className="game-menu-link" onClick={onSettings}>설정</button>
            )}
          </div>

          {isSupabaseConfigured && !authUser && <p className="game-menu-note">채보 만들기는 Google 로그인 후 이용할 수 있습니다.</p>}
        </section>

        {(leftPanel || rightPanel) && (
          <section className="game-menu-info" aria-label="Version and notice">
            {leftPanel && <div className="game-menu-info__item">{leftPanel}</div>}
            {rightPanel && <div className="game-menu-info__item">{rightPanel}</div>}
          </section>
        )}
      </div>
    </div>
  );
};
