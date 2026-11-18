import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormInputField, PasswordField } from '@/components/ui/form-field';
import { useSignInForm } from '../hooks/use-sign-in-form';
import { confirmPasswordValidator, useSignUpForm } from '../hooks/use-sign-up-form';
import { EmailNotVerifiedError } from '../services/auth-session';
import { VerifyEmailStep } from './verify-email-step';
import { ForgotPasswordFlow } from './forgot-password-flow';

type AuthMode = 'sign-in' | 'sign-up' | 'verify-email' | 'forgot-password';

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

interface SignInBodyProps {
  onForgotPassword: () => void;
  onNeedsVerification: (email: string) => void;
}

function SignInBody({ onForgotPassword, onNeedsVerification }: SignInBodyProps) {
  const { form, mutation } = useSignInForm(() => undefined);
  const passwordRef = useRef<TextInput>(null);
  const notVerified =
    mutation.error instanceof EmailNotVerifiedError ? mutation.error : null;
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
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <PasswordField
            ref={passwordRef}
            label="Senha"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            returnKeyType="go"
            onSubmitEditing={() => void form.handleSubmit()}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
            helperText="Mínimo de 8 caracteres."
          />
        )}
      </form.Field>
      <Pressable
        accessibilityRole="link"
        onPress={onForgotPassword}
        className="min-h-[44px] items-end justify-center">
        <Text className="text-sm text-sky-300">Esqueceu a senha?</Text>
      </Pressable>
      {notVerified ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onNeedsVerification(notVerified.email)}
          className="min-h-[48px] items-center justify-center rounded-xl border border-sky-400 bg-slate-900 px-4 active:opacity-80">
          <Text className="font-semibold text-sky-200">Verificar e-mail agora</Text>
        </Pressable>
      ) : (
        <ErrorNotice message={mutation.error?.message} />
      )}
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

function SignUpBody({ onPendingVerification }: { onPendingVerification: (email: string, password: string) => void }) {
  const { form, mutation } = useSignUpForm(onPendingVerification);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  // Visibilidade COMPARTILHADA: abrir um campo de senha abre o outro.
  const [showPasswords, setShowPasswords] = useState(false);
  const togglePasswords = () => setShowPasswords((current) => !current);
  return (
    <View className="gap-3">
      <form.Field name="name">
        {(field) => (
          <FormInputField
            label="Nome"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={120}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
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
            ref={emailRef}
            label="E-mail"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={255}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <PasswordField
            ref={passwordRef}
            label="Senha"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            visible={showPasswords}
            onToggleVisible={togglePasswords}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
            helperText="Mínimo de 8 caracteres."
          />
        )}
      </form.Field>
      <form.Field
        name="confirmPassword"
        validators={{
          onChangeListenTo: ['password'],
          onChange: ({ value, fieldApi }) =>
            confirmPasswordValidator(
              value,
              fieldApi.form.getFieldValue('password'),
            ),
        }}
      >
        {(field) => (
          <PasswordField
            ref={confirmPasswordRef}
            label="Confirmar senha"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            returnKeyType="go"
            onSubmitEditing={() => void form.handleSubmit()}
            visible={showPasswords}
            onToggleVisible={togglePasswords}
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            errors={fieldErrors(field.state.meta.errors)}
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
 * Modos: entrar · criar conta (→ verificação OTP) · esqueceu a senha (OTP).
 */
export function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [notice, setNotice] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ email: string; password?: string } | null>(
    null,
  );
  const insets = useSafeAreaInsets();

  function switchMode(next: AuthMode) {
    setNotice(null);
    setMode(next);
  }

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

          {mode === 'sign-in' || mode === 'sign-up' ? (
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
                  onPress={() => switchMode(value)}
                  className={`min-h-[44px] flex-1 items-center justify-center rounded-lg px-3 ${
                    mode === value ? 'bg-blue-700' : ''
                  }`}>
                  <Text className="font-semibold text-white">{label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {notice ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-center text-sm text-emerald-300">
              {notice}
            </Text>
          ) : null}

          {mode === 'sign-in' ? (
            <SignInBody
              onForgotPassword={() => switchMode('forgot-password')}
              onNeedsVerification={(email) => {
                setVerify({ email });
                switchMode('verify-email');
              }}
            />
          ) : mode === 'sign-up' ? (
            <SignUpBody
              onPendingVerification={(email, password) => {
                setVerify({ email, password });
                switchMode('verify-email');
              }}
            />
          ) : mode === 'verify-email' && verify ? (
            <VerifyEmailStep
              key={verify.email}
              email={verify.email}
              password={verify.password}
              onVerifiedWithoutPassword={() => {
                setVerify(null);
                setNotice('E-mail verificado! Entre com suas credenciais.');
                setMode('sign-in');
              }}
              onBack={() => switchMode('sign-in')}
            />
          ) : (
            <ForgotPasswordFlow
              onDone={() => {
                setNotice('Senha redefinida! Entre com a nova senha.');
                setMode('sign-in');
              }}
              onBack={() => switchMode('sign-in')}
            />
          )}

          <Text className="text-center text-xs text-neutral-500">
            A criação de pontos e locais é exclusiva da equipe (administradores).
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
