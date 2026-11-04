import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/use-auth-store';
import { signOutEverywhere } from '../services/auth-session';

/**
 * Estado de autenticação consumido pela UI.
 *
 * Modelo "identidade primeiro": o app exige login para qualquer tela
 * (AuthGate no _layout). Capacidades por role:
 * - `user` (comum): consulta ao campus e AR read-only;
 * - `admin`: additionally cadastra/edita/exclui places e âncoras AR.
 */
export function useAuth() {
  const { authenticated, hydrated, isAdmin, user } = useAuthStore(
    useShallow((state) => ({
      authenticated: state.jwt !== null,
      hydrated: state.hydrated,
      isAdmin: state.user?.role === 'admin',
      user: state.user,
    })),
  );
  return {
    authenticated,
    hydrated,
    isAdmin,
    user,
    canEdit: isAdmin,
    signOut: signOutEverywhere,
  };
}
