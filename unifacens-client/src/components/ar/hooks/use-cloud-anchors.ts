import { useCallback, useEffect, useRef, useState } from 'react';
import { type Anchor } from 'shared';
import type { NativeAnchorEntry } from './use-native-anchors';

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
export function rotateY(
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

interface HostResultShape {
  success?: boolean;
  cloudAnchorId?: string;
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
  serverAnchors: _serverAnchors,
  trackingState: _trackingState,
}: {
  serverAnchors: Anchor[] | undefined;
  trackingState: number;
}) {
  /** Mapa pinId -> entrada resolvida (mesma forma da âncora nativa). */
  const [entries, setEntries] = useState<Map<string, NativeAnchorEntry>>(new Map());
  const entriesRef = useRef<Map<string, NativeAnchorEntry>>(new Map());
  const navigatorRef = useRef<any>(null);
  const aliveRef = useRef(true);
  /** Âncora LOCAL criada do hit-test do modal (aguardando host pós-save). */
  const pendingLocalAnchorRef = useRef<string | null>(null);
  /** Posição onde o hit-test acertou (posição da âncora local). */
  const pendingHitPosRef = useRef<[number, number, number] | null>(null);
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
  const setPendingLocalAnchor = useCallback((anchorId: string | null, hitPos?: [number, number, number]) => {
    pendingLocalAnchorRef.current = anchorId;
    pendingHitPosRef.current = hitPos ?? null;
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
      const anchorLocalPos = pendingHitPosRef.current;
      pendingLocalAnchorRef.current = null;
      pendingHitPosRef.current = null;
      if (!localAnchorId) {
        setHosting({ phase: 'failed', error: 'sem âncora local do hit-test' });
        return;
      }
      if (!anchorLocalPos) {
        setHosting({ phase: 'failed', error: 'sem posição do hit para calibrar offset' });
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

        setHosting({ phase: 'calibrating' });

        // ── CALIBRAÇÃO CORRETA (sem resolveCloudAnchor = ECEF!) ────────
        // A âncora local foi criada NO HIT POSITION (createAnchoredNode).
        // O frameOffset é simplesmente a diferença entre onde o pin está
        // (após ajustes de distância) e onde o hit aconteceu:
        //   frameOffset = pinPos − anchorHitPos (ambos em SLAM da sessão)
        // NÃO usar resolveCloudAnchor para calibrar — retorna ECEF (~6M m).
        //
        // O componente ViroARCloudAnchor (na cena) resolverá o frame
        // corretamente em coordenadas de sessão; o offset que gravamos
        // aqui é o deslocamento físico do pin em relação à âncora.
        const frameOffset: [number, number, number] = [
          pinLocalPos[0] - anchorLocalPos[0],
          pinLocalPos[1] - anchorLocalPos[1],
          pinLocalPos[2] - anchorLocalPos[2],
        ];

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

  // ── FASE 5: RESOLVE agora acontece via componente <ViroARCloudAnchor> ──
  // na CENA (ver ViroARAnchorScene.tsx) — o componente entrega posições em
  // COORDENADAS DA SESSÃO AR via onLocalized (o método imperativo
  // resolveCloudAnchor retornava ECEF ~1.490km errado). O container
  // alimenta as entries via setEntry no handler onCloudAnchorLocalized.

  return {
    /** Mapa pinId -> entrada resolvida visualmente (prioridade máxima). */
    entries,
    /** Estado do fluxo de hospedagem (UI do modal de criação). */
    hosting,
    handleNavigatorReady,
    setPendingLocalAnchor,
    hasPendingLocalAnchor,
    beginScanGuide,
    hostPendingAnchor,
    removeLocal,
    /** Registra uma entrada resolvida (alimentado pelo ViroARCloudAnchor component). */
    setEntry,
  };
}
