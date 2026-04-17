import React from 'react';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { BrandLogo } from './BrandLogo';

const MENU_NOTE_PALETTES = [
  { head: 'rgba(119, 255, 214, 0.08)', core: 'rgba(119, 255, 214, 0.72)', glow: 'rgba(119, 255, 214, 0.3)' },
  { head: 'rgba(255, 78, 122, 0.08)', core: 'rgba(255, 78, 122, 0.68)', glow: 'rgba(255, 78, 122, 0.28)' },
  { head: 'rgba(255, 184, 77, 0.08)', core: 'rgba(255, 184, 77, 0.7)', glow: 'rgba(255, 184, 77, 0.26)' },
  { head: 'rgba(56, 189, 248, 0.08)', core: 'rgba(56, 189, 248, 0.7)', glow: 'rgba(56, 189, 248, 0.28)' },
  { head: 'rgba(167, 139, 250, 0.08)', core: 'rgba(167, 139, 250, 0.68)', glow: 'rgba(167, 139, 250, 0.26)' },
  { head: 'rgba(251, 113, 133, 0.08)', core: 'rgba(251, 113, 133, 0.68)', glow: 'rgba(251, 113, 133, 0.26)' },
] as const;

const pickMenuNotePalettes = () => {
  const shuffled = [...MENU_NOTE_PALETTES];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, 4);
};

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
  onTutorial: () => void;
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
  onTutorial,
  onLogin,
  onLogout,
  onSettings,
  ensureEditorAccess,
}) => {
  const menuNotePalettes = React.useMemo(pickMenuNotePalettes, []);
  const editorTitle =
    !canEditCharts && isSupabaseConfigured
      ? 'Google 로그인 후 이용할 수 있습니다.'
      : undefined;

  return (
    <div className="game-menu-shell">
      <div className="game-menu-grid" aria-hidden="true" />
      <div className="game-menu-stage-glow" aria-hidden="true" />
      <div className="game-menu-lanes" aria-hidden="true">
        {menuNotePalettes.map((palette, index) => (
          <span
            key={`${palette.core}-${index}`}
            style={{
              '--menu-note-head': palette.head,
              '--menu-note-core': palette.core,
              '--menu-note-glow': palette.glow,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <section className="game-menu-panel" aria-label="UseRhythm main menu">
        <div className="game-menu-main">
          <div className="game-menu-kicker">RHYTHM LAB</div>
          <div className="game-menu-hero">
            <BrandLogo
              title="UseRhythm"
              tagline={'직접 만든 채보로 바로 플레이하고,\n친구들과 리듬을 공유하세요.'}
              size="lg"
              markStyle="overlap"
              gradient={CHART_EDITOR_THEME.titleGradient}
              strokeColor={CHART_EDITOR_THEME.rootBackground}
              glow={CHART_EDITOR_THEME.titleGlow}
            />
          </div>

          <div className="game-menu-equalizer" aria-hidden="true">
            {Array.from({ length: 22 }).map((_, index) => (
              <i key={index} style={{ animationDelay: `${index * 42}ms` }} />
            ))}
          </div>
        </div>

        <div className="game-menu-actions">
          <button
            className="game-menu-action game-menu-action--primary"
            onClick={onPlay}
          >
            <span>플레이</span>
            <small>PLAY</small>
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
            <button
              className="game-menu-link"
              onClick={onLogin}
            >
              Google 로그인
            </button>
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
    </div>
  );
};

