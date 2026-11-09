import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateDistance, type Anchor } from 'shared';
import type { NativeAnchorEntry } from './use-native-anchors';
import type { GeospatialPose } from './use-geospatial-pose';

/**
 * ── Âncoras de Nuvem VISUAIS (ARCore Cloud Anchors) — precisão centimétrica ──
 *
 * O Geospatial (GPS/VPS) não distingue ambientes internos: a pose indoor é
 * lixo e pins "nascem com relação ao celular". A âncora de nuvem visual
 * resolve pela CÂMERA contra um mapa visual hospedado no servidor do Google
 * — o entorno do SEU ponto vira a cobertura VPS privada.
 *
 * ⚠️ LIÇÃO (2026-11-09): startScan/finishScan são APIs do provider
 * REACTVISION (prefixo rv*, backend próprio) — com provider="arcore" elas
 * falham SEMPRE ("Ancoragem visual indisponível"). O caminho ARCore nativo é:
 *
 * 1. hit-test (retícula) → arScene.createAnchoredNode(hit) → âncora LOCAL
 *    na posição do tap (válida por 30s após o hit — criar logo).
 * 2. Usuário escaneia o entorno do ponto ~15s (features visuais p/ o mapa).
 * 3. navigator.hostCloudAnchor(anchorId, ttl=1) → cloudAnchorId no Google.
 * 4. Calibração: resolveCloudAnchor na MESMA sessão → posição mundial da
 *    âncora → frameOffset = pinPos − anchorPos (o pin pode ter sido ajustado
 *    ao longo do raio depois do hit) → PATCH no banco.
 * 5. RETORNO: resolveNearby (1 por vez, SIFT ~30s) → pin = anchorPos +
 *    R(yaw)·frameOffset → entrada de PRIORIDADE MÁXIMA na projeção.
 *
 * TTL: via API key = 24h (limite do ARCore). Para 365 dias: autorização
 * keyless (JWT por service account) OU renovação via Management API —
 * roadmap no AGENTS.MD.
 */

/**
 * Prefixos de IDs sintéticos que NÃO são cloud anchors reais.
 * ⚠️ O ARCore gera cloud anchor IDs começando com "ua-" (formato
 * ua-<hex-uuid>) — NÃO filtrar por "ua-" genérico! Os seeds de dev
 * seguem o padrão "ua-facens-demo-*".
 */
const SYNTHETIC_ID_PREFIXES = ['coord-', 'ua-facens-'];
/** Distância máxima para tentar resolve visual (m) — SIFT precisa proximidade. */
const RESOLVE_RANGE_M = 40;
/** TTL do host em dias (API key = máx 1). */
const HOST_TTL_DAYS = 1;
/** Timeout JS por host/resolve. */
const OP_TIMEOUT_MS = 75_000;
/** Janela de escaneio guiado antes de hospedar (ms). */
export const SCAN_GUIDE_MS = 15_000;

/** Um cloud anchor é real (hospedado no Google) e não sintético local? */
export function isRealCloudAnchorId(id: string | null | undefined): boolean {
  if (!id) return false;
  return !SYNTHETIC_ID_PREFIXES.some((p) => id.startsWith(p));
}

/** Rotaciona offset no plano XZ por yaw (graus). */
function rotateY(
  offset: [number, number, number],
  yawDeg: number,
): [number, number, number] {
  const rad = (yawDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    offset[0] * cos - offset[2] * sin,
    offset[1],
    offset[0] * sin + offset[2] * cos,
  ];
}

interface CloudAnchorShape {
  anchorId?: string;
  cloudAnchorId?: string;
  state?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

interface HostResultShape {
  success?: boolean;
  cloudAnchorId?: string;
  error?: string;
  state?: string;
}

interface ResolveResultShape {
  success?: boolean;
  anchor?: CloudAnchorShape;
  error?: string;
  state?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: sem resposta em ${ms}ms`)), ms),
    ),
  ]);
}

export type CloudHostingState =
  | { phase: 'idle' }
  | { phase: 'scanning'; startedAt: number }
  | { phase: 'hosting' }
  | { phase: 'calibrating' }
  | { phase: 'done'; cloudAnchorId: string }
  | { phase: 'failed'; error: string };

export function useCloudAnchors({
  serverAnchors,
  geoPoseRef,
  cameraPosRef,
  trackingState,
}: {
  serverAnchors: Anchor[] | undefined;
  geoPoseRef: React.MutableRefObject<GeospatialPose | null>;
  cameraPosRef: React.MutableRefObject<[number, number, number]>;
  trackingState: number;
}) {
  /** Mapa pinId -> entrada resolvida (mesma forma da âncora nativa). */
  const [entries, setEntries] = useState<Map<string, NativeAnchorEntry>>(new Map());
  const entriesRef = useRef<Map<string, NativeAnchorEntry>>(new Map());
  const navigatorRef = useRef<any>(null);
  const aliveRef = useRef(true);
  /** Âncora LOCAL criada do hit-test do modal (aguardando host pós-save). */
  const pendingLocalAnchorRef = useRef<string | null>(null);
  /** Resolve sequencial (SIFT = um por vez). */
  const resolvingRef = useRef(false);
  /** Pins já tentados nesta sessão (sucesso OU falha — sem retry automático). */
  const attemptedRef = useRef<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);
  const [hosting, setHosting] = useState<CloudHostingState>({ phase: 'idle' });

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      try {
        navigatorRef.current?.cancelCloudAnchorOperations?.();
      } catch {
        // best-effort
      }
    };
  }, []);

  const handleNavigatorReady = useCallback((nav: any) => {
    navigatorRef.current = nav;
  }, []);

  const setEntry = useCallback((entry: NativeAnchorEntry) => {
    entriesRef.current.set(entry.pinId, entry);
    setEntries(new Map(entriesRef.current));
  }, []);

  /** Remove entrada local (exclusão de pin). */
  const removeLocal = useCallback((pinId: string) => {
    entriesRef.current.delete(pinId);
    setEntries(new Map(entriesRef.current));
  }, []);

  // ── FASE 1: âncora local a partir do hit-test do modal ───────────────────
  /** Registra a âncora local criada pelo container (createAnchoredNode). */
  const setPendingLocalAnchor = useCallback((anchorId: string | null) => {
    pendingLocalAnchorRef.current = anchorId;
  }, []);

  /** Existe âncora local pronta para hospedar? */
  const hasPendingLocalAnchor = useCallback(
    () => pendingLocalAnchorRef.current !== null,
    [],
  );

  /** Inicia a janela de escaneio guiado (fase 2 — features visuais). */
  const beginScanGuide = useCallback(() => {
    setHosting({ phase: 'scanning', startedAt: Date.now() });
  }, []);

  // ── FASE 3: hospeda a âncora local + calibra o offset do pin ─────────────
  /**
   * Hospeda a âncora local (hostCloudAnchor — caminho ARCore nativo) e
   * calibra o offset do pin (resolve na MESMA sessão). Retorna os dados para
   * PATCH via callback, ou falha (pin segue pelo caminho geospatial).
   */
  const hostPendingAnchor = useCallback(
    async (
      pinId: string,
      pinLocalPos: [number, number, number],
      onHosted: (data: { cloudAnchorId: string; frameOffset: [number, number, number] }) => void,
    ): Promise<void> => {
      const nav = navigatorRef.current;
      const localAnchorId = pendingLocalAnchorRef.current;
      pendingLocalAnchorRef.current = null;
      if (!localAnchorId) {
        setHosting({ phase: 'failed', error: 'sem âncora local do hit-test' });
        return;
      }
      if (!nav?.hostCloudAnchor || !nav?.resolveCloudAnchor) {
        setHosting({ phase: 'failed', error: 'cloud anchors não disponíveis nesta build' });
        return;
      }
      try {
        setHosting({ phase: 'hosting' });
        const hostResult = (await withTimeout(
          nav.hostCloudAnchor(localAnchorId, HOST_TTL_DAYS) as Promise<HostResultShape>,
          OP_TIMEOUT_MS,
          'hostCloudAnchor',
        )) as HostResultShape;
        if (!hostResult?.success || !hostResult.cloudAnchorId) {
          throw new Error(
            `${hostResult?.error ?? hostResult?.state ?? 'sem detalhe'}`,
          );
        }
        const cloudAnchorId = hostResult.cloudAnchorId;

        // Calibração: resolve na MESMA sessão (mapa fresco → match rápido)
        // revela a posição mundial da âncora; o offset cobre o caso do pin
        // ter sido ajustado ao longo do raio DEPOIS do hit.
        setHosting({ phase: 'calibrating' });
        const resolveResult = (await withTimeout(
          nav.resolveCloudAnchor(cloudAnchorId) as Promise<ResolveResultShape>,
          OP_TIMEOUT_MS,
          'resolveCloudAnchor(calibração)',
        )) as ResolveResultShape;
        const anchor = resolveResult?.anchor;
        if (!resolveResult?.success || !anchor?.position) {
          // Host OK mas calibração falhou: offset [0,0,0] é a melhor aposta
          // (a âncora nasceu NA posição do hit).
          onHosted({ cloudAnchorId, frameOffset: [0, 0, 0] });
          setEntry({ pinId, nativeAnchorId: cloudAnchorId, position: pinLocalPos });
          setHosting({ phase: 'done', cloudAnchorId });
          console.warn(
            '[ARCloud] hospedada sem calibração (offset 0) — resolve falhou:',
            resolveResult?.error ?? resolveResult?.state,
          );
          return;
        }
        const anchorPos = anchor.position as [number, number, number];
        const yawDeg = anchor.rotation?.[1] ?? 0;
        const worldOffset: [number, number, number] = [
          pinLocalPos[0] - anchorPos[0],
          pinLocalPos[1] - anchorPos[1],
          pinLocalPos[2] - anchorPos[2],
        ];
        const frameOffset = rotateY(worldOffset, -yawDeg);

        setEntry({ pinId, nativeAnchorId: cloudAnchorId, position: pinLocalPos });
        onHosted({ cloudAnchorId, frameOffset });
        setHosting({ phase: 'done', cloudAnchorId });
        console.log(
          `[ARCloud] "${pinId}" hospedada (${cloudAnchorId.slice(0, 12)}…) — offset do frame [${frameOffset.map((v) => v.toFixed(2)).join(', ')}]`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[ARCloud] hospedagem falhou:', message);
        setHosting({ phase: 'failed', error: message });
      }
    },
    [setEntry],
  );

  // ── FASE 5: resolve dos pins próximos (uma por vez) ──────────────────────
  useEffect(() => {
    if (!serverAnchors || trackingState !== 3 || resolvingRef.current) return;
    const nav = navigatorRef.current;
    if (!nav?.resolveCloudAnchor) return;

    const pose = geoPoseRef.current;
    if (!pose) return;

    // Candidatos: cloud anchor real + perto + não resolvido/não tentado
    const candidates = serverAnchors
      .filter(
        (a) =>
          isRealCloudAnchorId(a.cloudAnchorId) &&
          Array.isArray(a.frameOffset) &&
          !entriesRef.current.has(a.id) &&
          !attemptedRef.current.has(a.id) &&
          typeof a.latitude === 'number' &&
          typeof a.longitude === 'number',
      )
      .map((a) => ({
        anchor: a,
        distM: calculateDistance(
          pose.latitude,
          pose.longitude,
          a.latitude as number,
          a.longitude as number,
        ),
      }))
      .filter((c) => c.distM <= RESOLVE_RANGE_M)
      .sort((x, y) => x.distM - y.distM);

    const next = candidates[0];
    if (!next) return;

    resolvingRef.current = true;
    setResolving(true);
    const { anchor } = next;
    attemptedRef.current.add(anchor.id);
    console.log(
      `[ARCloud] resolvendo "${anchor.name}" (${next.distM.toFixed(0)}m) — aponte a câmera ao redor…`,
    );

    (async () => {
      try {
        const result = (await withTimeout(
          nav.resolveCloudAnchor(anchor.cloudAnchorId) as Promise<ResolveResultShape>,
          OP_TIMEOUT_MS,
          `resolveCloudAnchor(${anchor.name})`,
        )) as ResolveResultShape;
        const resolved = result?.anchor;
        if (result?.success && resolved?.position) {
          const origin = resolved.position as [number, number, number];
          const yawDeg = resolved.rotation?.[1] ?? 0;
          const world = rotateY(anchor.frameOffset as [number, number, number], yawDeg);
          const pinPos: [number, number, number] = [
            origin[0] + world[0],
            origin[1] + world[1],
            origin[2] + world[2],
          ];

          // VALIDAÇÃO: coordenadas da sessão AR são metros (max ~±1000).
          // Valores na casa de milhões = ECEF ou outro datum global —
          // a âncora resolveu mas a posição é inútil (bug de device:
          // 1490169.8m de distância, 2026-11-09). Rejeita e segue GPS.
          const camPos = cameraPosRef.current;
          const distFromCam = Math.hypot(
            pinPos[0] - camPos[0],
            pinPos[1] - camPos[1],
            pinPos[2] - camPos[2],
          );
          if (distFromCam <= 1000 && Number.isFinite(distFromCam)) {
            setEntry({ pinId: anchor.id, nativeAnchorId: anchor.cloudAnchorId, position: pinPos });
            console.log(
              `[ARCloud] "${anchor.name}" localizada visualmente — ` +
              `origin=[${origin.map((v) => v.toFixed(2)).join(', ')}] ` +
              `yaw=${yawDeg.toFixed(1)}° distFromCam=${distFromCam.toFixed(1)}m`,
            );
          } else {
            console.warn(
              `[ARCloud] "${anchor.name}" posição absurda rejeitada: ` +
              `origin=[${origin.map((v) => v.toFixed(1)).join(', ')}] ` +
              `distFromCam=${(distFromCam / 1000).toFixed(1)}km — ` +
              `provável ECEF/coordenadas globais em vez de sessão AR. Segue GPS/fallback.`,
            );
          }
        } else {
          console.warn(
            `[ARCloud] "${anchor.name}" sem match visual (${result?.error ?? result?.state ?? 'sem detalhe'}) — segue geospatial/fallback`,
          );
        }
      } catch (err) {
        console.warn(`[ARCloud] resolve falhou: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        resolvingRef.current = false;
        setResolving(false);
      }
    })();
  }, [serverAnchors, trackingState, geoPoseRef, cameraPosRef, setEntry]);

  return {
    /** Mapa pinId -> entrada resolvida visualmente (prioridade máxima). */
    entries,
    /** Estado do fluxo de hospedagem (UI do modal de criação). */
    hosting,
    /** Um resolve visual está em andamento (UI "localizando…"). */
    resolving,
    handleNavigatorReady,
    setPendingLocalAnchor,
    hasPendingLocalAnchor,
    beginScanGuide,
    hostPendingAnchor,
    removeLocal,
  };
}
