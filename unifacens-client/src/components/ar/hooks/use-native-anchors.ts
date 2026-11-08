import { useCallback, useEffect, useRef, useState } from 'react';
import { type Anchor } from 'shared';

/** Entrada de âncora nativa — posição AR mantida pelo ARCore (Terra). */
export interface NativeAnchorEntry {
  /** ID do pin na nossa API. */
  pinId: string;
  /** ID da âncora nativa no ARCore (para remoção). */
  nativeAnchorId: string;
  /** Posição AR mundial — ARCore mantém cravada na Terra. */
  position: [number, number, number];
}

interface UseNativeAnchorsParams {
  /** Pins vindos do server (com lat/lng válidos). */
  serverAnchors: Anchor[] | undefined;
}

/** Máximo de âncoras nativas simultâneas. */
const MAX_NATIVE_ANCHORS = 30;
/** Criações por tick (não estourar o ARCore). */
const CREATIONS_PER_TICK = 3;
/** Período do processador da fila. */
const TICK_MS = 1500;
/**
 * Altura dos pins ACIMA DO TERRENO REAL (createTerrainAnchor resolve
 * contra dados de terreno do Google — SRTM —, não nosso datum fixo).
 * 1.5m = nível dos olhos.
 */
const PIN_HEIGHT_ABOVE_TERRAIN_M = 1.5;

/**
 * SISTEMA PRIMÁRIO de posicionamento AR (pós-WorldAnchor):
 *
 * Para cada pin do servidor com lat/lng válido, cria uma âncora NATIVA via
 * `createGeospatialAnchor(lat, lng, altitude)`. O ARCore mantém a âncora
 * cravada na Terra — a aplicação NUNCA corrige a posição. Quando o tracking
 * degrada e recupera, o ARCore reancora internamente sem mover o pin visível.
 *
 * Substitui ~1000 linhas de WorldAnchor/correções/estabilização.
 */
export function useNativeAnchors({ serverAnchors }: UseNativeAnchorsParams) {
  /** Mapa pinId -> entrada nativa (estado — dispara re-render da projeção). */
  const [entries, setEntries] = useState<Map<string, NativeAnchorEntry>>(new Map());
  const entriesRef = useRef<Map<string, NativeAnchorEntry>>(new Map());

  /** Navigator (chegado da cena via onNavigatorReady). */
  const navigatorRef = useRef<any>(null);
  /** Fila de pins que precisam de âncora nativa. */
  const pendingRef = useRef<Array<{ pinId: string; lat: number; lng: number; altAboveTerrain: number }>>([]);
  /** IDs já enviados (evita re-criar). */
  const createdRef = useRef<Set<string>>(new Set());
  /** Âncoras nativas criadas por nós (para cleanup). */
  const nativeIdsRef = useRef<Set<string>>(new Set());
  /** Geospatial habilitado (só cria quando ativo). */
  const geoEnabledRef = useRef(false);
  /** Guarda: hook vivo (SIGSEGV se chamarmos nativo após unmount). */
  const aliveRef = useRef(true);

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
    if (!serverAnchors) return;

    for (const anchor of serverAnchors) {
      if (createdRef.current.has(anchor.id)) continue;
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

      // createTerrainAnchor: altitude ACIMA DO TERRENO REAL (Google resolve
      // contra SRTM — muito mais preciso que datum fixo de 605m)
      pendingRef.current.push({
        pinId: anchor.id,
        lat: anchor.latitude,
        lng: anchor.longitude,
        altAboveTerrain: PIN_HEIGHT_ABOVE_TERRAIN_M,
      });
    }
  }, [serverAnchors]);

  /** Processador: cria âncoras nativas em lotes (quando geospatial ativo). */
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!aliveRef.current || !geoEnabledRef.current) return;
      if (!navigatorRef.current?.createTerrainAnchor) return;
      if (pendingRef.current.length === 0) return;

      const batch = pendingRef.current.splice(0, CREATIONS_PER_TICK);
      for (const req of batch) {
        createdRef.current.add(req.pinId);
        try {
          // Guarda anti-SIGSEGV: navigator pode ter sido destruído (troca de tab)
          if (!navigatorRef.current?.createTerrainAnchor) {
            console.warn(`[ARNative] navigator morto — abortando lote`);
            return;
          }
          const result = await navigatorRef.current.createTerrainAnchor(
            req.lat,
            req.lng,
            req.altAboveTerrain,
          );
          if (result?.success && result.anchor?.position) {
            const entry: NativeAnchorEntry = {
              pinId: req.pinId,
              nativeAnchorId: result.anchor.anchorId,
              position: result.anchor.position as [number, number, number],
            };
            entriesRef.current.set(req.pinId, entry);
            if (result.anchor.anchorId) {
              nativeIdsRef.current.add(result.anchor.anchorId);
            }
            setEntries(new Map(entriesRef.current));
          } else {
            console.warn(
              `[ARNative] falha ao criar âncora para ${req.pinId}:`,
              result?.error ?? 'sem detalhe',
            );
          }
        } catch (err) {
          console.warn(
            `[ARNative] erro ao criar âncora para ${req.pinId}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }, TICK_MS);

    return () => clearInterval(timer);
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
    setEntries(new Map(entriesRef.current));
  }, []);

  /** Adiciona um pin recém-criado (exibição imediata + cria âncora nativa). */
  const addLocal = useCallback((pinId: string, position: [number, number, number]) => {
    const entry: NativeAnchorEntry = { pinId, nativeAnchorId: '', position };
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
  };
}
