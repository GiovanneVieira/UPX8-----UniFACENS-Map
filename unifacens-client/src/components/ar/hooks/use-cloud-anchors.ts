import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateDistance, type Anchor } from 'shared';
import type { NativeAnchorEntry } from './use-native-anchors';
import type { GeospatialPose } from './use-geospatial-pose';

/**
 * ── Âncoras de Nuvem VISUAIS (Cloud Anchors) — precisão centimétrica ────────
 *
 * O Geospatial (GPS/VPS) não distingue ambientes internos: a pose indoor é
 * lixo e pins "nascem com relação ao celular". A âncora de nuvem visual
 * resolve pela CÂMERA contra um mapa do ambiente hospedado no servidor do
 * Google — o scan do SEU ambiente vira a cobertura VPS privada.
 *
 * Ciclo:
 * 1. CRIAÇÃO: startScan() → usuário escaneia ~20-30s ao redor do ponto →
 *    finishScan(ttl=1) → cloudAnchorId.
 * 2. AUTO-CALIBRAÇÃO: resolveCloudAnchor NA MESMA SESSÃO revela a origem do
 *    frame (centróide das posições da câmera, §doc ViroCloudAnchor) →
 *    frameOffset = pin − origem, rotacionado para o frame → PATCH no banco
 *    (colunas positionX/Y/Z renascidas com semântica estável).
 * 3. RETORNO: resolveNearby() resolve o ID → posição mundial do frame →
 *    pin = origem + R(yaw)·frameOffset → entra no pipeline como âncora
 *    nativa de PRIORIDADE MÁXIMA (geospatial vira fallback de longa
 *    distância).
 *
 * TTL: via API key = 24h (limite do ARCore). Para 365 dias: autorização
 * keyless (JWT assinado pelo backend) + renovação via Management API —
 * roadmap documentado no AGENTS.MD.
 */

/** Prefixos de IDs sintéticos que NÃO são cloud anchors reais. */
const SYNTHETIC_ID_PREFIXES = ['coord-', 'ua-'];
/** Distância máxima para tentar resolve visual (m) — SIFT precisa proximidade. */
const RESOLVE_RANGE_M = 40;
/** TTL do host em dias (API key = máx 1). */
const HOST_TTL_DAYS = 1;
/** Timeout JS por resolve — SIFT roda numa janela de ~30s. */
const RESOLVE_TIMEOUT_MS = 75_000;
/** Duração típica do scan guiado antes do finishScan (ms). */
export const SCAN_GUIDE_MS = 25_000;

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

/** Resultado do host (finishScan / hostCloudAnchor) do Viro. */
interface HostResultShape {
  success?: boolean;
  cloudAnchorId?: string;
  error?: string;
  state?: string;
}

/** Resultado do resolve (resolveCloudAnchor) do Viro. */
interface ResolveResultShape {
  success?: boolean;
  anchor?: CloudAnchorShape;
  error?: string;
  state?: string;
}

export function useCloudAnchors({
  serverAnchors,
  geoPoseRef,
  trackingState,
}: {
  serverAnchors: Anchor[] | undefined;
  geoPoseRef: React.MutableRefObject<GeospatialPose | null>;
  trackingState: number;
}) {
  /** Mapa pinId -> entrada resolvida (mesma forma da âncora nativa). */
  const [entries, setEntries] = useState<Map<string, NativeAnchorEntry>>(new Map());
  const entriesRef = useRef<Map<string, NativeAnchorEntry>>(new Map());
  const navigatorRef = useRef<any>(null);
  const aliveRef = useRef(true);
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

  // ── FASE 2/3: host com scan + auto-calibração ────────────────────────────
  /**
   * Conclui o scan iniciado por `beginScan`, hospeda a cloud anchor e
   * calibra o offset do pin no frame (resolve na MESMA sessão revela a
   * origem). Retorna os dados para PATCH ou null em falha (pin continua
   * pelo caminho geospatial).
   */
  const finishScanAndCalibrate = useCallback(
    async (
      pinId: string,
      pinLocalPos: [number, number, number],
      onHosted: (data: { cloudAnchorId: string; frameOffset: [number, number, number] }) => void,
    ): Promise<void> => {
      const nav = navigatorRef.current;
      if (!nav?.finishScan || !nav?.resolveCloudAnchor) {
        setHosting({ phase: 'failed', error: 'Cloud anchors não disponíveis nesta build' });
        return;
      }
      try {
        setHosting({ phase: 'hosting' });
        const hostResult = (await withTimeout(
          nav.finishScan(HOST_TTL_DAYS) as Promise<HostResultShape>,
          60_000,
          'finishScan',
        )) as HostResultShape;
        if (!hostResult?.success || !hostResult.cloudAnchorId) {
          throw new Error(hostResult?.error ?? `state=${hostResult?.state ?? '?'}`);
        }
        const cloudAnchorId = hostResult.cloudAnchorId;

        // Auto-calibração: resolve na MESMA sessão — o mapa está fresco, o
        // match é rápido — para descobrir a origem do frame em coordenadas
        // mundiais da sessão de criação.
        setHosting({ phase: 'calibrating' });
        const resolveResult = (await withTimeout(
          nav.resolveCloudAnchor(cloudAnchorId) as Promise<ResolveResultShape>,
          RESOLVE_TIMEOUT_MS,
          'resolveCloudAnchor(calibração)',
        )) as ResolveResultShape;
        const anchor = resolveResult?.anchor;
        if (!resolveResult?.success || !anchor?.position) {
          throw new Error(resolveResult?.error ?? 'calibração sem posição do frame');
        }
        const origin = anchor.position as [number, number, number];
        const yawDeg = anchor.rotation?.[1] ?? 0;
        // offset no frame = rotação INVERSA aplicada ao offset mundial
        const worldOffset: [number, number, number] = [
          pinLocalPos[0] - origin[0],
          pinLocalPos[1] - origin[1],
          pinLocalPos[2] - origin[2],
        ];
        const frameOffset = rotateY(worldOffset, -yawDeg);

        // Render imediato: pin já está na posição SLAM do tap — registra a
        // entrada para a projeção tratar como âncora de nuvem desde já.
        setEntry({ pinId, nativeAnchorId: cloudAnchorId, position: pinLocalPos });

        onHosted({ cloudAnchorId, frameOffset });
        setHosting({ phase: 'done', cloudAnchorId });
        console.log(
          `[ARCloud] "${pinId}" hospedada (${cloudAnchorId.slice(0, 12)}…) — offset do frame [${frameOffset.map((v) => v.toFixed(2)).join(', ')}]`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[ARCloud] hospedagem falhou: ${message}`);
        setHosting({ phase: 'failed', error: message });
      }
    },
    [setEntry],
  );

  /** Inicia o scan guiado (fase 1) — chamado ao criar o pin. */
  const beginScan = useCallback(() => {
    const nav = navigatorRef.current;
    if (!nav?.startScan) {
      setHosting({ phase: 'failed', error: 'startScan não disponível' });
      return false;
    }
    try {
      nav.startScan();
      setHosting({ phase: 'scanning', startedAt: Date.now() });
      return true;
    } catch (err) {
      console.warn('[ARCloud] startScan falhou:', err);
      setHosting({ phase: 'failed', error: String(err) });
      return false;
    }
  }, []);

  // ── FASE 4: resolve dos pins próximos (uma por vez) ──────────────────────
  useEffect(() => {
    if (!serverAnchors || trackingState !== 3 || resolvingRef.current) return;
    const nav = navigatorRef.current;
    if (!nav?.resolveCloudAnchor) return;

    const pose = geoPoseRef.current;
    if (!pose) return;

    // Candidatos: cloud anchor real + offset calibrado + perto + não tentado
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
        distM: calculateDistance(pose.latitude, pose.longitude, a.latitude as number, a.longitude as number),
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
          RESOLVE_TIMEOUT_MS,
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
          setEntry({ pinId: anchor.id, nativeAnchorId: anchor.cloudAnchorId, position: pinPos });
          console.log(`[ARCloud] "${anchor.name}" localizada visualmente — prioridade máxima`);
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
  }, [serverAnchors, trackingState, geoPoseRef, setEntry]);

  return {
    /** Mapa pinId -> entrada resolvida visualmente (prioridade máxima). */
    entries,
    /** Estado do fluxo de hospedagem (UI do modal de criação). */
    hosting,
    /** Um resolve visual está em andamento (UI "localizando…"). */
    resolving,
    handleNavigatorReady,
    beginScan,
    finishScanAndCalibrate,
    removeLocal,
  };
}
