import { useCallback, useEffect, useRef, useState } from 'react';
import { enuToArXZ, geodeticToENU, type Anchor } from 'shared';
import type { NativeAnchorEntry } from './use-native-anchors';
import { isPoseFresh, type GeospatialPose } from './use-geospatial-pose';

/**
 * ── Projeção de âncoras pós-WorldAnchor — DUAS fontes ──────────────────────
 *
 * 1. Âncora NATIVA/cloud VISUAL resolvida (frame de SESSÃO — cm) — prioridade
 *    máxima. (Geospatial nativo do provider reactvision NÃO entra aqui: suas
 *    posições vêm num frame de terra do projeto, dezenas de km — P7 descarta.)
 * 2. PROJEÇÃO ENU+Δ com as coords do banco (lat/lng confirmadas pelo hosting
 *    geoespacial) — a camada DEFAULT (fluxo 2026-11-16): todo pin com lat/lng
 *    projeta IMEDIATAMENTE, sólido, com selo honesto "±Xm". Nasce uma vez,
 *    low-pass + convergência monótona; o resolve cloud visual (frame de
 *    sessão, cm) o substitui com transição suave ONE-WAY quando fecha.
 */

/** Acurácia máxima da pose para o fallback projetar pins (m). */
const FALLBACK_MAX_ACCURACY_M = 10;
/** Sem pins visíveis por este tempo → usa qualquer pose (best-effort).
 *  15s desde 2026-11-11 (eram 25s): antecipa o ghost — o "aparecer" é
 *  perceptível e o anel de incerteza honesta o envelope de erro. */
const FALLBACK_TIMEOUT_MS = 15_000;
/** Acurácia de pose que congela a estimativa de vez (m). */
const FREEZE_ACCURACY_M = 6;
/** Ticks SEM melhora de acurácia após os quais a estimativa congela (platô). */
const PLATEAU_TICKS = 10;
/** Fator de suavização por tick (25% do erro — desliza, não salta). */
const SMOOTHING_ALPHA = 0.25;
/** Pin congelado re-abre se a pose melhorar para menos que alvo×fator. */
const LATE_IMPROVEMENT_FACTOR = 0.5;
/** Acurácia vertical p/ confiar no eixo Y relativo (m). GPS vertical é ruim. */
const MAX_VERTICAL_TRUST_M = 20;
/** Duração da transição suave → âncora nativa (ms). */
const NATIVE_TRANSITION_MS = 800;
/** Intervalo da animação de transição (ms). */
const TRANSITION_TICK_MS = 150;
/** Y do chão no mundo AR (câmera de pé ~1.5m acima do chão). */
const WORLD_FLOOR_Y = -1.5;
/** Mudança mínima de posição para iniciar transição suave (m). */
const TRANSITION_MIN_JUMP_M = 0.05;
/**
 * Guard de DATUM para posições de âncoras nativas: o que ele caça é ECEF
 * vazando (resolveCloudAnchor 3.0.3 ≈ 6,37 Mm) e geodésica parcial (≈ Mm) —
 * lição de device 2026-11-10: gap de 3.446 km reportado pela telemetria
 * [ARProj] (P7).
 *
 * ⚠️ NÃO apertar (lição de device 2026-11-16 noite): âncoras geospatial do
 * RV devolvem posição no FRAME DA SESSÃO com eixos rotacionados pelo yaw do
 * launch — um pin a 74km (campus↔casa) LEGITIMAMENTE resolve a dezenas de
 * km. O cap de 1km matava pins distantes e levou ao diagnóstico errado de
 * "frame de terra do projeto" (que desligou a fila nativa no RV — revertido).
 * 1000km: pega ECEF/Mm, libera qualquer pin terrestre real.
 */
const MAX_SESSION_COORD_M = 1_000_000;
/** Gap nativa↔estimativa acima disto = datum/Δ suspeito (não é ruído de GPS). */
const SUSPICIOUS_GAP_M = 100;

/** Estado do fallback por pin (estimativa com alvo monótono). */
interface FallbackState {
  /** Posição renderizada atual (low-pass). */
  pos: [number, number, number];
  /** Alvo — só melhora com acurácia MELHOR (convergência monótona). */
  targetPos: [number, number, number];
  /** Melhor acurácia horizontal já vista ao computar o alvo (m). */
  targetAccM: number;
  /** Ticks de suavização já aplicados. */
  ticks: number;
  /** Ticks consecutivos sem melhora de acurácia (platô → congelar). */
  ticksSinceImprovement: number;
  /** Congelado (SLAM-stable) até nativo resolver ou refresh. */
  frozen: boolean;
}

interface TransitionState {
  from: [number, number, number];
  to: [number, number, number];
  startAt: number;
}

/** Posição é utilizável (finita, não colapsada na origem)? */
function isValidPosition(pos: [number, number, number]): boolean {
  return (
    Number.isFinite(pos[0]) &&
    Number.isFinite(pos[1]) &&
    Number.isFinite(pos[2]) &&
    !(Math.abs(pos[0]) < 0.005 && Math.abs(pos[1]) < 0.005 && Math.abs(pos[2]) < 0.005)
  );
}

/**
 * Posição em coordenadas de SESSÃO AR (metros da origem do SLAM) — rejeita
 * ECEF/geodésica que vaze de resolves nativos com datum errado (P7).
 */
function isSessionPosition(pos: [number, number, number]): boolean {
  return (
    isValidPosition(pos) &&
    Math.abs(pos[0]) <= MAX_SESSION_COORD_M &&
    Math.abs(pos[1]) <= MAX_SESSION_COORD_M &&
    Math.abs(pos[2]) <= MAX_SESSION_COORD_M
  );
}

function lerpPos(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface UseARProjectionParams {
  /** Âncoras vindas do server state (TanStack Query). */
  serverAnchors: Anchor[] | undefined;
  /** Âncoras nativas (pinId -> posição AR mantida pelo ARCore). */
  nativeEntries: Map<string, NativeAnchorEntry>;
  /** Pose geospatial da câmera (ref — lida a cada tick). */
  geoPoseRef: React.MutableRefObject<GeospatialPose | null>;
  /** Pose instantânea da câmera no mundo AR (ref — lida a cada tick). */
  cameraPosRef: React.MutableRefObject<[number, number, number]>;
  /** Δ do mundo AR (estado do motor de alinhamento — null = alinhando). */
  delta: number | null;
  /** Estado da pose (1Hz) — driver da re-projeção e distâncias vivas. */
  poseTick: GeospatialPose | null;
  /** Bump manual (botão de refresh) — limpa estimativas e re-projeta. */
  reprojectNonce: number;
}

export function useARProjection({
  serverAnchors,
  nativeEntries,
  geoPoseRef,
  cameraPosRef,
  delta,
  poseTick,
  reprojectNonce,
}: UseARProjectionParams) {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  /**
   * Desde quando cada pin candidato ao fallback está INVISÍVEL (per-pin).
   * ⚠️ Lição de device 2026-11-11: o best-effort por TIMEOUT era GLOBAL (só
   * contava com a tela toda vazia) — com UM pin já visível (ex.: cloud
   * resolvida), os demais nunca ganhavam best-effort e ficavam presos no
   * gate de acurácia (indoor GPS raramente ≤10m) → "só um anchor renderiza".
   */
  const waitingSinceRef = useRef<Map<string, number>>(new Map());
  /** Estimativas de fallback por pin. */
  const fallbackRef = useRef<Map<string, FallbackState>>(new Map());
  /** Última posição renderizada por pin (para transições suaves). */
  const renderedRef = useRef<Map<string, [number, number, number]>>(new Map());
  /** Transições ativas → âncora nativa. */
  const transitionsRef = useRef<Map<string, TransitionState>>(new Map());
  /** Deps estáveis em refs para o intervalo de animação. */
  const recomputeRef = useRef<() => void>(() => {});
  const [transitionActive, setTransitionActive] = useState(false);
  /** Pins já avisados por datum inválido (evita spam de log a 1Hz). */
  const datumWarnedRef = useRef<Set<string>>(new Set());
  /** Último aviso de "mundo vazio" (telemetria 1×/30s). */
  const emptyWorldWarnedAtRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    if (!serverAnchors) {
      fallbackRef.current.clear();
      renderedRef.current.clear();
      transitionsRef.current.clear();
      waitingSinceRef.current.clear();
      setTransitionActive(false);
      setAnchors([]);
      return;
    }

    const pose = geoPoseRef.current;
    const camPos = cameraPosRef.current;
    const now = Date.now();
    // Gate estrito de acurácia (comum a todos os pins); o best-effort por
    // timeout é avaliado PER-PIN dentro do loop.
    const strictAccuracyOk = pose !== null && pose.horizontalAccuracy <= FALLBACK_MAX_ACCURACY_M;

    // ⚠️ Frescor OBRIGATÓRIO (gate abaixo): pos = camPos(agora) + R(Δ)·ENU(
    // pose→pin) — se a pose estiver STALE, o camPos avança com o usuário e o
    // ENU fica congelado no valor velho => o pin anda JUNTO com o usuário
    // 1:1 (bug de device 2026-11-08: "os pontos saíram junto comigo").
    /** Best-effort PER-PIN: candidato invisível há ≥ FALLBACK_TIMEOUT_MS. */
    const pinBestEffort = (id: string, atNow: number, strictOk: boolean): boolean => {
      if (strictOk) {
        waitingSinceRef.current.delete(id);
        return true;
      }
      const since = waitingSinceRef.current.get(id);
      if (since === undefined) {
        waitingSinceRef.current.set(id, atNow);
        return false;
      }
      return atNow - since >= FALLBACK_TIMEOUT_MS;
    };

    const projected: Anchor[] = [];
    const seen = new Set<string>();

    for (const anchor of serverAnchors) {
      if (
        typeof anchor.latitude !== 'number' ||
        !Number.isFinite(anchor.latitude) ||
        typeof anchor.longitude !== 'number' ||
        !Number.isFinite(anchor.longitude)
      ) {
        continue;
      }
      seen.add(anchor.id);

      const native = nativeEntries.get(anchor.id);
      let renderPos: [number, number, number] | null = null;
      let estimated = false;
      let estimateAccuracyM: number | undefined;
      /**
       * isGhost morreu como ESTADO VISUAL (fluxo 2026-11-16): todo pin com
       * coords renderiza sólido estimado ±Xm (camada geospatial default) e o
       * resolve cloud faz o upgrade one-way. O HUD segue avisando os
       * pendentes ("aproxime-se") via pendingIds do use-cloud-anchors.
       */

      if (native && isSessionPosition(native.position)) {
        // 1. Âncora nativa — ARCore mantém Terra-ancorada. Sempre vence.
        // Telemetria: quão longe a nativa resolveu da estimativa congelada?
        // (diz empiricamente qual fonte está carregando o erro)
        const estimate = fallbackRef.current.get(anchor.id);
        if (estimate && native.nativeAnchorId) {
          const gap = Math.hypot(
            native.position[0] - estimate.pos[0],
            native.position[1] - estimate.pos[1],
            native.position[2] - estimate.pos[2],
          );
          if (gap > 0.5) {
            if (gap > SUSPICIOUS_GAP_M) {
              // Gap de centenas de metros não é ruído de GPS: é datum ou Δ
              // incorreto em uma das fontes (lição P7 — 3.446 km era ECEF).
              console.warn(
                `[ARProj] "${anchor.name}" gap SUSPEITO de ${gap.toFixed(0)}m (nativa↔estimativa) — conferir datum/Δ antes de confiar`,
              );
            } else {
              console.log(
                `[ARProj] "${anchor.name}" âncora nativa resolveu a ${gap.toFixed(1)}m da estimativa (est. ±${estimate.targetAccM.toFixed(0)}m) — nativa vence`,
              );
            }
          }
        }
        renderPos = native.position;
        // Selo honesto p/ âncora geoespacial (m) quando a acurácia é
        // conhecida — legados sem número seguem sólidos como antes.
        if (native.source === 'geospatial' && typeof anchor.geospatialAccuracyM === 'number') {
          estimated = true;
          estimateAccuracyM = anchor.geospatialAccuracyM;
        }
        const prev = renderedRef.current.get(anchor.id);
        if (
          prev &&
          Math.hypot(prev[0] - native.position[0], prev[1] - native.position[1], prev[2] - native.position[2]) >
            TRANSITION_MIN_JUMP_M
        ) {
          // Pin já visível em outro lugar (fallback ou SLAM do tap):
          // desliza até a posição nativa — jamais teleporte.
          if (!transitionsRef.current.has(anchor.id)) {
            transitionsRef.current.set(anchor.id, {
              from: prev,
              to: native.position,
              startAt: now,
            });
          }
        } else {
          transitionsRef.current.delete(anchor.id);
        }
        fallbackRef.current.delete(anchor.id);
        waitingSinceRef.current.delete(anchor.id);
      } else if (native && isValidPosition(native.position)) {
        // Nativa com posição VÁLIDA mas fora do range de sessão (km) —
        // ECEF/geo vazando de um resolve com datum errado. Descarta a
        // entrada e segue no fallback, avisando UMA vez (P7).
        if (!datumWarnedRef.current.has(anchor.id)) {
          datumWarnedRef.current.add(anchor.id);
          console.warn(
            `[ARProj] "${anchor.name}" âncora nativa com posição fora do range de sessão (${native.position.map((v) => v.toFixed(0)).join(', ')}m) — datum suspeito (ECEF?), usando fallback`,
          );
        }
      } else if (
        delta !== null &&
        pose &&
        isPoseFresh(pose) &&
        // Camada GEOSPATIAL DEFAULT (fluxo 2026-11-16): pins com lat/lng
        // (todos) projetam IMEDIATAMENTE via ENU+Δ — sólidos, estimados
        // ±Xm, SEM cortesia de ghost. O resolve cloud visual (frame de
        // sessão, cm) continua como upgrade one-way por Prioridade 1.
        // Acurácia estrita OU best-effort per-pin após FALLBACK_TIMEOUT_MS.
        (strictAccuracyOk || pinBestEffort(anchor.id, now, strictAccuracyOk))
      ) {
        // 2. Fallback world-stable: camPos + R(Δ)·ENU(pose→pin).
        const { east, north } = geodeticToENU(
          pose.latitude,
          pose.longitude,
          0,
          anchor.latitude,
          anchor.longitude,
          0,
        );
        /**
         * Sanity cap no NASCIMENTO da estimativa (par do guard P7 das
         * âncoras nativas): |ENU| > 1000km = datum envenenado (ex.: pose
         * zerada que escapou, ECEF vazando) — recusa e espera pose melhor.
         * ⚠️ NÃO apertar: pins LEGITIMAMENTE distantes (campus↔casa = 74km)
         * precisam projetar para aparecerem na listagem com a distância
         * real (lição de device 2026-11-16: cap de 1km sumia com todos os
         * pins longe da lista). Render a 74km é subpixel — inofensivo.
         */
        const MAX_ESTIMATE_RANGE_M = 1_000_000; // 1000km — guard de datum
        const enuRangeM = Math.hypot(east, north);
        if (enuRangeM > MAX_ESTIMATE_RANGE_M) {
          if (!datumWarnedRef.current.has(anchor.id)) {
            datumWarnedRef.current.add(anchor.id);
            console.warn(
              `[ARProj] "${anchor.name}" estimativa recusada: |ENU| ${(enuRangeM / 1000).toFixed(0)}km > ${MAX_ESTIMATE_RANGE_M / 1000}km (datum/pose suspeitos) — aguardando pose melhor`,
            );
          }
          waitingSinceRef.current.delete(anchor.id);
          // `continue` (não return!): pula SÓ este pin — o recompute segue
          // para os demais e a limpeza/setAnchors do final roda.
          continue;
        }
        const { x, z } = enuToArXZ(east, north, delta);
        let y = WORLD_FLOOR_Y;
        if (
          typeof anchor.altitude === 'number' &&
          Number.isFinite(anchor.altitude) &&
          Number.isFinite(pose.verticalAccuracy) &&
          pose.verticalAccuracy <= MAX_VERTICAL_TRUST_M
        ) {
          // Altura relativa (datum cancela: ARCore cria vs ARCore projeta)
          y = camPos[1] + (anchor.altitude - pose.altitude);
        }
        const target: [number, number, number] = [camPos[0] + x, y, camPos[2] + z];
        const acc = pose.horizontalAccuracy;

        let fb = fallbackRef.current.get(anchor.id);
        if (!fb) {
          // O pin nasce UMA vez — no melhor lugar que sabemos agora.
          fb = {
            pos: target,
            targetPos: target,
            targetAccM: acc,
            ticks: 0,
            ticksSinceImprovement: 0,
            frozen: false,
          };
          fallbackRef.current.set(anchor.id, fb);
          // Pin JÁ visível antes (ex.: cravado antes de invalidação pós
          // re-basing — Frente C): desliza até a nova estimativa, jamais
          // pula (mesma mecânica da chegada da âncora nativa).
          const prevRendered = renderedRef.current.get(anchor.id);
          if (
            prevRendered &&
            Math.hypot(
              prevRendered[0] - target[0],
              prevRendered[1] - target[1],
              prevRendered[2] - target[2],
            ) > TRANSITION_MIN_JUMP_M
          ) {
            transitionsRef.current.set(anchor.id, {
              from: prevRendered,
              to: target,
              startAt: now,
            });
          }
        } else if (!fb.frozen || acc <= fb.targetAccM * LATE_IMPROVEMENT_FACTOR) {
          // Alvo só melhora com acurácia MELHOR (convergência monótona).
          if (acc < fb.targetAccM) {
            // VPS converge ENQUANTO o usuário escaneia — pin congelado com
            // acurácia 2× pior re-abre suavemente.
            if (fb.frozen) {
              fb.frozen = false;
              fb.ticks = 0;
            }
            fb.targetPos = target;
            fb.targetAccM = acc;
            fb.ticksSinceImprovement = 0;
          } else {
            fb.ticksSinceImprovement += 1;
          }
          // Low-pass: desliza em direção ao alvo, jamais salta.
          fb.pos = lerpPos(fb.pos, fb.targetPos, SMOOTHING_ALPHA);
          fb.ticks += 1;
          // Congela em acurácia boa OU em PLATÔ (sem melhora por N ticks) —
          // nunca por tempo fixo: pins nasciam cravados na pose ainda ruim
          // dos primeiros segundos da sessão.
          if (fb.targetAccM <= FREEZE_ACCURACY_M || fb.ticksSinceImprovement >= PLATEAU_TICKS) {
            fb.frozen = true;
          }
        }
        renderPos = fb.pos;
        estimated = true;
        estimateAccuracyM = fb.targetAccM;
      }

      // Transição suave em curso → interpola (easeOutCubic ~0.8s).
      const transition = transitionsRef.current.get(anchor.id);
      if (transition && renderPos) {
        const t = Math.min(1, (now - transition.startAt) / NATIVE_TRANSITION_MS);
        if (t >= 1) {
          transitionsRef.current.delete(anchor.id);
          renderPos = transition.to;
        } else {
          renderPos = lerpPos(transition.from, transition.to, easeOutCubic(t));
        }
      }

      if (renderPos && isValidPosition(renderPos)) {
        renderedRef.current.set(anchor.id, renderPos);
        // Distância VIVA: recalculada a cada tick conforme a câmera anda.
        const dist = Math.hypot(
          renderPos[0] - camPos[0],
          renderPos[1] - camPos[1],
          renderPos[2] - camPos[2],
        );
        projected.push({
          ...anchor,
          arPosition: renderPos,
          distanceMeters: Number(dist.toFixed(2)),
          estimated,
          estimateAccuracyM,
        });
      }
    }

    // Limpeza de pins que saíram do server state.
    for (const id of fallbackRef.current.keys()) {
      if (!seen.has(id)) fallbackRef.current.delete(id);
    }
    for (const id of renderedRef.current.keys()) {
      if (!seen.has(id)) renderedRef.current.delete(id);
    }
    for (const id of transitionsRef.current.keys()) {
      if (!seen.has(id)) transitionsRef.current.delete(id);
    }
    for (const id of datumWarnedRef.current) {
      if (!seen.has(id)) datumWarnedRef.current.delete(id);
    }
    for (const id of waitingSinceRef.current.keys()) {
      if (!seen.has(id)) waitingSinceRef.current.delete(id);
    }

    setAnchors(projected);
    setTransitionActive(transitionsRef.current.size > 0);

    /**
     * Telemetria de vazio (lição do quarto, 2026-11-16): sessão com pins no
     * servidor e NADA projetado era invisível nos logs — sem pose (RV sem
     * fix GPS/VPS indoor) ou sem Δ, o mundo fica vazio e não há pista.
     * Loga 1×/30s o motivo para diagnóstico de campo.
     */
    if (projected.length === 0 && serverAnchors.length > 0) {
      const now = Date.now();
      if (now - (emptyWorldWarnedAtRef.current ?? 0) > 30_000) {
        emptyWorldWarnedAtRef.current = now;
        console.warn(
          `[ARProj] mundo vazio: ${serverAnchors.length} pin(s) no servidor, 0 projetados — ${pose ? `pose ok (±${pose.horizontalAccuracy.toFixed(0)}m)` : 'SEM pose (RV sem fix GPS/VPS)'}, Δ=${delta === null ? 'destravado' : 'ok'}${cameraPosRef.current ? '' : ', sem camPos'}`,
        );
      }
    }
  }, [serverAnchors, nativeEntries, delta, geoPoseRef, cameraPosRef]);

  recomputeRef.current = recompute;

  // Drivers da re-projeção: pose 1Hz (distância viva + alvo monótono),
  // dados do servidor, Δ travado e refresh manual.
  useEffect(() => {
    recompute();
  }, [recompute, poseTick, reprojectNonce]);

  // ── HEARTBEAT (lição 2026-11-10, sessões 14:35-14:41): o recompute era
  // acionado apenas por poseTick — quando o poll nativo pendura (módulo
  // one-op-por-vez), poseTick congela, o recompute para de rodar e o
  // timeout de 25s do fallback NUNCA é re-avaliado (pins invisíveis até um
  // refresh manual). Heartbeat de 2s garante que timedOut/waitingSince
  // sejam avaliados mesmo sem poses novas; recompute é idempotente.
  useEffect(() => {
    const heartbeat = setInterval(() => recomputeRef.current(), 2000);
    return () => clearInterval(heartbeat);
  }, []);

  // Anima as transições → nativo a 150ms enquanto houver (só quando ativo).
  useEffect(() => {
    if (!transitionActive) return;
    const timer = setInterval(() => recomputeRef.current(), TRANSITION_TICK_MS);
    return () => clearInterval(timer);
  }, [transitionActive]);

  /** Limpa estimativas congeladas (refresh manual → re-projeta do zero). */
  const clearFrozen = useCallback(() => {
    fallbackRef.current.clear();
    transitionsRef.current.clear();
    waitingSinceRef.current.clear();
  }, []);

  /** Remove a âncora das listas locais (exclusão otimista). */
  const removeAnchorLocal = useCallback((id: string) => {
    fallbackRef.current.delete(id);
    renderedRef.current.delete(id);
    transitionsRef.current.delete(id);
    setAnchors((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return {
    anchors,
    removeAnchorLocal,
    clearFrozen,
  };
}
