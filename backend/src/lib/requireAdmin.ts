import { NextRequest } from 'next/server';
import { prisma } from './prisma';
import { getSessionFromRequest } from './auth';

type AdminRole = 'admin' | 'moderator';

export interface RequireAdminResult {
  ok: boolean;
  reason?: 'missing_session' | 'user_not_found' | 'insufficient_role';
  userId?: string;
  role?: string;
}

export interface RequireAdminOptions {
  allowModerator?: boolean;
}

const ADMIN_ROLES = new Set<AdminRole>(['admin', 'moderator']);

export const isAdminRole = (role: string | null | undefined): role is AdminRole =>
  role === 'admin' || role === 'moderator';

export const requireAdmin = async (
  req: NextRequest,
  options: RequireAdminOptions = {}
): Promise<RequireAdminResult> => {
  const session = getSessionFromRequest(req);
  if (!session?.userId) {
    return { ok: false, reason: 'missing_session' };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { profile: true },
  });

  if (!user) {
    return { ok: false, reason: 'user_not_found', userId: session.userId };
  }

  const effectiveRole = user.profile?.role || user.role || session.role;
  const allowedRoles = options.allowModerator === false ? new Set<AdminRole>(['admin']) : ADMIN_ROLES;
  if (!allowedRoles.has(effectiveRole as AdminRole)) {
    return {
      ok: false,
      reason: 'insufficient_role',
      userId: user.id,
      role: effectiveRole,
    };
  }

  return { ok: true, userId: user.id, role: effectiveRole };
};

export const logAdminAuthFailure = (scope: string, result: RequireAdminResult) => {
  console.warn(`[admin auth] ${scope} denied`, {
    reason: result.reason,
    userId: result.userId,
    role: result.role,
  });
};
