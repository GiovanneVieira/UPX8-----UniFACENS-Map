import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { FormInputField } from '@/components/ui/form-field';
import {
  sendEmailVerificationOtp,
  verifyEmailAndSignIn,
} from '../services/auth-session';

const RESEND_COOLDOWN_SECONDS = 60;

interface VerifyEmailStepProps {
  email: string;
  /** Senha em memória (fluxo de criação) — entra automaticamente após verificar. */
  password?: string;
  /** Sem senha (login bloqueado): volta ao sign-in após verificar. */
  onVerifiedWithoutPassword: () => void;
  onBack: () => void;
}

/**
 * Passo de verificação de e-mail por OTP (6 dígitos, 5 min de validade).
 * Reenvio com cooldown de 60s (o servidor limita 3 envios/min por e-mail —
 * rate-limit nativo do better-auth).
 */
export function VerifyEmailStep({
  email,
  password,
  onVerifiedWithoutPassword,
  onBack,
}: VerifyEmailStepProps) {
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      await sendEmailVerificationOtp(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar o código.');
    } finally {
      setResending(false);
    }
  }

  async function handleSubmit() {
    if (otp.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyEmailAndSignIn(email, otp, password);
      if (!password) onVerifiedWithoutPassword();
      // Com senha: signInWithEmail atualizou o store — o AuthGate reage sozinho.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível verificar o e-mail.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-center text-lg font-semibold text-white">
          Verifique seu e-mail
        </Text>
        <Text className="text-center text-sm text-neutral-300">
          Enviamos um código de 6 dígitos para{' '}
          <Text className="font-semibold text-sky-300">{email}</Text>. Ele expira em 5
          minutos.
        </Text>
      </View>

      <FormInputField
        label="Código de verificação"
        keyboardType="number-pad"
        maxLength={6}
        value={otp}
        onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
        autoCorrect={false}
        autoCapitalize="none"
        helperText="Digite os 6 dígitos recebidos por e-mail."
      />

      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-rose-300">
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting || otp.length !== 6, busy: submitting }}
        disabled={submitting || otp.length !== 6}
        onPress={() => void handleSubmit()}
        className="min-h-[48px] items-center justify-center rounded-xl bg-blue-700 px-4 active:opacity-80 disabled:opacity-50">
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="font-semibold text-white">Verificar e entrar</Text>
        )}
      </Pressable>

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

      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        className="min-h-[44px] items-center justify-center">
        <Text className="text-sm text-neutral-400">Voltar</Text>
      </Pressable>
    </View>
  );
}
