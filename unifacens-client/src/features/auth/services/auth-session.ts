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
  // (expoClient/SecureStore no nativo; cookies do navegador na web — exige
  // credentials:'include' no authClient, senão o navegador os descarta).
  const response = await authClient.$fetch<{ token?: string }>('/token');
  const token = response.data?.token;
  if (!token) {
    // Detalhe técnico fica no console; o cliente vê mensagem humana.
    console.warn(
      '[auth] /auth/token não retornou token:',
      JSON.stringify({ error: response.error ?? null, status: (response as { status?: number }).status ?? null }),
    );
    throw new Error('Não foi possível concluir o acesso. Tente entrar novamente.');
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
  } finally {
    // CRÍTICO: o gate do _layout depende de `hydrated` em TODOS os caminhos —
    // sem isto, uma sessão válida deixa o app preso na splash (tela vazia).
    useAuthStore.getState().setHydrated(true);
  }
  await clearJwt();
  useAuthStore.getState().clearSession();
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
  if (!session?.user) {
    console.warn('[auth] signIn ok, mas getSession sem usuário — cookie não persistiu?');
    throw new Error('Não foi possível concluir o acesso. Tente entrar novamente.');
  }
  const jwt = await issueAndStoreJwt();
  const user = mapSessionUser(session.user as SessionUserShape);
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
  if (!session?.user) {
    console.warn('[auth] signUp ok, mas getSession sem usuário — cookie não persistiu?');
    throw new Error('Não foi possível concluir o acesso. Tente novamente.');
  }
  const jwt = await issueAndStoreJwt();
  const user = mapSessionUser(session.user as SessionUserShape);
  useAuthStore.getState().setSession(jwt, user);
  return user;
}

export async function signOutEverywhere(): Promise<void> {
  await authClient.signOut().catch(() => undefined);
  await clearJwt();
  useAuthStore.getState().clearSession();
}
