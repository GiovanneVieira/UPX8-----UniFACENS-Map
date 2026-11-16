import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeospatialPose } from './use-geospatial-pose';

/**
 * ── Hosting GEOESPACIAL em background (F2 — dupla ancoragem, 2026-11-13) ──
 *
 * Depois que a âncora VISUAL hospeda (pointHosting phase 'hosted'), este hook
 * hospeda TAMBÉM uma âncora geoespacial na plataforma ReactVision
 * (`hostGeospatialAnchor`) — UUID persistido no banco (`geospatialAnchorId`)
 * e resolvível entre sessões e por outros usuários. Camadas de precisão:
 *   cloud visual (cm) > geospatial hospedada (m) > projeção client-side.
 *
 * ⚠️ one-op-por-vez (§12.12): dispara SÓ na fase 'hosted' (o hostCloudAnchor
 * já concluiu) e o container PAUSA o loop de resolve cloud enquanto este
 * hook está 'pending' — duas ops nativas concorrentes penduram a fila.
 *
 * ⚠️ WAIT-LOOP (best practice #2 da doc, lição de device 2026-11-16): o
 * hostCloudAnchor (10-90s) faz o poll de pose 1Hz definhar no módulo
 * one-op-por-vez — ao entrar em 'hosted' o buffer de poses pode estar TODO
 * stale (>5s). Fire-once pulava silenciosamente ('no-pose' mudo era O bug
 * do "geospatial não subiu"). Agora esperamos até POSE_WAIT_TIMEOUT_MS por
 * uma média fresca (o poll retoma sozinho quando a fila nativa drena).
 *
 * ⚠️ altitudeMode (lição 2026-11-16, docs ≠ impl): a DOC diz
 * "WGS84"|"Terrain"|"Rooftop", mas a implementação (3.1.1, dist) aceita
 * "street_level" (default) | "rooftop_level" — passamos "street_level"
 * sempre (POIs ao nível do chão; rooftop não usamos).
 *
 * Não-bloqueante por design: falha/skip NUNCA impede o save do pin — o pin
 * segue cloud-only e o chip do modal comunica o estado honesto.
 */

/** Gate de acurácia horizontal para hospedar (best practice da doc: ~5m é
 *  inalcançável GPS-only indoor; 10m = antigo CREATE_MAX_ACCURACY_M). */
export const GEO_HOST_MAX_ACCURACY_M = 10;
/** Janela de espera por pose fresca pós-hostCloudAnchor (ms). */
export const POSE_WAIT_TIMEOUT_MS = 20_000;
/** Intervalo de re-checagem da pose durante a espera (ms). */
const POSE_WAIT_INTERVAL_MS = 1_000;
/**
 * Altura acima do terreno como fallback do altitude quando não confiamos na
 * vertical da pose (paridade com o caminho local createTerrainAnchor).
 */
/** Altura acima do terreno como fallback EXTREMO (pose sem altitude finita). */
const PIN_HEIGHT_ABOVE_TERRAIN_M = 1.5;
/** Timeout JS — hostGeospatialAnchor é op de rede + pode esperar a fila
 *  nativa drenar (resolve cloud em voo até ~35s) — folga suficiente. */
const HOST_TIMEOUT_MS = 60_000;
/** 1ª tentativa + 1 retry (transientes de rede). */
const MAX_ATTEMPTS = 2;
/** Respiro entre tentativas (drenar a op nativa anterior). */
const RETRY_BREATH_MS = 3_000;

export type GeospatialHostState =
  | { status: 'idle' }
  /** Esperando pose fresca pós-hostCloudAnchor (wait-loop da doc). */
  | { status: 'waiting' }
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
  /** Tab focada (gate de op nativa, §12.12). */
  focused,
  /** Tracking ≥ 2 (sessão viva — gate de op nativa, §12.12). */
  trackingHealthy,
  /** Dispara 1× por run quando o hosting conclui (container persiste). */
  onHosted,
}: {
  hosted: boolean;
  provider: string;
  averagedPose: () => GeospatialPose | null;
  focused: boolean;
  trackingHealthy: boolean;
  onHosted: (anchorId: string, accuracyM: number) => void;
}) {
  const [state, setState] = useState<GeospatialHostState>({ status: 'idle' });
  const navigatorRef = useRef<any>(null);
  const aliveRef = useRef(true);
  const stateRef = useRef<GeospatialHostState>({ status: 'idle' });
  stateRef.current = state;
  const onHostedRef = useRef(onHosted);
  onHostedRef.current = onHosted;

  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const trackingRef = useRef(trackingHealthy);
  trackingRef.current = trackingHealthy;

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
      // ⚠️ NUNCA silencioso (lição 2026-11-16: skip mudo = bug invisível).
      console.warn(
        `[ARGeoHost] skip (provider) — provider="${provider}", hostGeospatialAnchor=${typeof nav?.hostGeospatialAnchor}`,
      );
      setState({ status: 'skipped', reason: 'provider', accuracyM: null });
      return;
    }

    // WAIT-LOOP: o buffer pode estar 100% stale ao sair do hostCloudAnchor.
    setState({ status: 'waiting' });
    void (async () => {
      const deadline = Date.now() + POSE_WAIT_TIMEOUT_MS;
      let pose: GeospatialPose | null = null;
      while (Date.now() < deadline) {
        if (!aliveRef.current) return;
        // Foco/tracking podem cair durante o preenchimento do formulário —
        // a espera continua (a op nativa só dispara com ambos saudáveis).
        if (focusedRef.current && trackingRef.current) {
          pose = averagedPose();
          if (pose) break;
        }
        await new Promise((resolve) => setTimeout(resolve, POSE_WAIT_INTERVAL_MS));
      }
      if (!aliveRef.current) return;

      if (!pose) {
        console.warn(
          `[ARGeoHost] skip (no-pose) — sem pose fresca em ${POSE_WAIT_TIMEOUT_MS / 1000}s pós-hostCloudAnchor (poll definhou na fila one-op-por-vez?)`,
        );
        setState({ status: 'skipped', reason: 'no-pose', accuracyM: null });
        return;
      }
      if (pose.horizontalAccuracy > GEO_HOST_MAX_ACCURACY_M) {
        console.log(
          `[ARGeoHost] skip (gate) — acurácia ±${pose.horizontalAccuracy.toFixed(0)}m > gate ${GEO_HOST_MAX_ACCURACY_M}m (pin segue cloud-only)`,
        );
        setState({ status: 'skipped', reason: 'gate', accuracyM: pose.horizontalAccuracy });
        return;
      }

      setState({ status: 'pending' });
      // altitudeMode REAL da impl 3.1.1: "street_level" | "rooftop_level"
      // (a doc "WGS84"/"Terrain" está desatualizada — lição 2026-11-16).
      // ⚠️ A altitude do parâmetro é WGS84 ABSOLUTO (exemplo oficial:
      // `pose.altitude + alturaAcimaDoChao`) — NUNCA passar 1.5 cruso como
      // altitude (bug latente: pin nasceria ~690m subterrâneo). Sem
      // confiança vertical (acc > 20m), pose.altitude segue sendo o melhor
      // estimador — o ajuste fino por ponto (altitudeOffsetM) corrige o
      // resíduo no editor.
      const altitudeMode = 'street_level';
      const altitude = Number.isFinite(pose.altitude)
        ? pose.altitude
        : PIN_HEIGHT_ABOVE_TERRAIN_M;
      console.log(
        `[ARGeoHost] host em voo — lat=${pose.latitude.toFixed(6)} lng=${pose.longitude.toFixed(6)} alt=${altitude.toFixed(1)}m mode=${altitudeMode} ±${pose.horizontalAccuracy.toFixed(1)}m`,
      );

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
      console.warn(`[ARGeoHost] failed — ${lastError}`);
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
