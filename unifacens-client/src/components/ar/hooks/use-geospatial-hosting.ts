import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeospatialPose } from './use-geospatial-pose';

/**
 * ── Hosting GEOESPACIAL em background (F2 — dupla ancoragem, 2026-11-13) ──
 *
 * Depois que a âncora VISUAL hospeda (pointHosting phase 'hosted'), este hook
 * hospeda TAMBM uma âncora geoespacial na plataforma ReactVision
 * (`hostGeospatialAnchor`) — UUID persistido no banco (`geospatialAnchorId`)
 * e resolvível entre sessões e por outros usuários (`resolveGeospatialAnchor`,
 * roteado no useNativeAnchors). Camadas de precisão no render:
 *   cloud visual (cm) > geospatial hospedada (m) > projeção client-side.
 *
 * ⚠️ one-op-por-vez (§12.12): dispara SÓ na fase 'hosted' (o hostCloudAnchor
 * já concluiu) e o container PAUSA o loop de resolve cloud enquanto este
 * hook está 'pending' — duas ops nativas concorrentes penduram a fila.
 *
 * Não-bloqueante por design: falha/skip NUNCA impede o save do pin — o pin
 * segue cloud-only e o chip do modal comunica o estado honesto.
 */

/** Gate de acurácia horizontal para hospedar (best practice da doc: ~5m é
 *  inalcançável GPS-only indoor; 10m = antigo CREATE_MAX_ACCURACY_M). */
export const GEO_HOST_MAX_ACCURACY_M = 10;
/** Confia na altitude da pose só com acurácia vertical boa (§11.5); senão
 *  hospeda relativo ao terreno (o RV resolve a altura server-side). */
const MAX_VERTICAL_TRUST_M = 20;
/** Altura acima do terreno no modo "Terrain" (paridade com o caminho local). */
const PIN_HEIGHT_ABOVE_TERRAIN_M = 1.5;
/** Timeout JS — hostGeospatialAnchor é uma op de rede da plataforma. */
const HOST_TIMEOUT_MS = 45_000;
/** 1ª tentativa + 1 retry (transientes de rede). */
const MAX_ATTEMPTS = 2;
/** Respiro entre tentativas (drenar a op nativa anterior). */
const RETRY_BREATH_MS = 3_000;

export type GeospatialHostState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'hosted'; anchorId: string; accuracyM: number }
  | {
      status: 'skipped';
      reason: 'provider' | 'no-pose' | 'gate';
      accuracyM: number | null;
    }
  | { status: 'failed'; error: string };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: sem resposta em ${ms}ms`)), ms),
    ),
  ]);
}

export function useGeospatialHosting({
  /** true enquanto pointHosting.state.phase === 'hosted' (gatilho). */
  hosted,
  /** Provider AR ativo — hostGeospatialAnchor é exclusivo do reactvision. */
  provider,
  /** Pose média fresca do buffer (mesma fonte do handleCreate). */
  averagedPose,
  /** Dispara 1× por run quando o hosting conclui (container persiste). */
  onHosted,
}: {
  hosted: boolean;
  provider: string;
  averagedPose: () => GeospatialPose | null;
  onHosted: (anchorId: string, accuracyM: number) => void;
}) {
  const [state, setState] = useState<GeospatialHostState>({ status: 'idle' });
  const navigatorRef = useRef<any>(null);
  const aliveRef = useRef(true);
  const stateRef = useRef<GeospatialHostState>({ status: 'idle' });
  stateRef.current = state;
  const onHostedRef = useRef(onHosted);
  onHostedRef.current = onHosted;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const handleNavigatorReady = useCallback((nav: any) => {
    navigatorRef.current = nav;
  }, []);

  /** Novo run: zera o estado quando a fase 'hosted' termina (save/descarte). */
  useEffect(() => {
    if (!hosted && stateRef.current.status !== 'idle') {
      setState({ status: 'idle' });
    }
  }, [hosted]);

  /** Dispara o hosting UMA vez por fase 'hosted' (em background). */
  useEffect(() => {
    if (!hosted) return;
    if (stateRef.current.status !== 'idle') return;

    const nav = navigatorRef.current;
    if (provider !== 'reactvision' || typeof nav?.hostGeospatialAnchor !== 'function') {
      setState({ status: 'skipped', reason: 'provider', accuracyM: null });
      return;
    }

    const pose = averagedPose();
    if (!pose) {
      setState({ status: 'skipped', reason: 'no-pose', accuracyM: null });
      return;
    }
    if (pose.horizontalAccuracy > GEO_HOST_MAX_ACCURACY_M) {
      console.log(
        `[ARGeoHost] skip — acurácia ±${pose.horizontalAccuracy.toFixed(0)}m > gate ${GEO_HOST_MAX_ACCURACY_M}m (pin segue cloud-only)`,
      );
      setState({ status: 'skipped', reason: 'gate', accuracyM: pose.horizontalAccuracy });
      return;
    }

    setState({ status: 'pending' });
    void (async () => {
      // Roteamento do altitudeMode: altitude confiável → WGS84 absoluto;
      // senão → Terrain (a plataforma resolve a altura contra o terreno).
      const trustAltitude =
        Number.isFinite(pose.altitude) && pose.verticalAccuracy <= MAX_VERTICAL_TRUST_M;
      const altitudeMode = trustAltitude ? 'WGS84' : 'Terrain';
      const altitude = trustAltitude ? pose.altitude : PIN_HEIGHT_ABOVE_TERRAIN_M;

      let lastError = 'hosting falhou (sem detalhe)';
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const result = (await withTimeout(
            nav.hostGeospatialAnchor(
              pose.latitude,
              pose.longitude,
              altitude,
              altitudeMode,
            ) as Promise<{ success?: boolean; anchorId?: string; error?: string }>,
            HOST_TIMEOUT_MS,
            'hostGeospatialAnchor',
          )) as { success?: boolean; anchorId?: string; error?: string };
          if (!aliveRef.current) return;
          if (result?.success && result.anchorId) {
            const accuracyM = Number(pose.horizontalAccuracy.toFixed(1));
            console.log(
              `[ARGeoHost] âncora geoespacial hospedada — ${result.anchorId.slice(0, 16)}… (${altitudeMode}, ±${accuracyM}m)`,
            );
            setState({ status: 'hosted', anchorId: result.anchorId, accuracyM });
            onHostedRef.current(result.anchorId, accuracyM);
            return;
          }
          lastError = String(result?.error ?? lastError);
        } catch (err) {
          if (!aliveRef.current) return;
          lastError = err instanceof Error ? err.message : String(err);
        }
        console.warn(`[ARGeoHost] tentativa ${attempt}/${MAX_ATTEMPTS} falhou: ${lastError}`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_BREATH_MS));
        }
      }
      if (!aliveRef.current) return;
      // Não-bloqueante: o pin salva cloud-only; chip mostra o estado.
      setState({ status: 'failed', error: lastError });
    })();
  }, [hosted, provider, averagedPose]);

  return {
    state,
    handleNavigatorReady,
    /** true enquanto há op nativa em voo (pausa o resolve cloud). */
    pending: state.status === 'pending',
  };
}
