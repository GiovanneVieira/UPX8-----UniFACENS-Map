import { useEffect, useState } from 'react';

/**
 * Contador regressivo para reenvio de OTP (o servidor limita 3 envios/60s —
 * rate-limit nativo do better-auth). Inicia JÁ contando (o código acabou de
 * ser enviado ao entrar no passo).
 */
export function useResendCooldown(seconds = 60) {
  const [cooldown, setCooldown] = useState(seconds);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  return {
    cooldown,
    /** Reinicia a contagem (após um reenvio bem-sucedido). */
    restart: () => setCooldown(seconds),
  };
}
