import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/use-auth-store';
import { fetchAccessPolicy } from '../services/auth-api';
import { signOutEverywhere } from '../services/auth-session';

export const accessKeys = { policy: ['access', 'policy'] as const };

/**
 * Estado de autenticação consumido pela UI.
 *
 * `canEdit` só é true para role `admin` — o login é aberto a todos (D4),
 * porém mutations continuam exclusivas da equipe.
 */
export function useAuth() {
  const policy = useQuery({
    queryKey: accessKeys.policy,
    queryFn: ({ signal }) => fetchAccessPolicy(signal),
  });
  const { authenticated, isAdmin, user } = useAuthStore(
    useShallow((state) => ({
      authenticated: state.jwt !== null,
      isAdmin: state.user?.role === 'admin',
      user: state.user,
    })),
  );
  const requiresTeamAccess = policy.data?.requiresTeamAccess ?? true;
  return {
    policy,
    authenticated,
    isAdmin,
    user,
    requiresTeamAccess,
    canEdit: isAdmin || !requiresTeamAccess,
    signOut: signOutEverywhere,
  };
}
