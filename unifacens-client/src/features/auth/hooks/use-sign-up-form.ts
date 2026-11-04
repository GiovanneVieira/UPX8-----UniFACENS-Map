import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { signUpSchema, type SignUpDto } from 'shared';
import { signUpWithEmail } from '../services/auth-session';

export function useSignUpForm(onAuthenticated: () => void) {
  const mutation = useMutation({
    mutationFn: (input: SignUpDto) =>
      signUpWithEmail(input.email, input.password, input.name),
  });
  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      const credentials = signUpSchema.parse(value);
      try {
        await mutation.mutateAsync(credentials);
        onAuthenticated();
      } catch {
        /* A mensagem da mutação é exibida sem expor credenciais. */
      }
    },
  });
  return { form, mutation };
}
