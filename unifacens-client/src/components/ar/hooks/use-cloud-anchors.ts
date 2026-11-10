import { useCallback, useEffect, useRef, useState } from 'react';
import { parseLocationTransform } from '@reactvision/react-viro';
import { type Anchor } from 'shared';
import type { NativeAnchorEntry } from './use-native-anchors';

/**
 * ── RESOLVE pelo pipeline oficial (lição de auditoria 2026-11-10) ─────────
 *
 * O hosting migrou para use-anchor-scan (startScan/finishScan com coverage
 * gate). Este hook cuida do RETORNO:
 * - resolveCloudAnchor + poll getCloudAnchorStatus() @1Hz (progress/message
 *   para o HUD — a promise é silenciosa por design da doc VPS);
 * - re-tentativa com backoff (a doc manda guiar o usuário: "keep standing
 *   still" / "move closer" — um único tiro por sessão perde resolves);
 * - rvTrackCloudAnchorResolution() após cada tentativa (best practice da doc:
 *   "report every resolve");
 * - pins cloud NÃO localizados ficam no estado honesto "pendingCount" —
 *   JAMAIS caem no fallback GPS (lição E5: o pin "pulando" entre cravado e
 *   GPS destrói a confiança).
 */

/**
 * Prefixos de IDs sintéticos que NÃO são cloud anchors reais.
 * ⚠️ O ARCore gera cloud anchor IDs começando com "ua-" — NÃO filtrar por
 * "ua-" genérico! Seeds de dev seguem "ua-facens-demo-*".
 */
const SYNTHETIC_ID_PREFIXES = ['coord-', 'ua-facens-'];
/** Timeout JS por tentativa de resolve (SDK dá timeout interno ~30s). */
const OP_TIMEOUT_MS = 45_000;
/**
 * Backoff de re-tentativa por pin (ms) — SEMPRE acima da vida nativa do
 * resolve (~30s): backoffs curtos disparavam "A resolve for this anchor is
 * already in progress (2ms!)" em cima do resolve anterior ainda vivo
 * (lição de device 2026-11-10 noite, logs 18:46-18:47).
 */
const RETRY_BACKOFF_MS = [60_000, 90_000, 120_000];
/** "already in progress": re-checar após este intervalo (sem penalizar). */
const IN_PROGRESS_RECHECK_MS = 12_000;
/** Progresso HUD durante o resolve (doc: active/progress/message). */
export interface ResolveHudStatus {
  active: boolean;
  progress: number;
  message: string;
  /** Início da tentativa (Date.now()) — HUD escala a dica após 25s. */
  startedAt: number;
}

/** Um cloud anchor é real (hospedado no provider) e não sintético local? */
export function isRealCloudAnchorId(id: string | null | undefined): boolean {
  if (!id) return false;
  return !SYNTHETIC_ID_PREFIXES.some((p) => id.startsWith(p));
}

/** Shape do resultado oficial do sceneNavigator.resolveCloudAnchor (3.1.x). */
interface ResolveResultShape {
  success?: boolean;
  anchor?: {
    anchorId?: string;
    cloudAnchorId?: string;
    position?: [number, number, number];
    rotation?: [number, number, number];
    state?: string;
  };
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

export function useCloudAnchors({
  serverAnchors,
  trackingState,
  focused = true,
}: {
  serverAnchors: Anchor[] | undefined;
  trackingState: number;
  /** Tab focada? false no blur — congela resolves nativos (§12.12). */
  focused?: boolean;
}) {
  /** Mapa pinId -> entrada resolvida (posição de sessão — prioridade máx). */
  const [entries, setEntries] = useState<Map<string, NativeAnchorEntry>>(new Map());
  const entriesRef = useRef<Map<string, NativeAnchorEntry>>(new Map());
  const navigatorRef = useRef<any>(null);
  const aliveRef = useRef(true);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  /** HUD: progresso do resolve em curso. */
  const [resolveHud, setResolveHud] = useState<ResolveHudStatus | null>(null);
  /** Pins cloud ainda não localizados (estado honesto p/ HUD/projeção). */
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

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

  /**
   * Pins com entry PROVISÓRIA (posição do locationTransform do finishScan —
   * o pin aparece NA HORA para quem escaneou, padrão do exemplo oficial
   * vps-lite-test: "its own locationTransform as a stand-in for a resolved
   * anchor's transform"). O loop de resolve continua tentando: quando o
   * resolve confirma, a entry é substituída pela posição definitiva (a
   * transição suave da projeção interpola — sem pulo).
   */
  const provisionalRef = useRef<Set<string>>(new Set());

  const setEntry = useCallback((entry: NativeAnchorEntry) => {
    entriesRef.current.set(entry.pinId, entry);
    setEntries(new Map(entriesRef.current));
  }, []);

  /** Entry provisória (visível já) — continua elegível ao resolve. */
  const setProvisionalEntry = useCallback(
    (entry: NativeAnchorEntry) => {
      provisionalRef.current.add(entry.pinId);
      entriesRef.current.set(entry.pinId, entry);
      setEntries(new Map(entriesRef.current));
    },
    [],
  );

  /** Remove entrada local (exclusão de pin). */
  const removeLocal = useCallback((pinId: string) => {
    entriesRef.current.delete(pinId);
    setEntries(new Map(entriesRef.current));
    setPendingIds((prev) => {
      if (!prev.has(pinId)) return prev;
      const next = new Set(prev);
      next.delete(pinId);
      return next;
    });
  }, []);

  /** Recalcula o conjunto de pendentes (pins cloud sem entrada). */
  useEffect(() => {
    if (!serverAnchors) return;
    const next = new Set<string>();
    for (const a of serverAnchors) {
      if (isRealCloudAnchorId(a.cloudAnchorId) && !entriesRef.current.has(a.id)) {
        next.add(a.id);
      }
    }
    setPendingIds((prev) => {
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [serverAnchors, entries]);

  /**
   * Uma tentativa completa de resolve: promise silenciosa + poll de status
   * @1Hz (progresso real p/ HUD — doc VPS) + report de analytics.
   */
  const attemptResolve = useCallback(
    async (anchor: Anchor): Promise<boolean> => {
      const nav = navigatorRef.current;
      if (!nav?.resolveCloudAnchor) return false;

      const startedAt = Date.now();
      let settled = false;
      const resolvePromise = (async () => {
        try {
          return (await nav.resolveCloudAnchor(anchor.cloudAnchorId as string)) as ResolveResultShape;
        } finally {
          settled = true;
        }
      })();

      // Poll paralelo do status (a promise é silenciosa — doc VPS).
      const statusTimer = setInterval(async () => {
        if (settled || !aliveRef.current) return;
        try {
          if (!nav.getCloudAnchorStatus) return;
          const s = (await withTimeout(
            nav.getCloudAnchorStatus() as Promise<ResolveHudStatus | null>,
            5000,
            'getCloudAnchorStatus',
          )) as ResolveHudStatus | null;
          if (s && !settled && aliveRef.current) {
            setResolveHud({
              active: s.active,
              progress: s.progress ?? 0,
              message: s.message ?? '',
              startedAt,
            });
          }
        } catch {
          // poll best-effort
        }
      }, 1000);

      let result: ResolveResultShape | null = null;
      try {
        result = (await withTimeout(resolvePromise, OP_TIMEOUT_MS, 'resolveCloudAnchor')) as ResolveResultShape;
      } catch {
        result = null;
      } finally {
        clearInterval(statusTimer);
      }

      const ok = Boolean(result?.success && result.anchor?.position);
      // Best practice da doc: "report every resolve". ⚠️ Retorna PROMISE —
      // try/catch síncrono não pega a rejeição (lição de device: uncaught
      // promise no console); capturar na própria promise.
      try {
        const tracked = nav.rvTrackCloudAnchorResolution?.(
          anchor.cloudAnchorId,
          Date.now() - startedAt,
          ok,
        ) as Promise<unknown> | undefined;
        if (tracked && typeof tracked.catch === 'function') {
          tracked.catch(() => {
            // analytics best-effort
          });
        }
      } catch {
        // analytics best-effort
      }
      if (!aliveRef.current) return false;
      setResolveHud(null);

      if (!ok || !result?.anchor) {
        const message = String(result?.error ?? result?.state ?? 'sem resposta');
        // "already in progress": resolve nativo anterior ainda vivo — marca
        // para o loop AGUARDAR (re-check) em vez de contar como falha.
        if (message.toLowerCase().includes('already in progress')) {
          inProgressRef.current.add(anchor.id);
        } else {
          inProgressRef.current.delete(anchor.id);
        }
        console.warn(
          `[ARCloud] "${anchor.name}" resolve: ${message} (tentativa ${Date.now() - startedAt}ms)`,
        );
        return false;
      }
      inProgressRef.current.delete(anchor.id);

      // Posição: `.position` direto; fallback canônico `resolvedTransform`
      // (CSV 16 floats column-major — [12],[13],[14] = translação; contrato
      // do ViroLocationFrame, usado pelo exemplo vps-lite-test).
      let anchorPos = result.anchor.position as [number, number, number] | undefined;
      if (!anchorPos) {
        const rt = (result.anchor as { resolvedTransform?: string | null }).resolvedTransform;
        const t = parseLocationTransform(rt ?? undefined);
        if (t) anchorPos = [t[12], t[13], t[14]];
      }
      if (!anchorPos) {
        console.warn(`[ARCloud] "${anchor.name}" resolve OK sem posição — ignorada`);
        return false;
      }

      // frameOffset aditivo (pins novos = [0,0,0] por construção do scan;
      // pins antigos mantêm compat). Sem rotação: ARCore/RV alinham a pose da
      // âncora entre sessões (R_B·R_A⁻¹ ≈ I).
      const offset = (Array.isArray(anchor.frameOffset) ? anchor.frameOffset : [0, 0, 0]) as [
        number,
        number,
        number,
      ];
      const pinPos: [number, number, number] = [
        anchorPos[0] + offset[0],
        anchorPos[1] + offset[1],
        anchorPos[2] + offset[2],
      ];

      // Guard de datum (§15.7.2): coords de sessão são metros; ECEF vaza em km.
      const distFromOrigin = Math.hypot(pinPos[0], pinPos[1], pinPos[2]);
      if (distFromOrigin > 1000 || !Number.isFinite(distFromOrigin)) {
        console.warn(
          `[ARCloud] "${anchor.name}" posição fora do range de sessão (${distFromOrigin.toFixed(0)}m) — rejeitada`,
        );
        return false;
      }

      provisionalRef.current.delete(anchor.id);
      setEntry({ pinId: anchor.id, nativeAnchorId: anchor.cloudAnchorId as string, position: pinPos });
      console.log(
        `[ARCloud] "${anchor.name}" RESOLVIDA — pos=[${pinPos.map((v) => v.toFixed(2)).join(', ')}]`,
      );
      return true;
    },
    [setEntry],
  );

  // ── Loop de resolve com re-tentativa (backoff) e gates §12.12 ────────────
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const retryAtRef = useRef<Map<string, number>>(new Map());
  /** Pins com resolve NATIVO em curso ("already in progress") — aguardar. */
  const inProgressRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!serverAnchors || trackingState < 2 || !focusedRef.current) return;

    // Candidatos: cloud real SEM entry definitiva OU com entry PROVISÓRIA
    // (posição do locationTransform — o resolve a confirma). Ordenados por
    // createdAt DESC: o pin recém-hospedado resolve primeiro (features do
    // scan ainda na memória do SDK = match quase imediato).
    const candidates = serverAnchors
      .filter(
        (a) =>
          isRealCloudAnchorId(a.cloudAnchorId) &&
          (!entriesRef.current.has(a.id) || provisionalRef.current.has(a.id)),
      )
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    if (candidates.length === 0) return;

    let alive = true;
    (async () => {
      for (const anchor of candidates) {
        if (!alive || !focusedRef.current) break;
        const now = Date.now();
        const retryAt = retryAtRef.current.get(anchor.id) ?? 0;
        if (now < retryAt) continue;

        const nav = navigatorRef.current;
        if (!nav?.resolveCloudAnchor) break;

        const ok = await attemptResolve(anchor);
        if (!alive) return;
        if (!ok) {
          // "already in progress" = há um resolve NATIVO em curso (da
          // tentativa anterior) — NÃO é falha: re-checar sem penalizar.
          const inProgress = inProgressRef.current.has(anchor.id);
          if (inProgress) {
            retryAtRef.current.set(anchor.id, Date.now() + IN_PROGRESS_RECHECK_MS);
            console.log(`[ARCloud] "${anchor.name}" resolve em curso no nativo — re-check em ${IN_PROGRESS_RECHECK_MS / 1000}s`);
            continue;
          }
          const attempts = (attemptsRef.current.get(anchor.id) ?? 0) + 1;
          attemptsRef.current.set(anchor.id, attempts);
          const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
          retryAtRef.current.set(anchor.id, Date.now() + backoff);
          console.log(
            `[ARCloud] "${anchor.name}" re-tentativa em ${backoff / 1000}s (${attempts}ª falha)`,
          );
        } else {
          attemptsRef.current.delete(anchor.id);
          retryAtRef.current.delete(anchor.id);
        }
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverAnchors, trackingState, focused, entries, attemptResolve]);

  /** Re-tenta resolves que falharam (refresh explícito do HUD). */
  const retryFailed = useCallback(() => {
    attemptsRef.current.clear();
    retryAtRef.current.clear();
  }, []);

  return {
    /** Mapa pinId -> entrada resolvida visualmente (prioridade máxima). */
    entries,
    /** HUD: progresso do resolve em curso (active/progress/message). */
    resolveHud,
    /** Pins cloud ainda não localizados (estado honesto — nunca fallback GPS). */
    pendingIds,
    handleNavigatorReady,
    removeLocal,
    /** Entry PROVISÓRIA (locationTransform do finishScan) — visível já,
     *  confirmada pelo resolve em seguida. */
    setProvisionalEntry,
    retryFailed,
  };
}
