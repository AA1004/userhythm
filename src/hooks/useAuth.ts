import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured, profileAPI, UserProfile } from '../lib/supabaseClient';

type AuthUser = {
  id: string;
  email?: string;
  role?: string;
  profile?: any;
};

export interface UseAuthReturn {
  authUser: AuthUser | null;
  remoteProfile: UserProfile | null;
  handleLoginWithGoogle: () => Promise<void>;
  handleLogout: () => Promise<void>;
  canEditCharts: boolean;
  hasPrivilegedRole: boolean;
  canSeeAdminMenu: boolean;
  currentRoleLabel: string;
  roleChessIcon: string;
  isAdmin: boolean;
  isModerator: boolean;
  userDisplayName: (displayName: string) => string;
  ensureEditorAccess: () => boolean;
}

export function useAuth(): UseAuthReturn {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [remoteProfile, setRemoteProfile] = useState<UserProfile | null>(null);

  // 인증 상태 동기화
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthUser(null);
      return;
    }

    let isMounted = true;
    const syncSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('세션 정보를 가져오지 못했습니다:', error);
          return;
        }
        const user = data.session?.user ?? null;
        if (isMounted) {
          setAuthUser(user);
        }

        if (user) {
          try {
            const profile = await profileAPI.getOrCreateProfile(user.id);
            if (isMounted) {
              setRemoteProfile(profile);
            }
          } catch (profileError) {
            console.error('프로필 정보를 불러오지 못했습니다:', profileError);
          }
        } else {
          if (isMounted) {
            setRemoteProfile(null);
          }
        }
      } catch (error) {
        console.error('Supabase 세션 동기화 실패:', error);
      }
    };

    syncSession();
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      const user = session?.user ?? null;
      setAuthUser(user);

      if (user) {
        try {
          const profile = await profileAPI.getOrCreateProfile(user.id);
          if (isMounted) {
            setRemoteProfile(profile);
          }
        } catch (profileError) {
          console.error('프로필 정보를 불러오지 못했습니다:', profileError);
        }
      } else {
        setRemoteProfile(null);
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // 로그인/로그아웃 핸들러
  const handleLoginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      alert('Supabase가 설정되지 않았습니다.');
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Google 로그인 실패:', error);
      alert(error?.message || '로그인 중 문제가 발생했습니다.');
    }
  }, []);

  const handleLogout = useCallback(async () => {
    console.log('[Game] 로그아웃 버튼 클릭');

    // UI는 즉시 로그아웃 상태로 전환 (낙관적 업데이트)
    setAuthUser(null);
    setRemoteProfile(null);

    if (!isSupabaseConfigured) {
      // Supabase 미설정 환경에서는 여기서 끝
      return;
    }

    try {
      // Supabase signOut이 길게 걸리거나 응답이 없더라도 UI를 막지 않도록 타임아웃을 건다
      const signOutPromise = supabase.auth.signOut();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase signOut timeout')), 7000)
      );

      await Promise.race([signOutPromise, timeout]);
      console.log('[Game] Supabase 로그아웃 요청 완료');
    } catch (error: any) {
      console.error('로그아웃 실패(무시 가능):', error);
      // 여기서는 추가 alert 없이 콘솔만 찍고 넘어간다 (UI는 이미 로그인 해제 상태)
    }
  }, []);

  // 로그인 가능 여부 (Supabase 설정 필요)
  const canEditCharts = !isSupabaseConfigured ? true : !!authUser;
  const hasPrivilegedRole = remoteProfile?.role === 'admin' || remoteProfile?.role === 'moderator';
  const canSeeAdminMenu = !isSupabaseConfigured ? true : !!authUser && hasPrivilegedRole;

  // 역할 라벨
  const currentRoleLabel = useMemo(() => {
    if (!remoteProfile?.role) return '일반 사용자';
    switch (remoteProfile.role) {
      case 'admin':
        return '관리자';
      case 'moderator':
        return '운영자';
      default:
        return '일반 사용자';
    }
  }, [remoteProfile?.role]);

  // 역할별 체스말 아이콘 (User → 폰, Moderator → 비숍, Admin → 퀸)
  const roleChessIcon = useMemo(() => {
    switch (remoteProfile?.role) {
      case 'admin':
        return '♛';
      case 'moderator':
        return '♝';
      default:
        return '♟';
    }
  }, [remoteProfile?.role]);

  const isAdmin = useMemo(() => remoteProfile?.role === 'admin', [remoteProfile?.role]);
  const isModerator = useMemo(() => remoteProfile?.role === 'moderator', [remoteProfile?.role]);

  // 표시할 이름 (닉네임 > 구글 이름 > 이메일)
  const userDisplayName = useCallback((displayName: string) => {
    if (displayName.trim()) return displayName.trim();
    if (remoteProfile?.display_name) return remoteProfile.display_name;
    if ((remoteProfile as any)?.nickname) return (remoteProfile as any).nickname;
    if (authUser?.profile?.nickname) return authUser.profile.nickname;
    if (authUser?.email) return authUser.email.split('@')[0];
    return '게스트';
  }, [authUser, remoteProfile]);

  // 에디터 접근 확인
  const ensureEditorAccess = useCallback(() => {
    if (!canEditCharts) {
      alert('Google 로그인 후 이용할 수 있습니다.');
      return false;
    }
    return true;
  }, [canEditCharts]);

  return {
    authUser,
    remoteProfile,
    handleLoginWithGoogle,
    handleLogout,
    canEditCharts,
    hasPrivilegedRole,
    canSeeAdminMenu,
    currentRoleLabel,
    roleChessIcon,
    isAdmin,
    isModerator,
    userDisplayName,
    ensureEditorAccess,
  };
}

