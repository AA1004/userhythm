import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiNotice, ApiVersion } from '../lib/api';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { useAuth } from '../hooks/useAuth';
import { NoticeVersionAdmin } from './NoticeVersionAdmin';

interface MainMenuSidebarProps {
  type: 'notice' | 'version';
  position: 'left' | 'right';
}

const MAIN_MENU_RESERVED_WIDTH = 560;
const MAIN_MENU_MIN_GAP = 36;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getMainMenuSidebarLayout = (viewportWidth: number) => {
  if (viewportWidth > 1920) {
    return { mode: 'full' as const, width: 600, edge: 60, top: 60, height: 'calc(100dvh - 120px)', padding: 24 };
  }

  if (viewportWidth > 1680) {
    return { mode: 'full' as const, width: 500, edge: 40, top: 60, height: 'calc(100dvh - 120px)', padding: 24 };
  }

  if (viewportWidth > 1520) {
    const edge = 24;
    const availableSideWidth = (viewportWidth - MAIN_MENU_RESERVED_WIDTH - MAIN_MENU_MIN_GAP * 2) / 2;
    return {
      mode: 'full' as const,
      width: clamp(availableSideWidth - edge, 300, 420),
      edge,
      top: 60,
      height: 'calc(100dvh - 120px)',
      padding: 22,
    };
  }

  if (viewportWidth >= 900) {
    return {
      mode: 'compact' as const,
      width: Math.max(260, Math.floor(viewportWidth / 2) - 28),
      edge: 16,
      top: null,
      height: 'clamp(150px, 22dvh, 220px)',
      padding: 14,
    };
  }

  return {
    mode: 'dock' as const,
    width: Math.max(280, viewportWidth - 24),
    edge: 12,
    top: null,
    height: 'clamp(120px, 18dvh, 170px)',
    padding: 12,
  };
};

export const MainMenuSidebar: React.FC<MainMenuSidebarProps> = ({
  type,
  position,
}) => {
  const [notice, setNotice] = useState<ApiNotice | null>(null);
  const [version, setVersion] = useState<ApiVersion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const { isAdmin } = useAuth();
  const [windowSize, setWindowSize] = useState(() => {
    if (typeof window === 'undefined') return { width: 1920, height: 1080 };
    return { width: window.innerWidth, height: window.innerHeight };
  });

  const sidebarLayout = useMemo(() => {
    return getMainMenuSidebarLayout(windowSize.width);
  }, [windowSize.width]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (type === 'notice') {
      setIsLoading(true);
      setError(null);
      api
        .getNotice()
        .then((data) => {
          setNotice(data);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load notice:', err);
          // 기본값 설정
          setNotice({
            title: '공지사항',
            content: '공지사항을 불러올 수 없습니다.\n\nAPI 서버가 실행 중인지 확인해주세요.',
            updatedAt: new Date().toISOString(),
          });
          setIsLoading(false);
        });
    } else if (type === 'version') {
      setIsLoading(true);
      setError(null);
      api
        .getVersion()
        .then((data) => {
          setVersion(data);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load version:', err);
          // 기본값 설정
          setVersion({
            version: '1.0.0',
            changelog: ['버전 정보를 불러올 수 없습니다.', 'API 서버가 실행 중인지 확인해주세요.'],
            updatedAt: new Date().toISOString(),
          });
          setIsLoading(false);
        });
    }
  }, [type, sidebarLayout]);

  const isLeft = position === 'left';

  const getSidebarWidth = () => {
    return `${sidebarLayout.width}px`;
  };

  const getSidebarHeight = () => {
    return sidebarLayout.height;
  };

  const getFontSize = (large: number, medium: number, small: number) => {
    const viewportWidth = windowSize.width;
    // 폰트 크기를 줄여서 더 많은 내용 표시
    if (viewportWidth > 1920) return `${large * 0.85}px`;
    if (viewportWidth > 1440) return `${medium * 0.85}px`;
    return `${small * 0.85}px`;
  };

  const getSidebarPosition = () => {
    return `${sidebarLayout.edge}px`;
  };

  const sidebarStyle: React.CSSProperties = {
    position: 'fixed',
    height: getSidebarHeight(),
    width: getSidebarWidth(),
    backgroundColor: '#0b1120',
    border: `2px solid ${CHART_EDITOR_THEME.borderStrong}`,
    borderRadius: CHART_EDITOR_THEME.radiusLg,
    padding: `${sidebarLayout.padding}px`,
    boxShadow: '0 0 30px rgba(0, 0, 0, 0.9)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
  };

  if (sidebarLayout.mode === 'compact') {
    sidebarStyle.bottom = '18px';
    sidebarStyle.top = 'auto';
    if (isLeft) {
      sidebarStyle.left = getSidebarPosition();
    } else {
      sidebarStyle.right = getSidebarPosition();
    }
  } else if (sidebarLayout.mode === 'dock') {
    sidebarStyle.left = getSidebarPosition();
    sidebarStyle.right = getSidebarPosition();
    sidebarStyle.width = 'auto';
    sidebarStyle.top = 'auto';
    sidebarStyle.bottom = isLeft ? `calc(${sidebarLayout.height} + 24px)` : '12px';
  } else if (isLeft) {
    sidebarStyle.top = `${sidebarLayout.top}px`;
    sidebarStyle.left = getSidebarPosition();
  } else {
    sidebarStyle.top = `${sidebarLayout.top}px`;
    sidebarStyle.right = getSidebarPosition();
  }

  const sidebarClassName = [
    'main-menu-sidebar',
    `main-menu-sidebar--${type}`,
    `main-menu-sidebar--${position}`,
    `main-menu-sidebar--${sidebarLayout.mode}`,
  ].join(' ');

  return (
    <>
      {isAdminModalOpen && (
        <NoticeVersionAdmin
          onClose={() => {
            setIsAdminModalOpen(false);
            // 모달 닫을 때 데이터 새로고침
            if (type === 'notice') {
              setIsLoading(true);
              api
                .getNotice()
                .then((data) => {
                  setNotice(data);
                  setIsLoading(false);
                })
                .catch((err) => {
                  console.error('Failed to load notice:', err);
                  setIsLoading(false);
                });
            } else if (type === 'version') {
              setIsLoading(true);
              api
                .getVersion()
                .then((data) => {
                  setVersion(data);
                  setIsLoading(false);
                })
                .catch((err) => {
                  console.error('Failed to load version:', err);
                  setIsLoading(false);
                });
            }
          }}
        />
      )}
      <div className={sidebarClassName} style={sidebarStyle}>
        {/* 제목 및 편집 버튼 */}
        <div
          className="main-menu-sidebar__header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            borderBottom: `2px solid ${CHART_EDITOR_THEME.borderStrong}`,
            paddingBottom: '12px',
          }}
        >
          <h2
            className="main-menu-sidebar__title"
            style={{
              fontSize: getFontSize(28, 24, 22),
              fontWeight: 'bold',
              color: CHART_EDITOR_THEME.textPrimary,
              margin: 0,
            }}
          >
            {type === 'notice' ? '📢 공지사항' : '📋 버전 리포트'}
          </h2>
          {isAdmin && (
            <button
              className="main-menu-sidebar__edit"
              onClick={() => setIsAdminModalOpen(true)}
              style={{
                padding: '8px 16px',
                fontSize: getFontSize(14, 13, 12),
                fontWeight: '600',
                background: CHART_EDITOR_THEME.buttonGhostBg,
                color: CHART_EDITOR_THEME.textPrimary,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.buttonPrimaryBg;
                e.currentTarget.style.color = CHART_EDITOR_THEME.buttonPrimaryText;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = CHART_EDITOR_THEME.buttonGhostBg;
                e.currentTarget.style.color = CHART_EDITOR_THEME.textPrimary;
              }}
            >
              ✏️ 편집
            </button>
          )}
        </div>

      {/* 내용 영역 */}
      <div
        className="main-menu-sidebar__content"
        style={{
          flex: 1,
          overflowY: 'auto',
          color: CHART_EDITOR_THEME.textSecondary,
          fontSize: getFontSize(16, 14, 13),
          lineHeight: '1.6',
        }}
      >
        {type === 'notice' ? (
          <>
            {isLoading ? (
              <div className="main-menu-sidebar__state" style={{ textAlign: 'center', padding: '30px', fontSize: getFontSize(16, 14, 13) }}>
                로딩 중...
              </div>
            ) : error ? (
              <div className="main-menu-sidebar__state main-menu-sidebar__state--error" style={{ textAlign: 'center', padding: '30px', color: CHART_EDITOR_THEME.danger, fontSize: getFontSize(14, 13, 12) }}>
                {error}
              </div>
            ) : notice ? (
              <>
                <div
                  className="main-menu-sidebar__notice-title"
                  style={{
                    marginBottom: '12px',
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontWeight: '700',
                    fontSize: getFontSize(18, 16, 15),
                  }}
                >
                  {notice.title}
                </div>
                <div
                  className="main-menu-sidebar__body"
                  style={{
                    whiteSpace: 'pre-line',
                    wordBreak: 'break-word',
                  }}
                >
                  {notice.content}
                </div>
                {notice.updatedAt && (
                  <div
                    className="main-menu-sidebar__meta"
                    style={{
                      marginTop: '16px',
                      fontSize: '12px',
                      color: CHART_EDITOR_THEME.textMuted,
                      borderTop: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                      paddingTop: '12px',
                    }}
                  >
                    업데이트: {new Date(notice.updatedAt).toLocaleDateString('ko-KR')}
                  </div>
                )}
              </>
            ) : (
              <div className="main-menu-sidebar__state" style={{ textAlign: 'center', padding: '30px', color: CHART_EDITOR_THEME.textMuted, fontSize: getFontSize(14, 13, 12) }}>
                공지사항이 없습니다.
              </div>
            )}
          </>
        ) : (
          <>
            {isLoading ? (
              <div className="main-menu-sidebar__state" style={{ textAlign: 'center', padding: '30px', fontSize: getFontSize(16, 14, 13) }}>
                로딩 중...
              </div>
            ) : error ? (
              <div className="main-menu-sidebar__state main-menu-sidebar__state--error" style={{ textAlign: 'center', padding: '30px', color: CHART_EDITOR_THEME.danger, fontSize: getFontSize(14, 13, 12) }}>
                {error}
              </div>
            ) : version ? (
              <>
                <div
                  className="main-menu-sidebar__version"
                  style={{
                    marginBottom: '16px',
                    color: CHART_EDITOR_THEME.textPrimary,
                    fontWeight: '700',
                    fontSize: getFontSize(22, 20, 18),
                  }}
                >
                  v{version.version}
                </div>
                <div
                  className="main-menu-sidebar__section-label"
                  style={{
                    marginBottom: '12px',
                    fontSize: getFontSize(15, 14, 13),
                    color: CHART_EDITOR_THEME.textMuted,
                    fontWeight: '700',
                  }}
                >
                  변경사항:
                </div>
                <ul
                  className="main-menu-sidebar__changelog"
                  style={{
                    margin: 0,
                    paddingLeft: '20px',
                    listStyleType: 'disc',
                  }}
                >
                  {version.changelog.map((item, index) => (
                    <li
                      className="main-menu-sidebar__changelog-item"
                      key={index}
                      style={{
                        marginBottom: '8px',
                        color: CHART_EDITOR_THEME.textSecondary,
                        fontSize: getFontSize(14, 13, 12),
                      }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="main-menu-sidebar__state" style={{ textAlign: 'center', padding: '30px', color: CHART_EDITOR_THEME.textMuted, fontSize: getFontSize(14, 13, 12) }}>
                버전 정보가 없습니다.
              </div>
            )}
          </> 
        )}
      </div>
      </div>
    </>
  );
};

