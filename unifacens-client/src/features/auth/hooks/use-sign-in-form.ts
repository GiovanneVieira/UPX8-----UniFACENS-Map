import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { signInSchema, type SignInDto } from 'shared';
import { signInWithEmail } from '../services/auth-session';

export function useSignInForm(onAuthenticated: () => void) {
  const mutation = useMutation({
    mutationFn: (input: SignInDto) => signInWithEmail(input.email, input.password),
  });
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      const credentials = signInSchema.parse(value);
      try {
        await mutation.mutateAsync(credentials);
        onAuthenticated();
      } catch (err) {
        console.warn('[auth] signIn falhou:', err);
      }
    },
  });
  return { form, mutation };
}
