import { useCallback, useEffect, useRef, useState } from 'react';
import { parseLocationTransform } from '@reactvision/react-viro';
import { geodeticToENU, type Anchor } from 'shared';
import type { NativeAnchorEntry } from './use-native-anchors';
import type { GeospatialPose } from './use-geospatial-pose';

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
 * - pins cloud NÃO localizados: estimativa "ghost" após cortesia de 8s
 *   (GHOST_GRACE_MS) — projetados pelo fallback world-stable com selo ±Xm
 *   e substituídos com transição suave quando o resolve confirma. ONE-WAY
 *   por construção (a lição E5 condenava o pin PULSANDO entre cravado e
 *   GPS em oscilação bidirecional — aqui a estimativa nasce uma vez,
 *   congela e o resolve só APRIMORA, nunca regressa).
 */

/**
 * Prefixos de IDs sintéticos que NÃO são cloud anchors reais.
 * ⚠️ O ARCore gera cloud anchor IDs começando com "ua-" — NÃO filtrar por
 * "ua-" genérico! Seeds de dev seguem "ua-facens-demo-*".
 */
const SYNTHETIC_ID_PREFIXES = ['coord-', 'ua-facens-'];
/**
 * Timeout JS por tentativa de resolve. Doc oficial: SIFT numa "window of up
 * to thirty seconds" — 35s dá 5s de margem e libera o slot sequencial mais
 * cedo em falha (eram 45s: ~10s mortos por pin numa cadeia de NoMatch).
 */
const OP_TIMEOUT_MS = 35_000;
/**
 * Backoff de re-tentativa por pin (ms) — SEMPRE acima da vida nativa do
 * resolve (~30s): backoffs curtos disparavam "A resolve for this anchor is
 * already in progress (2ms!)" em cima do resolve anterior ainda vivo
 * (lição de device 2026-11-10 noite, logs 18:46-18:47).
 */
/**
 * Backoff de re-tentativa por pin (economia de quota, 2026-11-11 v2: eram
 * [60,90,120]s — com o auto-refresh zerando, um pin NoMatch era re-tentado
 * ~60×/h para sempre; cada tentativa fútil = 1 get de descritores + 1
 * report). SEMPRE acima da vida nativa do resolve (~30s): backoffs curtos
 * disparavam "already in progress (2ms!)" (lição 2026-11-10).
 */
const RETRY_BACKOFF_MS = [60_000, 120_000, 180_000];
/**
 * Reset de backoff por MUDANÇA DE CONTEXTO (o melhor dos dois mundos):
 * re-tentar parado no mesmo lugar sem apontar = physics não mudou = quota
 * queimada. Andou >8m ou virou o corpo >90° desde a última tentativa do
 * pin = informação nova = elegível IMEDIATAMENTE (v. plano quota v2).
 */
const CONTEXT_RESET_MOVED_M = 8;
const CONTEXT_RESET_TURNED_DEG = 90;
/**
 * Cap de candidatos por passada em DEV (economia de quota): bancos de dev
 * cheios de pins de cômodos diferentes — resolver só os mais próximos
 * corta a maioria dos NoMatch. Release resolve todos.
 */
const MAX_CANDIDATES_PER_PASS = __DEV__ ? 3 : Number.POSITIVE_INFINITY;
/** "already in progress": re-checar após este intervalo (sem penalizar). */
const IN_PROGRESS_RECHECK_MS = 12_000;
/**
 * Cortesia antes de um pin cloud pendente virar estimativa "ghost" visível:
 * resolves rápidos da MESMA sessão (features do scan ainda em memória =
 * match quase imediato) fecham antes de 5s — evita o ghost "piscar" para
 * quem acabou de criar o pin (decisão Q5; 5s desde 2026-11-11 — eram 8s,
 * antecipado para o "aparecer" chegar mais cedo).
 */
const GHOST_GRACE_MS = 5_000;
/** Heartbeat da promoção pendente → ghost (o relógio é sistema externo). */
const GHOST_TICK_MS = 2_000;
/**
 * Re-passada periódica do loop de resolve. ⚠️ Lição de device 2026-11-11:
 * o loop só re-agia a mudanças das deps (serverAnchors/entries/tracking) —
 * um pin em "re-check em 12s" NUNCA era re-checado se nada mudasse, e os
 * resolves de múltiplos pins empacavam no primeiro da fila.
 */
const LOOP_TICK_MS = 15_000;
/**
 * EXPERIMENTO (2026-11-11, dev-gated): o "already in progress" histórico
 * era por ÂNCORA (re-tentativa do MESMO pin em cima do resolve vivo) —
 * resolves de pins DIFERENTES podem paralelizar no provider ReactVision.
 * Dispara os 2 primeiros candidatos juntos; se o 2º retornar "already in
 * progress" IMEDIATO, o lock é GLOBAL e o log prova (reverter = apagar a
 * flag). Em release segue sequencial.
 */
const PARALLEL_RESOLVE_EXPERIMENT = __DEV__;
const PARALLEL_RESOLVE_CAP = 2;
/** Progresso HUD durante o resolve (doc: active/progress/message). */
export interface ResolveHudStatus {
  active: boolean;
  progress: number;
  message: string;
  /** Início da tentativa (Date.now()) — HUD escala a dica após 25s. */
  startedAt: number;
}

/** Registro de diagnóstico por pin cloud (modal ARDiagnosticsModal). */
export interface CloudAnchorDiagnostic {
  pinId: string;
  name: string;
  cloudAnchorId: string;
  /** resolved | provisional | ghost | grace | waiting */
  state: 'resolved' | 'provisional' | 'ghost' | 'grace' | 'waiting';
  /** Tentativas de resolve nesta sessão. */
  attempts: number;
  /** ms até a próxima re-tentativa elegível (0 = agora). */
  retryInMs: number;
  /** Resolve nativo em curso ("already in progress"). */
  inProgress: boolean;
  /** Última mensagem de resolve (sucesso/falha) + quando. */
  lastMessage: { message: string; at: number } | null;
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
  geoPoseRef,
}: {
  serverAnchors: Anchor[] | undefined;
  trackingState: number;
  /** Tab focada? false no blur — congela resolves nativos (§12.12). */
  focused?: boolean;
  /** Pose geospatial atual (ref) — ordena candidatos por proximidade. */
  geoPoseRef?: React.MutableRefObject<GeospatialPose | null>;
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
  /** Pins cloud ainda não localizados (aguardando resolve). */
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  /**
   * Pendentes ELEGÍVEIS a estimativa ghost (pendência ≥ GHOST_GRACE_MS) —
   * a projeção os exibe com selo ±Xm e o HUD os anuncia ("aproximados").
   */
  const [ghostIds, setGhostIds] = useState<Set<string>>(new Set());
  /** Momento em que cada pin entrou na pendência (id → Date.now()). */
  const pendingSinceRef = useRef<Map<string, number>>(new Map());
  /** Última mensagem de resolve por pin (diagnóstico do modal). */
  const lastMessageRef = useRef<Map<string, { message: string; at: number }>>(new Map());

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
    pendingSinceRef.current.delete(pinId);
    lastMessageRef.current.delete(pinId);
    attemptContextRef.current.delete(pinId);
    setPendingIds((prev) => {
      if (!prev.has(pinId)) return prev;
      const next = new Set(prev);
      next.delete(pinId);
      return next;
    });
    setGhostIds((prev) => {
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
        if (!pendingSinceRef.current.has(a.id)) pendingSinceRef.current.set(a.id, Date.now());
      }
    }
    // Coleta antes de deletar — nunca mutar o Map durante a própria iteração.
    const stalePending: string[] = [];
    for (const id of pendingSinceRef.current.keys()) {
      if (!next.has(id)) stalePending.push(id);
    }
    for (const id of stalePending) pendingSinceRef.current.delete(id);
    setPendingIds((prev) => {
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [serverAnchors, entries]);

  /**
   * Promoção pendente → ghost após a cortesia. Heartbeat de 2s (relógio =
   * sistema externo, effect com cleanup): resolves rápidos fecham antes de
   * o ghost nascer; o ghost sai do Set assim que a pendência sai.
   */
  useEffect(() => {
    const promote = () => {
      const now = Date.now();
      const next = new Set<string>();
      for (const [id, since] of pendingSinceRef.current) {
        if (now - since >= GHOST_GRACE_MS) next.add(id);
      }
      setGhostIds((prev) => {
        if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
        return next;
      });
    };
    promote();
    const timer = setInterval(promote, GHOST_TICK_MS);
    return () => clearInterval(timer);
  }, [pendingIds]);

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
        lastMessageRef.current.set(anchor.id, { message, at: Date.now() });
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
      lastMessageRef.current.set(anchor.id, {
        message: `resolvida em ${Date.now() - startedAt}ms`,
        at: Date.now(),
      });
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
  /** Pose da última tentativa por pin — reset de backoff por mudança (v2). */
  const attemptContextRef = useRef<Map<string, { lat: number; lng: number; heading: number }>>(
    new Map(),
  );
  /** Driver de re-passada: refresh explícito OU tick periódico. */
  const [loopNonce, setLoopNonce] = useState(0);

  useEffect(() => {
    if (!serverAnchors || trackingState < 2 || !focusedRef.current) return;

    // Candidatos: cloud real SEM entry definitiva OU com entry PROVISÓRIA
    // (posição do locationTransform — o resolve a confirma). Ordenados por
    // PROXIMIDADE da pose atual (2026-11-11): o pin perto do usuário
    // (a) tem a câmera vendo o ambiente dele = SIFT fecha mais rápido,
    // (b) é o que ele quer ver agora; pins distantes tendem a NoMatch =
    // ~30s de slot sequencial desperdiçado furando a fila. Sem pose (ou
    // pin sem lat/lng): fim da fila; tiebreak createdAt DESC (features em
    // memória do pin recém-hospedado).
    const pose = geoPoseRef?.current ?? null;
    const distOf = (a: Anchor): number => {
      if (
        !pose ||
        typeof a.latitude !== 'number' ||
        typeof a.longitude !== 'number'
      ) {
        return Number.POSITIVE_INFINITY;
      }
      const { east, north } = geodeticToENU(
        pose.latitude,
        pose.longitude,
        0,
        a.latitude,
        a.longitude,
        0,
      );
      return Math.hypot(east, north);
    };
    const candidates = serverAnchors
      .filter(
        (a) =>
          isRealCloudAnchorId(a.cloudAnchorId) &&
          (!entriesRef.current.has(a.id) || provisionalRef.current.has(a.id)),
      )
      .sort(
        (a, b) =>
          distOf(a) - distOf(b) ||
          String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
      );
    if (candidates.length === 0) return;

    /** Pós-processamento comum (backoff / re-check "already in progress"). */
    const settle = (anchor: Anchor, ok: boolean) => {
      // Contexto da tentativa (para o reset de backoff por mudança — v2):
      // guardado ANTES do resultado, com a pose do momento da tentativa.
      if (pose) {
        attemptContextRef.current.set(anchor.id, {
          lat: pose.latitude,
          lng: pose.longitude,
          heading: pose.heading,
        });
      } else {
        attemptContextRef.current.delete(anchor.id);
      }
      if (ok) {
        attemptsRef.current.delete(anchor.id);
        retryAtRef.current.delete(anchor.id);
        return;
      }
      // "already in progress" = há um resolve NATIVO em curso (da
      // tentativa anterior) — NÃO é falha: re-checar sem penalizar.
      if (inProgressRef.current.has(anchor.id)) {
        retryAtRef.current.set(anchor.id, Date.now() + IN_PROGRESS_RECHECK_MS);
        console.log(
          `[ARCloud] "${anchor.name}" resolve em curso no nativo — re-check em ${IN_PROGRESS_RECHECK_MS / 1000}s`,
        );
        return;
      }
      const attempts = (attemptsRef.current.get(anchor.id) ?? 0) + 1;
      attemptsRef.current.set(anchor.id, attempts);
      const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
      retryAtRef.current.set(anchor.id, Date.now() + backoff);
      console.log(
        `[ARCloud] "${anchor.name}" re-tentativa em ${backoff / 1000}s (${attempts}ª falha)`,
      );
    };

    let alive = true;
    (async () => {
      const nav = navigatorRef.current;
      if (!nav?.resolveCloudAnchor) return;

      // Reset por MUDANÇA DE CONTEXTO (v2): backoff vencido OU contexto
      // novo (andou >8m / virou >90° desde a última tentativa do pin) —
      // re-tentar com a câmera apontando para o lugar é a tentativa que
      // FECHA; re-tentar parado no mesmo lugar é quota queimada.
      const contextResets = (a: Anchor): boolean => {
        const ctx = attemptContextRef.current.get(a.id);
        if (!ctx || !pose) return false;
        const { east, north } = geodeticToENU(
          ctx.lat,
          ctx.lng,
          0,
          pose.latitude,
          pose.longitude,
          0,
        );
        if (Math.hypot(east, north) > CONTEXT_RESET_MOVED_M) return true;
        const turned = Math.abs(((pose.heading - ctx.heading + 540) % 360) - 180);
        return turned > CONTEXT_RESET_TURNED_DEG;
      };
      const queue = candidates
        .filter(
          (a) =>
            Date.now() >= (retryAtRef.current.get(a.id) ?? 0) || contextResets(a),
        )
        // Cap (dev): só os N mais próximos — pins de outros cômodos são
        // NoMatch quase certo; ghosts cobrem o visual deles.
        .slice(0, MAX_CANDIDATES_PER_PASS);

      // Experimento (dev): 2 primeiros elegíveis EM PARALELO — ver doc da
      // flag. O resultado do 2º no logcat responde se o lock é por âncora.
      const parallelCount =
        PARALLEL_RESOLVE_EXPERIMENT && queue.length >= 2 ? PARALLEL_RESOLVE_CAP : 0;
      if (parallelCount > 0) {
        console.log('[ARCloud][Experimento] 2 resolves paralelos em voo (lock por âncora?)');
        const batch = queue.slice(0, parallelCount);
        const results = await Promise.allSettled(batch.map((a) => attemptResolve(a)));
        if (!alive) return;
        batch.forEach((anchor, i) => {
          const r = results[i];
          settle(anchor, r.status === 'fulfilled' && r.value === true);
        });
      }

      for (const anchor of queue.slice(parallelCount)) {
        if (!alive || !focusedRef.current) break;
        const ok = await attemptResolve(anchor);
        if (!alive) return;
        settle(anchor, ok);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverAnchors, trackingState, focused, entries, attemptResolve, loopNonce]);

  /**
   * Re-passadas periódicas enquanto houver pendentes: re-checks de 12s e
   * backoffs vencidos são re-avaliados sem depender de mudança de deps.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      if (pendingSinceRef.current.size > 0) setLoopNonce((n) => n + 1);
    }, LOOP_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  /** Re-tenta resolves que falharam (refresh explícito do HUD). */
  const retryFailed = useCallback(() => {
    attemptsRef.current.clear();
    retryAtRef.current.clear();
    attemptContextRef.current.clear();
    // ⚠️ Zerar refs NÃO dispara o effect do loop — o bump do nonce sim
    // (lição de device 2026-11-11: "refresh não faz nada").
    setLoopNonce((n) => n + 1);
  }, []);

  /**
   * Re-passada LEVE (auto-refresh 30s): bump do nonce SEM zerar backoffs —
   * quem falhou espera a janela (ou uma mudança de contexto); quem está
   * elegível é tentado. Diferente do retryFailed (botão manual = escolha
   * explícita do usuário, zera tudo). Economia de quota v2, 2026-11-11.
   */
  const nudge = useCallback(() => {
    setLoopNonce((n) => n + 1);
  }, []);

  /**
   * Invalida as entries resolvidas e re-resolve tudo (Frente C). Gatilho:
   * tracking que degradou e RECUPEROU (3→1/2→3) — em background/resume o
   * ARCore pode RE-BASAR a origem do mundo (§12.8) e as posições resolvidas
   * na sessão ficam deslocadas do novo frame. O resolve re-localiza o
   * device contra o mapa visual hospedado e devolve a posição NO frame
   * atual — a projeção interpola suavemente (jamais salta).
   */
  const invalidateEntries = useCallback(() => {
    console.log('[ARCloud] entries invalidadas — re-resolve no frame atual (mundo pode ter re-basado)');
    entriesRef.current.clear();
    provisionalRef.current.clear();
    setEntries(new Map());
    attemptsRef.current.clear();
    retryAtRef.current.clear();
    attemptContextRef.current.clear();
    setLoopNonce((n) => n + 1);
  }, []);

  /**
   * Snapshot de diagnóstico por pin cloud (modal ARDiagnosticsModal) —
   * PULL sob demanda (lê refs; sem re-renders extras na cena).
   */
  const diagnosticsSnapshot = useCallback((anchors: Anchor[]): CloudAnchorDiagnostic[] => {
    const now = Date.now();
    return anchors
      .filter((a) => isRealCloudAnchorId(a.cloudAnchorId))
      .map((a) => {
        const resolved = entriesRef.current.has(a.id);
        const since = pendingSinceRef.current.get(a.id);
        const retryAt = retryAtRef.current.get(a.id) ?? 0;
        let state: CloudAnchorDiagnostic['state'];
        if (resolved) {
          state = provisionalRef.current.has(a.id) ? 'provisional' : 'resolved';
        } else if (since === undefined) {
          state = 'waiting';
        } else {
          state = now - since >= GHOST_GRACE_MS ? 'ghost' : 'grace';
        }
        return {
          pinId: a.id,
          name: a.name,
          cloudAnchorId: a.cloudAnchorId,
          state,
          attempts: attemptsRef.current.get(a.id) ?? 0,
          retryInMs: Math.max(0, retryAt - now),
          inProgress: inProgressRef.current.has(a.id),
          lastMessage: lastMessageRef.current.get(a.id) ?? null,
        };
      });
  }, []);

  return {
    /** Mapa pinId -> entrada resolvida visualmente (prioridade máxima). */
    entries,
    /** HUD: progresso do resolve em curso (active/progress/message). */
    resolveHud,
    /** Pins cloud aguardando resolve (invisíveis durante a cortesia). */
    pendingIds,
    /** Pendentes ≥ cortesia: projetam como estimativa ghost (selo ±Xm). */
    ghostIds,
    handleNavigatorReady,
    removeLocal,
    /** Entry PROVISÓRIA (locationTransform do finishScan) — visível já,
     *  confirmada pelo resolve em seguida. */
    setProvisionalEntry,
    retryFailed,
    /** Re-passada leve sem zerar backoffs (auto-refresh 30s — quota v2). */
    nudge,
    /** Invalida entries e re-resolve tudo (tracking recuperado pós-degradação
     *  — mundo pode ter re-basado; Frente C). */
    invalidateEntries,
    /** Snapshot de diagnóstico por pin (pull). */
    diagnosticsSnapshot,
  };
}
