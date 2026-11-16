import { useCallback, useEffect, useRef, useState } from 'react';
import { geodeticToENU, type Anchor } from 'shared';
import type { GeospatialPose } from './use-geospatial-pose';

/** Fonte da entrada nativa — determina honestidade visual do pin. */
export type NativeAnchorSource = 'cloud' | 'geospatial' | 'slam';

/** Entrada de âncora nativa — posição AR mantida pelo ARCore (Terra). */
export interface NativeAnchorEntry {
  /** ID do pin na nossa API. */
  pinId: string;
  /** ID da âncora nativa no ARCore (para remoção; '' = SLAM local). */
  nativeAnchorId: string;
  /** Posição AR mundial — ARCore mantém cravada na Terra. */
  position: [number, number, number];
  /**
   * Origem da âncora: 'cloud' = visual (cm, resolve SIFT); 'geospatial' =
   * hospedada/criada por coordenadas (m — selo honesto "±Xm"); 'slam' =
   * provisória do tap na sessão.
   */
  source?: NativeAnchorSource;
  /** Acurácia horizontal (m) quando conhecida (hosting geoespacial). */
  accuracyM?: number;
}

/** Requisição de âncora nativa na fila. */
interface PendingRequest {
  pinId: string;
  lat: number;
  lng: number;
  mode: 'terrain' | 'geospatial';
  /** altAboveTerrain (terrain) ou altitude absoluta WGS84 (geospatial). */
  value: number;
  /**
   * UUID da âncora geoespacial HOSPEDADA na plataforma RV: quando presente,
   * o processador resolve por UUID (resolveGeospatialAnchor — posição
   * server-backed) em vez de criar por lat/lng local. Falha esgotada →
   * re-enfileira SEM o UUID (caminho local clássico).
   */
  hostedGeospatialId?: string;
}

interface UseNativeAnchorsParams {
  /** Pins vindos do server (com lat/lng válidos). */
  serverAnchors: Anchor[] | undefined;
  /**
   * Prontidão do EARTH tracking do SDK (Frente A, 2026-11-16): o container
   * passa `getEarthTrackingState() === 'Enabled'` — a máquina de estados
   * OFICIAL (VPS_LITE.md), com threshold interno de ~15m de acurácia.
   * Substitui o gate caseiro ≤20m da era arcore, que congelava a fila
   * sempre que o GPS ficava ruim (enquanto a cloud visual seguia rodando).
   * `Localizing` = fila espera (normal, segundos a ~1min frio).
   */
  poseReady: boolean;
  /**
   * Tab focada? false NO INSTANTE do blur — congela a criação de âncoras
   * nativas (createGeospatialAnchor/createTerrainAnchor também são UIBlocks
   * interop; chamadas na janela do keep-alive de unmount cravam NPE/SIGSEGV
   * em view destruída — lição de device 2026-11-10, §12.12).
   */
  focused: boolean;
  /**
   * Tracking ≥ 2 (sessão viva)? Gates de chamada nativa — ===3 matava o
   * fluxo indoor (tracking LIMITED permanente após remounts; lição
   * 14:56-14:57, §12.12).
   */
  trackingHealthy: boolean;
  /**
   * Pose geospatial atual (ref, lida no tick) — alimenta o gate de raio:
   * resolve hospedado só para pins dentro de RESOLVE_RADIUS_M.
   */
  geoPoseRef: React.MutableRefObject<GeospatialPose | null>;
  /**
   * Fila de âncoras nativas geospatial (resolve hospedada por UUID +
   * criação local por lat/lng). Valores 1000m→1000km no guard de datum à
   * parte, as posições chegam no FRAME DA SESSÃO (eixos rotacionados pelo
   * yaw do launch — lição de device 2026-11-16 noite: um pin a 74km
   * LEGITIMAMENTE resolve a dezenas de km). O SDK ancora na Terra
   * (doc: "creates a local AR anchor at that location") — a posição não
   * depende de onde o usuário está; é a fonte autoritativa de render,
   * acima da estimativa ENU e abaixo da cloud visual (cm).
   */
  enabled: boolean;
}

/** Máximo de âncoras nativas simultâneas. */
const MAX_NATIVE_ANCHORS = 30;
/**
 * Gate de raio para resolve hospedado (lição 2026-11-16): pins além disto
 * (ex.: campus a 74km vistos de casa) renderizam subpixel — o GET à
 * plataforma + a op na fila one-op-por-vez são fúteis. 5km cobre qualquer
 * POI navegável na sessão. Re-avaliado a cada tick (a pose muda).
 */
const RESOLVE_RADIUS_M = 5_000;
/** Criações por tick (não estourar o ARCore). */
const CREATIONS_PER_TICK = 3;
/** Período do processador da fila. */
const TICK_MS = 1500;
/**
 * Altura dos pins ACIMA DO TERRENO REAL quando o pin NÃO tem altitude
 * registrada (createTerrainAnchor resolve contra terreno do Google/SRTM).
 */
const PIN_HEIGHT_ABOVE_TERRAIN_M = 1.5;
/** Timeout JS por criação — resolveAnchorOnTerrainAsync pode pendurar sem VPS. */
const ANCHOR_TIMEOUT_MS = 60_000;
/** Retries por pin após a primeira falha (1ª + 2 retries = 3 tentativas). */
const MAX_RETRIES = 2;
/**
 * Erros FATAIS: retry não vai mudar o resultado — pula direto ao esgotado
 * (cada retry seria mais um request fútil à ARCore API).
 */
const FATAL_ERROR_PATTERNS = [
  'NOT_SUPPORTED',
  'RESOURCE_EXHAUSTED',
  'API_KEY',
  'API KEY',
  'UNAUTHORIZED',
  'ACCESS_DENIED',
];

/**
 * SISTEMA PRIMÁRIO de posicionamento AR (pós-WorldAnchor):
 *
 * Para cada pin do servidor com lat/lng válido, cria uma âncora NATIVA:
 * - `altitude` registrada → `createGeospatialAnchor(lat, lng, alt)` —
 *   altitude ABSOLUTA no elipsoide WGS84 (= altura de criação, Q4=B).
 * - sem altitude → `createTerrainAnchor(lat, lng, 1.5)` — 1.5m acima do
 *   terreno real do Google (SRTM).
 *
 * O ARCore mantém a âncora cravada na Terra — a aplicação NUNCA corrige a
 * posição. Falhas/pendências têm retry + timeout; esgotadas as tentativas,
 * o pin permanece no fallback de projeção (estimativa visível).
 */
export function useNativeAnchors({ serverAnchors, poseReady, focused, trackingHealthy, enabled, geoPoseRef }: UseNativeAnchorsParams) {
  /** Mapa pinId -> entrada nativa (estado — dispara re-render da projeção). */
  const [entries, setEntries] = useState<Map<string, NativeAnchorEntry>>(new Map());
  const entriesRef = useRef<Map<string, NativeAnchorEntry>>(new Map());

  /** Tab focada (lida pelo interval sem recriá-lo). */
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  /** Tracking estável — sinal mais cedo do detach da view (§12.12). */
  const trackingHealthyRef = useRef(trackingHealthy);
  trackingHealthyRef.current = trackingHealthy;

  /** Navigator (chegado da cena via onNavigatorReady). */
  const navigatorRef = useRef<any>(null);
  /** Fila de pins que precisam de âncora nativa. */
  const pendingRef = useRef<PendingRequest[]>([]);
  /** IDs finalizados (sucesso OU retries esgotados — nunca re-processar sozinho). */
  const createdRef = useRef<Set<string>>(new Set());
  /** Criações em voo (evita enfileirar duplicado durante o await). */
  const inFlightRef = useRef<Set<string>>(new Set());
  /** Contador de retries por pin. */
  const retriesRef = useRef<Map<string, number>>(new Map());
  /** Pins que esgotaram retries (elegíveis ao retryFailed explícito). */
  const failedRef = useRef<Set<string>>(new Set());
  /** Pins pulados pelo gate de raio (log 1×; re-avaliáveis via retryFailed). */
  const radiusSkippedRef = useRef<Set<string>>(new Set());
  /** Último serverAnchors (para o retryFailed re-enfileirar). */
  const serverAnchorsRef = useRef<Anchor[] | undefined>(serverAnchors);
  /** Âncoras nativas criadas por nós (para cleanup). */
  const nativeIdsRef = useRef<Set<string>>(new Set());
  /** Geospatial habilitado (só cria quando ativo). */
  const geoEnabledRef = useRef(false);
  /** Fila habilitada (provider arcore — ver doc do param `enabled`). */
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  /** Guarda: hook vivo (SIGSEGV se chamarmos nativo após unmount). */
  const aliveRef = useRef(true);
  /** Guarda anti-sobreposição de lotes (awaits de até 60s no interval). */
  const processingRef = useRef(false);

  /** Cleanup no unmount: marca morto + remove âncoras + desarma interval. */
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      geoEnabledRef.current = false;
      const nav = navigatorRef.current;
      if (nav?.removeGeospatialAnchor) {
        for (const id of nativeIdsRef.current) {
          try {
            nav.removeGeospatialAnchor(id);
          } catch {
            // cleanup best-effort
          }
        }
      }
    };
  }, []);

  const handleNavigatorReady = useCallback((nav: any) => {
    navigatorRef.current = nav;
  }, []);

  const handleGeospatialStatus = useCallback((supported: boolean) => {
    geoEnabledRef.current = supported;
  }, []);

  /** Detecta pins novos → enfileira para criação de âncora nativa. */
  useEffect(() => {
    serverAnchorsRef.current = serverAnchors;
    if (!serverAnchors || !enabled) return;

    for (const anchor of serverAnchors) {
      if (createdRef.current.has(anchor.id) || inFlightRef.current.has(anchor.id)) continue;
      if (
        typeof anchor.latitude !== 'number' ||
        !Number.isFinite(anchor.latitude) ||
        typeof anchor.longitude !== 'number' ||
        !Number.isFinite(anchor.longitude)
      ) {
        continue;
      }
      // Já na fila?
      if (pendingRef.current.some((p) => p.pinId === anchor.id)) continue;
      // Respeita o limite
      if (createdRef.current.size >= MAX_NATIVE_ANCHORS) break;

      pendingRef.current.push(buildRequest(anchor));
    }
  }, [serverAnchors]);

  /**
   * Roteamento por dado: UUID geoespacial hospedado → resolve por UUID
   * (posição server-backed); senão altitude registrada = altura absoluta
   * (createGeospatialAnchor); sem altitude = terreno + 1.5m.
   */
  function buildRequest(anchor: Anchor, withHosted = true): PendingRequest {
    const hasAltitude =
      typeof anchor.altitude === 'number' && Number.isFinite(anchor.altitude);
    return {
      pinId: anchor.id,
      lat: anchor.latitude as number,
      lng: anchor.longitude as number,
      mode: hasAltitude ? 'geospatial' : 'terrain',
      value: hasAltitude ? (anchor.altitude as number) : PIN_HEIGHT_ABOVE_TERRAIN_M,
      hostedGeospatialId:
        withHosted && anchor.geospatialAnchorId ? anchor.geospatialAnchorId : undefined,
    };
  }

/** Resultado das APIs createGeospatialAnchor/createTerrainAnchor do Viro. */
interface GeospatialAnchorResult {
  success?: boolean;
  error?: string;
  anchor?: {
    anchorId?: string;
    position?: [number, number, number];
  };
}

/** Promise com timeout — resolveAnchorOnTerrain/Geospatial pode pendurar. */
const withTimeout = async <T,>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> => {
  return await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: sem resposta nativa em ${ms}ms`)), ms),
    ),
  ]);
};

/**
 * Resolve a âncora geoespacial HOSPEDADA (UUID RV) — DEFENSIVO (lição de
 * device 2026-11-16): a DOC promete `anchor.position` (coords de mundo), mas
 * o docstring da impl 3.1.1 retorna `{anchorId, latitude, longitude,
 * altitude}` SEM position. Shape A usa a position direta; shape B faz
 * two-step com a coordenada AUTORITATIVA da plataforma + criação local
 * (createGeospatial/createTerrain com o roteamento de altitude do banco).
 */
async function resolveHostedAnchor(
  nav: any,
  req: PendingRequest,
): Promise<{ anchorId: string; position: [number, number, number]; shape: 'A' | 'B' }> {
  const result = (await withTimeout(
    nav.resolveGeospatialAnchor(req.hostedGeospatialId as string),
    ANCHOR_TIMEOUT_MS,
    `resolveGeospatial(${req.pinId})`,
  )) as {
    success?: boolean;
    error?: string;
    anchor?: {
      anchorId?: string;
      position?: [number, number, number];
      latitude?: number;
      longitude?: number;
    };
  };
  if (!result?.success || !result.anchor) {
    throw new Error(result?.error ?? 'resolve hospedado falhou (sem detalhe)');
  }
  // Shape A: position de mundo direto (contrato documentado).
  if (result.anchor.position) {
    return {
      anchorId: result.anchor.anchorId ?? (req.hostedGeospatialId as string),
      position: result.anchor.position,
      shape: 'A',
    };
  }
  // Shape B (docstring 3.1.1): só coordenadas — cria a âncora local com elas.
  const { latitude, longitude } = result.anchor;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('resolve hospedado sem position nem lat/lng (shape desconhecido)');
  }
  const local = (await withTimeout(
    req.mode === 'geospatial'
      ? nav.createGeospatialAnchor(latitude, longitude, req.value)
      : nav.createTerrainAnchor(latitude, longitude, req.value),
    ANCHOR_TIMEOUT_MS,
    `createAnchorTwoStep(${req.pinId})`,
  )) as GeospatialAnchorResult;
  if (!local?.success || !local.anchor?.position) {
    throw new Error(local?.error ?? 'two-step falhou (sem detalhe)');
  }
  return {
    anchorId: local.anchor.anchorId ?? '',
    position: local.anchor.position as [number, number, number],
    shape: 'B',
  };
}

  /** Último valor de poseReady (lido pelo interval sem recriá-lo). */
  const poseReadyRef = useRef(poseReady);
  poseReadyRef.current = poseReady;

  /** Processador: cria âncoras nativas em lotes (quando geospatial ativo). */
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!aliveRef.current || !geoEnabledRef.current) return;
      // Fila desligada (provider reactvision — posições em frame de terra,
      // lição 2026-11-16): nada a processar.
      if (!enabledRef.current) return;
      // Blur da tab OU tracking degradado (sinal do detach): NÃO criar
      // âncoras nativas — createGeospatialAnchor/createTerrainAnchor são
      // UIBlocks interop e a view está a caminho da destruição (§12.12).
      if (!focusedRef.current || !trackingHealthyRef.current) return;
      // Gate de pose: sem pose razoável, criar âncora nativa é request fútil.
      if (!poseReadyRef.current) return;
      const nav = navigatorRef.current;
      if (!nav?.createTerrainAnchor || !nav?.createGeospatialAnchor) return;
      if (pendingRef.current.length === 0 || processingRef.current) return;

      processingRef.current = true;
      const batch = pendingRef.current.splice(0, CREATIONS_PER_TICK);
      try {
        for (const req of batch) {
          if (!aliveRef.current) return;
          // Guarda anti-SIGSEGV: navigator pode ter sido destruído (troca de tab)
          if (!navigatorRef.current?.createTerrainAnchor) {
            console.warn('[ARNative] navigator morto — abortando lote');
            return;
          }
          /**
           * GATE DE RAIO (lição 2026-11-16): pin além de RESOLVE_RADIUS_M
           * não vira op nativa — GET fútil à plataforma + fila one-op-por-vez
           * ocupada (campus a 74km vistos de casa). Sem pose ainda: espera
           * (a distância é re-avaliada no próximo tick).
           */
          const pose = geoPoseRef.current;
          if (pose) {
            const { east, north } = geodeticToENU(
              pose.latitude,
              pose.longitude,
              0,
              req.lat,
              req.lng,
              0,
            );
            const distM = Math.hypot(east, north);
            if (distM > RESOLVE_RADIUS_M) {
              if (!radiusSkippedRef.current.has(req.pinId)) {
                radiusSkippedRef.current.add(req.pinId);
                console.log(
                  `[ARNative] ${req.pinId} fora do raio de resolve (${(distM / 1000).toFixed(1)}km > ${(RESOLVE_RADIUS_M / 1000).toFixed(0)}km) — sem op nativa (subpixel)`,
                );
              }
              // Consome a requisição sem criar: o render fica com a projeção
              // ENU (estimativa honesta ±Xm); re-enfileirado só via retryFailed.
              createdRef.current.add(req.pinId);
              continue;
            }
          }
          inFlightRef.current.add(req.pinId);
          try {
            /**
             * Dupla ancoragem (F2): UUID hospedado no RV → resolve por UUID
             * (posição server-backed, entre sessões e usuários; DEFENSIVO
             * shape A/B — lição 2026-11-16); senão o caminho local clássico
             * por lat/lng do banco.
             */
            const hostedId = req.hostedGeospatialId;
            const useHostedResolve =
              !!hostedId &&
              typeof navigatorRef.current.resolveGeospatialAnchor === 'function';
            let nativeAnchorId = '';
            let resolvedPosition: [number, number, number] | null = null;
            let resolvedShape: 'A' | 'B' | null = null;

            if (useHostedResolve) {
              const resolved = await resolveHostedAnchor(navigatorRef.current, req);
              nativeAnchorId = resolved.anchorId;
              resolvedPosition = resolved.position;
              resolvedShape = resolved.shape;
            } else {
              const result = (await withTimeout(
                req.mode === 'geospatial'
                  ? navigatorRef.current.createGeospatialAnchor(req.lat, req.lng, req.value)
                  : navigatorRef.current.createTerrainAnchor(req.lat, req.lng, req.value),
                ANCHOR_TIMEOUT_MS,
                `createAnchor(${req.pinId})`,
              )) as GeospatialAnchorResult;
              if (result?.success && result.anchor?.position) {
                nativeAnchorId = result.anchor.anchorId ?? '';
                resolvedPosition = result.anchor.position as [number, number, number];
              } else {
                throw new Error(result?.error ?? 'falha sem detalhe');
              }
            }

            entriesRef.current.set(req.pinId, {
              pinId: req.pinId,
              nativeAnchorId,
              position: resolvedPosition,
              source: 'geospatial',
            });
            if (nativeAnchorId) {
              nativeIdsRef.current.add(nativeAnchorId);
            }
            // Marca criado SÓ APÓS o sucesso (falha → retry).
            createdRef.current.add(req.pinId);
            failedRef.current.delete(req.pinId);
            retriesRef.current.delete(req.pinId);
            setEntries(new Map(entriesRef.current));
            if (useHostedResolve) {
              console.log(
                `[ARNative] ${req.pinId} âncora geoespacial HOSPEDADA resolvida (shape ${resolvedShape}) — server-backed`,
              );
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const isFatal = FATAL_ERROR_PATTERNS.some((p) => message.toUpperCase().includes(p));
            const retries = (retriesRef.current.get(req.pinId) ?? 0) + 1;
            retriesRef.current.set(req.pinId, retries);
            /**
             * UUID hospedado esgotado → UMA degradação para o caminho local
             * (createGeospatial/createTerrain por lat/lng do banco): a âncora
             * existe na plataforma mas este device não a resolveu agora.
             */
            const degradeToLocal =
              req.hostedGeospatialId !== undefined && retries > MAX_RETRIES && !isFatal;
            if (!isFatal && retries <= MAX_RETRIES) {
              console.warn(
                `[ARNative] ${req.pinId} falhou (tentativa ${retries}/${MAX_RETRIES + 1}): ${message} — re-enfileirando`,
              );
              pendingRef.current.push(req);
            } else if (degradeToLocal) {
              console.warn(
                `[ARNative] ${req.pinId} resolve hospedado esgotado (${message}) — degradando p/ criação local por lat/lng`,
              );
              retriesRef.current.delete(req.pinId);
              pendingRef.current.push({ ...req, hostedGeospatialId: undefined });
            } else {
              console.warn(
                `[ARNative] ${req.pinId} ${isFatal ? 'erro fatal' : `esgotou ${MAX_RETRIES + 1} tentativas`} (${message}) — permanece no fallback de projeção`,
              );
              // Para de tentar sozinho; elegível ao retryFailed().
              createdRef.current.add(req.pinId);
              failedRef.current.add(req.pinId);
            }
          } finally {
            inFlightRef.current.delete(req.pinId);
          }
        }
      } finally {
        processingRef.current = false;
      }
    }, TICK_MS);

    return () => clearInterval(timer);
  }, []);

  /**
   * Zera TODO o estado de âncoras nativas (reset de sessão AR — Frente B,
   * 2026-11-11: background ≥10s → remount do navigator → as âncoras nativas
   *  da view antiga morrem com ela; este limpa a memoria do hook para o
   * mundo novo recomeçar do zero).
   */
  const resetAll = useCallback(() => {
    entriesRef.current.clear();
    pendingRef.current = [];
    createdRef.current.clear();
    inFlightRef.current.clear();
    retriesRef.current.clear();
    failedRef.current.clear();
    radiusSkippedRef.current.clear();
    nativeIdsRef.current.clear();
    setEntries(new Map());
  }, []);

  /** Re-enfileira pins que esgotaram retries (refresh manual explícito). */
  const retryFailed = useCallback(() => {    if (failedRef.current.size === 0 || !enabledRef.current) return;
    const anchors = serverAnchorsRef.current;
    if (!anchors) return;
    const ids = [...failedRef.current];
    let requeued = 0;
    for (const id of ids) {
      const anchor = anchors.find((a) => a.id === id);
      if (
        !anchor ||
        typeof anchor.latitude !== 'number' ||
        !Number.isFinite(anchor.latitude) ||
        typeof anchor.longitude !== 'number' ||
        !Number.isFinite(anchor.longitude)
      ) {
        continue;
      }
      pendingRef.current.push(buildRequest(anchor));
      createdRef.current.delete(id);
      failedRef.current.delete(id);
      retriesRef.current.delete(id);
      radiusSkippedRef.current.delete(id);
      requeued++;
    }
    if (requeued > 0) {
      console.log(`[ARNative] retryFailed: ${requeued} pin(s) re-enfileirado(s)`);
    }
  }, []);

  /** Remove um pin localmente (exclusão) e limpa a âncora nativa. */
  const removeLocal = useCallback((pinId: string) => {
    const entry = entriesRef.current.get(pinId);
    if (entry?.nativeAnchorId && navigatorRef.current?.removeGeospatialAnchor) {
      try {
        navigatorRef.current.removeGeospatialAnchor(entry.nativeAnchorId);
        nativeIdsRef.current.delete(entry.nativeAnchorId);
      } catch {
        // best-effort
      }
    }
    entriesRef.current.delete(pinId);
    createdRef.current.delete(pinId);
    failedRef.current.delete(pinId);
    retriesRef.current.delete(pinId);
    setEntries(new Map(entriesRef.current));
  }, []);

  /** Adiciona um pin recém-criado (exibição imediata + cria âncora nativa). */
  const addLocal = useCallback((pinId: string, position: [number, number, number]) => {
    const entry: NativeAnchorEntry = {
      pinId,
      nativeAnchorId: '',
      position,
      source: 'slam',
    };
    entriesRef.current.set(pinId, entry);
    setEntries(new Map(entriesRef.current));
    // A âncora nativa será criada no próximo tick quando o serverAnchor chegar
  }, []);

  return {
    /** Mapa pinId -> entrada nativa (posição AR mantida pelo ARCore). */
    entries,
    /** Callback para a cena passar o navigator. */
    handleNavigatorReady,
    /** Callback do status do geospatial. */
    handleGeospatialStatus,
    /** Remove pin localmente + âncora nativa. */
    removeLocal,
    /** Adiciona pin localmente (posição SLAM até a âncora nativa resolver). */
    addLocal,
    /** Re-enfileira pins falhos (refresh manual). */
    retryFailed,
    /** Zera todo o estado (reset de sessão AR pós-background longo). */
    resetAll,
  };
}
