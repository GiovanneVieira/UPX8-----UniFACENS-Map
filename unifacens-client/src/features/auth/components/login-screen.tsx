import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  confirmLabel,
}: {
  submitting: boolean;
  onSubmit: () => void;
  confirmLabel: string;
}) {
  return (
    <View className="flex-row justify-end gap-3">
      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        accessibilityState={{ disabled: submitting, busy: submitting }}
        onPress={onSubmit}
        className="min-h-[48px] flex-1 items-center justify-center rounded-xl bg-blue-700 px-4 active:opacity-80"
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

function SignInBody() {
  const { form, mutation } = useSignInForm(() => undefined);
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
            confirmLabel="Entrar"
          />
        )}
      </form.Subscribe>
    </View>
  );
}

function SignUpBody() {
  const { form, mutation } = useSignUpForm(() => undefined);
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
            confirmLabel="Criar conta"
          />
        )}
      </form.Subscribe>
    </View>
  );
}

/**
 * Tela de entrada do app (AuthGate): login obrigatório com e-mail/senha.
 * Login aberto a todos; a edição do catálogo é exclusiva de administradores.
 */
export function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-neutral-950">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-md self-center gap-5 px-5">
          <View className="items-center gap-2">
            <Text className="text-4xl font-bold text-white">UniFACENS</Text>
            <Text className="text-lg font-semibold text-sky-300">Map</Text>
            <Text className="mt-2 text-center text-sm text-neutral-300">
              Navegação pelo campus e realidade aumentada. Entre para começar.
            </Text>
          </View>

          <View className="flex-row rounded-xl bg-neutral-900 p-1">
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
                className={`min-h-[44px] flex-1 items-center justify-center rounded-lg px-3 ${
                  mode === value ? 'bg-blue-700' : ''
                }`}>
                <Text className="font-semibold text-white">{label}</Text>
              </Pressable>
            ))}
          </View>

          {mode === 'sign-in' ? <SignInBody /> : <SignUpBody />}

          <Text className="text-center text-xs text-neutral-500">
            A criação de pontos e locais é exclusiva da equipe (administradores).
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
