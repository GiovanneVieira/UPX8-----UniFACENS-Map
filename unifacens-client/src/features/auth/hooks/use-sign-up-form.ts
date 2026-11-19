import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { signUpSchema, type SignUpDto } from 'shared';
import { signUpWithEmail } from '../services/auth-session';
export interface SignUpFormValue {
  name: string;
  email: string;
  password: string;
  /** Confirmação client-only — nunca é enviada à API (DTO = signUpSchema). */
  confirmPassword: string;
}

/**
 * Formulário de criação de conta.
 *
 * - `confirmPassword` é validação exclusiva do client (match com `password`);
 * - O validador do form valida o SUBCONJUNTO do DTO (signUpSchema é
 *   strictObject e recusaria a chave extra `confirmPassword`);
 * - `onSubmit` envia apenas `{ name, email, password }` e, no sucesso, a
 *   conta segue para verificação de e-mail (OTP) — o sign-up NÃO autentica
 *   (requireEmailVerification); a senha segue em memória para o login
 *   automático logo após a verificação.
 */
export function useSignUpForm(
  onPendingVerification: (email: string, password: string) => void,
) {
  const mutation = useMutation({
    mutationFn: (input: SignUpDto) =>
      signUpWithEmail(input.email, input.password, input.name),
  });
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    } satisfies SignUpFormValue,
    validators: {
      onSubmit: ({ value }) => {
        const parsed = signUpSchema.safeParse({
          name: value.name,
          email: value.email,
          password: value.password,
        });
        return parsed.success ? undefined : parsed.error.issues.map((issue) => issue.message);
      },
    },
    onSubmit: async ({ value }) => {
      const credentials = signUpSchema.parse({
        name: value.name,
        email: value.email,
        password: value.password,
      });
      try {
        await mutation.mutateAsync(credentials);
        onPendingVerification(credentials.email, credentials.password);
      } catch {
        /* A mensagem da mutação é exibida sem expor credenciais. */
      }
    },
  });
  return { form, mutation };
}

/**
 * Validador de campo para `confirmPassword` (match com `password`).
 * Exportado para o campo revalidar quando a senha original muda.
 */
export function confirmPasswordValidator(value: string, password: string): string | undefined {
  if (!value) return undefined; // obrigatório cai no validador do form (schema)
  return value === password ? undefined : 'As senhas não coincidem.';
}
