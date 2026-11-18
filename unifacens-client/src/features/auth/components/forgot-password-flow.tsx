import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { FormInputField, PasswordField } from '@/components/ui/form-field';
import { resetPasswordWithOtp, sendPasswordResetOtp } from '../services/auth-session';

const MIN_PASSWORD_LENGTH = 8;

interface ForgotPasswordFlowProps {
  /** Redefinição concluída — volta ao login com aviso de sucesso. */
  onDone: () => void;
  onBack: () => void;
}

/**
 * "Esqueceu a senha?" em dois passos: e-mail → OTP + nova senha (com
 * confirmação). A resposta do servidor é neutra — não confirma existência
 * da conta até o OTP válido.
 */
export function ForgotPasswordFlow({ onDone, onBack }: ForgotPasswordFlowProps) {
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  async function handleSendCode() {
    if (!emailValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await sendPasswordResetOtp(email.trim());
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o código.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (otp.length !== 6 || password.length < MIN_PASSWORD_LENGTH || !passwordsMatch || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await resetPasswordWithOtp(email.trim(), otp, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'email') {
    return (
      <View className="gap-4">
        <View className="gap-1">
          <Text className="text-center text-lg font-semibold text-white">
            Redefinir senha
          </Text>
          <Text className="text-center text-sm text-neutral-300">
            Informe seu e-mail para receber um código de 6 dígitos.
          </Text>
        </View>
        <FormInputField
          label="E-mail"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={255}
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => void handleSendCode()}
        />
        {error ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-rose-300">
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !emailValid || submitting, busy: submitting }}
          disabled={!emailValid || submitting}
          onPress={() => void handleSendCode()}
          className="min-h-[48px] items-center justify-center rounded-xl bg-blue-700 px-4 active:opacity-80 disabled:opacity-50">
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="font-semibold text-white">Enviar código</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          className="min-h-[44px] items-center justify-center">
          <Text className="text-sm text-neutral-400">Voltar ao login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-center text-lg font-semibold text-white">
          Código enviado
        </Text>
        <Text className="text-center text-sm text-neutral-300">
          Enviamos o código para{' '}
          <Text className="font-semibold text-sky-300">{email.trim()}</Text>.
        </Text>
      </View>
      <FormInputField
        label="Código recebido"
        keyboardType="number-pad"
        maxLength={6}
        value={otp}
        onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
      />
      <PasswordField
        label="Nova senha"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={128}
        value={password}
        onChangeText={setPassword}
        helperText="Mínimo de 8 caracteres."
      />
      <PasswordField
        label="Confirmar nova senha"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={128}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        errors={
          confirmPassword.length > 0 && !passwordsMatch
            ? ['As senhas não coincidem.']
            : []
        }
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-rose-300">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled: submitting || otp.length !== 6 || !passwordsMatch,
          busy: submitting,
        }}
        disabled={submitting || otp.length !== 6 || !passwordsMatch}
        onPress={() => void handleReset()}
        className="min-h-[48px] items-center justify-center rounded-xl bg-blue-700 px-4 active:opacity-80 disabled:opacity-50">
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="font-semibold text-white">Redefinir senha</Text>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setStep('email')}
        className="min-h-[44px] items-center justify-center">
        <Text className="text-sm text-neutral-400">Usar outro e-mail</Text>
      </Pressable>
    </View>
  );
}
