import { create } from 'zustand';
import type { AuthUser } from 'shared';

interface AuthState {
  /** JWT (Bearer) da sessão — null quando desautenticado. */
  jwt: string | null;
  /** Identidade decodificada/validada para exibição na UI. */
  user: AuthUser | null;
  /** Indica que a hidratação inicial (SecureStore/sessão) já rodou. */
  hydrated: boolean;
  setSession: (jwt: string, user: AuthUser) => void;
  clearSession: () => void;
  setHydrated: (hydrated: boolean) => void;
}

/**
 * Estado de autenticação em memória (espelho reativo para a UI).
 * A persistência de verdade fica no secret-storage do dispositivo
 * (nativo) ou nos cookies de sessão do better-auth (web).
 */
export const useAuthStore = create<AuthState>((set) => ({
  jwt: null,
  user: null,
  hydrated: false,
  setSession: (jwt, user) => set({ jwt, user }),
  clearSession: () => set({ jwt: null, user: null }),
  setHydrated: (hydrated) => set({ hydrated }),
}));
