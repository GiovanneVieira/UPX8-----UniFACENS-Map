import type { AuthUser } from 'shared';
import { useAuthStore } from '@/stores/use-auth-store';
import { authClient, saveJwt, clearJwt } from '../client/auth-client';

interface SessionUserShape {
  id: string;
  name: string;
  email: string;
  role?: string;
}

function mapSessionUser(user: SessionUserShape): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role ?? 'user' };
}

async function issueAndStoreJwt(): Promise<string> {
  // GET /auth/token: o client anexa os cookies de sessão persistidos
  // (expoClient/SecureStore no nativo; cookies do navegador na web).
  const response = await authClient.$fetch<{ token?: string }>('/token');
  const token = response.data?.token;
  if (!token) {
    throw new Error('Não foi possível obter o token de acesso. Tente novamente.');
  }
  await saveJwt(token);
  return token;
}

/**
 * Restaura a sessão no início do app.
 *
 * Nativo: o cookie de sessão persistido no SecureStore pelo expoClient
 * permite renovar o JWT silenciosamente (D1: 24h + refresh) — se a sessão
 * ainda for válida, um JWT novo é emitido e armazenado.
 */
export async function hydrateAuth(): Promise<void> {
  try {
    const { data: session } = await authClient.getSession();
    if (session?.user) {
      const jwt = await issueAndStoreJwt();
      useAuthStore
        .getState()
        .setSession(jwt, mapSessionUser(session.user as SessionUserShape));
      return;
    }
  } catch (err) {
    console.warn('[auth] Falha ao hidratar sessão:', err);
  }
  await clearJwt();
  useAuthStore.getState().clearSession();
  useAuthStore.getState().setHydrated(true);
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  const { error } = await authClient.signIn.email({ email, password });
  if (error) {
    console.warn(
      '[auth] signIn.email erro:',
      JSON.stringify({ code: (error as { code?: string }).code, status: (error as { status?: number }).status, message: error.message }),
    );
    throw new Error(
      error.code === 'INVALID_EMAIL_OR_PASSWORD'
        ? 'E-mail ou senha incorretos.'
        : 'Não foi possível entrar. Confira a conexão e tente novamente.',
    );
  }
  const { data: session } = await authClient.getSession();
  const jwt = await issueAndStoreJwt();
  const user = mapSessionUser(session?.user as SessionUserShape);
  useAuthStore.getState().setSession(jwt, user);
  return user;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
): Promise<AuthUser> {
  const { error } = await authClient.signUp.email({ email, password, name });
  if (error) {
    throw new Error(
      error.code === 'USER_ALREADY_EXISTS'
        ? 'Já existe uma conta com este e-mail.'
        : 'Não foi possível criar a conta. Tente novamente.',
    );
  }
  const { data: session } = await authClient.getSession();
  const jwt = await issueAndStoreJwt();
  const user = mapSessionUser(session?.user as SessionUserShape);
  useAuthStore.getState().setSession(jwt, user);
  return user;
}

export async function signOutEverywhere(): Promise<void> {
  await authClient.signOut().catch(() => undefined);
  await clearJwt();
  useAuthStore.getState().clearSession();
}
