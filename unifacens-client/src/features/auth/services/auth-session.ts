import type { AuthUser } from 'shared';
import { useAuthStore } from '@/stores/use-auth-store';
import { authClient, saveJwt, clearJwt } from '../client/auth-client';

interface SessionUserShape {
  id: string;
  name: string;
  email: string;
  role?: string;
  image?: string | null;
}

function mapSessionUser(user: SessionUserShape): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role ?? 'user',
    image: user.image ?? null,
  };
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

/** Login bloqueado por e-mail não verificado (requireEmailVerification). */
export class EmailNotVerifiedError extends Error {
  constructor(public readonly email: string) {
    super('Verifique seu e-mail para entrar.');
    this.name = 'EmailNotVerifiedError';
  }
}

/** Envia o código OTP de verificação de e-mail (6 dígitos, 5 min). */
export async function sendEmailVerificationOtp(email: string): Promise<void> {
  const { error } = await authClient.emailOtp.sendVerificationOtp({
    email,
    type: 'email-verification',
  });
  if (error) {
    console.warn(
      '[auth] sendVerificationOtp(email-verification) erro:',
      JSON.stringify({ code: (error as { code?: string }).code, status: (error as { status?: number }).status }),
    );
    throw new Error('Não foi possível enviar o código de verificação. Tente novamente em instantes.');
  }
}

/**
 * Verifica o e-mail com o OTP e, quando a senha é conhecida (fluxo de
 * criação de conta), entra automaticamente — o store atualiza e o AuthGate
 * reage (navegação reativa, sem callback manual).
 */
export async function verifyEmailAndSignIn(email: string, otp: string, password?: string): Promise<void> {
  const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
  if (error) {
    throw new Error('Código inválido ou expirado. Solicite um novo código.');
  }
  if (password) {
    await signInWithEmail(email, password);
  }
}

/** Envia o código OTP de redefinição de senha (resposta neutra no servidor). */
export async function sendPasswordResetOtp(email: string): Promise<void> {
  const { error } = await authClient.emailOtp.sendVerificationOtp({
    email,
    type: 'forget-password',
  });
  if (error) {
    console.warn(
      '[auth] sendVerificationOtp(forget-password) erro:',
      JSON.stringify({ code: (error as { code?: string }).code, status: (error as { status?: number }).status }),
    );
    throw new Error('Não foi possível enviar o código. Confira o e-mail informado e tente novamente.');
  }
}

/** Redefine a senha com o OTP recebido (esqueceu a senha). */
export async function resetPasswordWithOtp(
  email: string,
  otp: string,
  newPassword: string,
): Promise<void> {
  const { error } = await authClient.emailOtp.resetPassword({
    email,
    otp,
    password: newPassword,
  });
  if (error) {
    throw new Error('Código inválido ou expirado. Solicite um novo código.');
  }
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
    if ((error as { code?: string }).code === 'EMAIL_NOT_VERIFIED') {
      throw new EmailNotVerifiedError(email);
    }
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

/**
 * Cria a conta e dispara o OTP de verificação — NÃO autentica.
 * Com requireEmailVerification no servidor, o login fica bloqueado até o
 * e-mail ser verificado; a senha fica em memória (componente) para o
 * sign-in automático logo após a verificação.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
): Promise<void> {
  const { error } = await authClient.signUp.email({ email, password, name });
  if (error) {
    throw new Error(
      error.code === 'USER_ALREADY_EXISTS'
        ? 'Já existe uma conta com este e-mail.'
        : 'Não foi possível criar a conta. Tente novamente.',
    );
  }
  // O sign-up pode deixar cookie de sessão não utilizável (conta não
  // verificada) — descarta para o hydrate não "logar" conta pendente.
  await authClient.signOut().catch(() => undefined);
  await sendEmailVerificationOtp(email);
}

export async function signOutEverywhere(): Promise<void> {
  await authClient.signOut().catch(() => undefined);
  await clearJwt();
  useAuthStore.getState().clearSession();
}
