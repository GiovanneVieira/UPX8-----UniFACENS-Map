import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { FormInputField } from '@/components/ui/form-field';
import { useSignInForm } from '../hooks/use-sign-in-form';
import { useSignUpForm } from '../hooks/use-sign-up-form';

type AuthMode = 'sign-in' | 'sign-up';

function fieldErrors(errors: Array<unknown>): string[] {
  return errors.map((error) =>
    typeof error === 'string' ? error : ((error as { message?: string })?.message ?? ''),
  );
}

function ActionButtons({
  submitting,
  onSubmit,
  onClose,
  confirmLabel,
}: {
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
  confirmLabel: string;
}) {
  return (
    <View className="flex-row flex-wrap justify-end gap-3">
      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        accessibilityState={{ disabled: submitting }}
        onPress={onClose}
        className="min-h-[44px] justify-center rounded-xl bg-slate-800 px-4 active:opacity-80"
      >
        <Text className="font-semibold text-white">Cancelar</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        accessibilityState={{ disabled: submitting, busy: submitting }}
        onPress={onSubmit}
        className="min-h-[44px] justify-center rounded-xl bg-blue-700 px-4 active:opacity-80"
      >
        <Text className="font-semibold text-white">
          {submitting ? 'Aguarde…' : confirmLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function ErrorNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" className="text-sm text-rose-300">
      {message}
    </Text>
  );
}

function SignInBody({ onClose }: { onClose: () => void }) {
  const { form, mutation } = useSignInForm(onClose);
  return (
    <View className="gap-3">
      <form.Field name="email">
        {(field) => (
          <FormInputField
            label="E-mail"
            keyboardType="email-address"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={255}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <FormInputField
            label="Senha"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
            helperText="Mínimo de 8 caracteres."
          />
        )}
      </form.Field>
      <ErrorNotice message={mutation.error?.message} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <ActionButtons
            submitting={submitting}
            onSubmit={() => void form.handleSubmit()}
            onClose={onClose}
            confirmLabel="Entrar"
          />
        )}
      </form.Subscribe>
    </View>
  );
}

function SignUpBody({ onClose }: { onClose: () => void }) {
  const { form, mutation } = useSignUpForm(onClose);
  return (
    <View className="gap-3">
      <form.Field name="name">
        {(field) => (
          <FormInputField
            label="Nome"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={120}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <FormInputField
            label="E-mail"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={255}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <FormInputField
            label="Senha"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
            helperText="Mínimo de 8 caracteres."
          />
        )}
      </form.Field>
      <ErrorNotice message={mutation.error?.message} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <ActionButtons
            submitting={submitting}
            onSubmit={() => void form.handleSubmit()}
            onClose={onClose}
            confirmLabel="Criar conta"
          />
        )}
      </form.Subscribe>
    </View>
  );
}

/**
 * Modal de autenticação com e-mail/senha (better-auth).
 * Login aberto a todos (D4); edição do catálogo exclusiva de admins.
 */
export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const submitting = false; // corpos isolados controlam o próprio estado de submit

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!submitting) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-center bg-black/70 p-4"
      >
        <View
          accessibilityViewIsModal
          className="max-h-[90%] w-full max-w-xl self-center rounded-3xl border border-slate-700 bg-slate-950"
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <View className="gap-3 p-5">
              <Text accessibilityRole="header" className="text-2xl font-bold text-white">
                {mode === 'sign-in' ? 'Entrar' : 'Criar conta'}
              </Text>
              <Text className="text-sm text-slate-300">
                {mode === 'sign-in'
                  ? 'Use e-mail e senha. A edição do catálogo é exclusiva de contas de administrador.'
                  : 'Qualquer pessoa pode criar uma conta para consultar e contribuir. A edição é reservada à equipe.'}
              </Text>

              <View className="flex-row rounded-xl bg-slate-900 p-1">
                {(
                  [
                    ['sign-in', 'Entrar'],
                    ['sign-up', 'Criar conta'],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === value }}
                    onPress={() => setMode(value)}
                    className={`min-h-[40px] flex-1 items-center justify-center rounded-lg px-3 ${
                      mode === value ? 'bg-blue-700' : ''
                    }`}
                  >
                    <Text className="font-semibold text-white">{label}</Text>
                  </Pressable>
                ))}
              </View>

              {mode === 'sign-in' ? (
                <SignInBody onClose={onClose} />
              ) : (
                <SignUpBody onClose={onClose} />
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
