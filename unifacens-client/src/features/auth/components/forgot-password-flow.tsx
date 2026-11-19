import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { FormInputField, PasswordField } from '@/components/ui/form-field';
import { OtpInput } from '@/components/ui/otp-input';
import { useResendCooldown } from '../hooks/use-resend-cooldown';
import { resetPasswordWithOtp, sendPasswordResetOtp } from '../services/auth-session';

const MIN_PASSWORD_LENGTH = 8;

interface ForgotPasswordFlowProps {
  /** Redefinição concluída — volta ao login com aviso de sucesso. */
  onDone: () => void;
  onBack: () => void;
}

/**
 * "Esqueceu a senha?" em TRÊS etapas (duas de ação + coleta de senha):
 * ① e-mail → envia o código · ② código OTP (com reenvio/cooldown) ·
 * ③ nova senha + confirmação. O resetPassword do better-auth valida
 * e-mail+OTP+senha JUNTOS no final — erro de código devolve ao passo ②.
 * A resposta do servidor é neutra — não confirma existência da conta.
 */
export function ForgotPasswordFlow({ onDone, onBack }: ForgotPasswordFlowProps) {
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { cooldown, restart } = useResendCooldown();

  // Visibilidade COMPARTILHADA entre nova senha e confirmação.
  const [showPasswords, setShowPasswords] = useState(false);
  const togglePasswords = () => setShowPasswords((current) => !current);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  async function handleSendCode() {
    if (!emailValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await sendPasswordResetOtp(email.trim());
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o código.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      await sendPasswordResetOtp(email.trim());
      restart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar o código.');
    } finally {
      setResending(false);
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
      // OTP inválido/expirado → devolve ao passo do código (senha nova fica).
      setStep('code');
      setOtp('');
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
        <PrimaryButton
          label="Enviar código"
          disabled={!emailValid || submitting}
          submitting={submitting}
          onPress={() => void handleSendCode()}
        />
        <BackButton label="Voltar ao login" onPress={onBack} />
      </View>
    );
  }

  if (step === 'code') {
    return (
      <View className="gap-4">
        <View className="gap-1">
          <Text className="text-center text-lg font-semibold text-white">
            Código enviado
          </Text>
          <Text className="text-center text-sm text-neutral-300">
            Enviamos o código para{' '}
            <Text className="font-semibold text-sky-300">{email.trim()}</Text>. Ele expira
            em 5 minutos.
          </Text>
        </View>
        <OtpInput
          label="Código recebido"
          value={otp}
          onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
          autoFocus
          error={Boolean(error)}
        />
        {error ? (
          <Text accessibilityLiveRegion="polite" className="text-center text-sm text-rose-300">
            {error}
          </Text>
        ) : null}
        <PrimaryButton
          label="Verificar código"
          disabled={otp.length !== 6}
          onPress={() => {
            setError(null);
            setStep('password');
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: cooldown > 0 || resending, busy: resending }}
          disabled={cooldown > 0 || resending}
          onPress={() => void handleResend()}
          className="min-h-[44px] items-center justify-center">
          <Text className="text-sm text-sky-300">
            {resending
              ? 'Reenviando…'
              : cooldown > 0
                ? `Reenviar código (${cooldown}s)`
                : 'Reenviar código'}
          </Text>
        </Pressable>
        <BackButton label="Usar outro e-mail" onPress={() => setStep('email')} />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-center text-lg font-semibold text-white">
          Nova senha
        </Text>
        <Text className="text-center text-sm text-neutral-300">
          Para <Text className="font-semibold text-sky-300">{email.trim()}</Text>
        </Text>
      </View>
      <PasswordField
        label="Nova senha"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={128}
        visible={showPasswords}
        onToggleVisible={togglePasswords}
        value={password}
        onChangeText={setPassword}
        helperText="Mínimo de 8 caracteres."
      />
      <PasswordField
        label="Confirmar nova senha"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={128}
        visible={showPasswords}
        onToggleVisible={togglePasswords}
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
      <PrimaryButton
        label="Redefinir senha"
        disabled={password.length < MIN_PASSWORD_LENGTH || !passwordsMatch || submitting}
        submitting={submitting}
        onPress={() => void handleReset()}
      />
      <BackButton label="Voltar ao código" onPress={() => setStep('code')} />
    </View>
  );
}

function PrimaryButton({
  label,
  disabled,
  submitting = false,
  onPress,
}: {
  label: string;
  disabled: boolean;
  submitting?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: submitting }}
      disabled={disabled || submitting}
      onPress={onPress}
      className="min-h-[48px] items-center justify-center rounded-xl bg-blue-700 px-4 active:opacity-80 disabled:opacity-50">
      {submitting ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text className="font-semibold text-white">{label}</Text>
      )}
    </Pressable>
  );
}

function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[44px] items-center justify-center">
      <Text className="text-sm text-neutral-400">{label}</Text>
    </Pressable>
  );
}
