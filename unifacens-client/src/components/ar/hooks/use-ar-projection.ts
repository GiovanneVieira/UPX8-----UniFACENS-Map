import { useCallback, useEffect, useRef, useState } from 'react';
import { enuToArXZ, geodeticToENU, type Anchor } from 'shared';
import type { NativeAnchorEntry } from './use-native-anchors';
import { isPoseFresh, type GeospatialPose } from './use-geospatial-pose';

/**
 * ── Projeção de âncoras pós-WorldAnchor — DUAS fontes ──────────────────────
 *
 * 1. Âncora NATIVA (ARCore mantém Terra-ancorada) — prioridade máxima.
 * 2. FALLBACK world-stable via pose geospatial + Δ do mundo (motor de
 *    alinhamento): pos = camPos + R(Δ)·ENU(pose→pin). Congelado uma vez
 *    com low-pass + convergência monótona — o pin nasce UMA vez, no lugar
 *    certo (padrão Live View), e desliza (jamais salta) para a âncora
 *    nativa quando ela resolve.
 *
 * Pin invisível APENAS quando não há âncora nativa, nem Δ travado + pose.
 */

/** Acurácia máxima da pose para o fallback projetar pins (m). */
const FALLBACK_MAX_ACCURACY_M = 10;
/** Sem pins visíveis por este tempo → usa qualquer pose (best-effort). */
const FALLBACK_TIMEOUT_MS = 25_000;
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
  /** Momento em que o primeiro serverAnchor chegou sem pin visível. */
  const waitingSinceRef = useRef<number | null>(null);
  /** Estimativas de fallback por pin. */
  const fallbackRef = useRef<Map<string, FallbackState>>(new Map());
  /** Última posição renderizada por pin (para transições suaves). */
  const renderedRef = useRef<Map<string, [number, number, number]>>(new Map());
  /** Transições ativas → âncora nativa. */
  const transitionsRef = useRef<Map<string, TransitionState>>(new Map());
  /** Deps estáveis em refs para o intervalo de animação. */
  const recomputeRef = useRef<() => void>(() => {});
  const [transitionActive, setTransitionActive] = useState(false);

  const recompute = useCallback(() => {
    if (!serverAnchors) {
      fallbackRef.current.clear();
      renderedRef.current.clear();
      transitionsRef.current.clear();
      waitingSinceRef.current = null;
      setTransitionActive(false);
      setAnchors([]);
      return;
    }

    const pose = geoPoseRef.current;
    const camPos = cameraPosRef.current;
    const now = Date.now();
    const timedOut =
      waitingSinceRef.current !== null && now - waitingSinceRef.current >= FALLBACK_TIMEOUT_MS;
    // ⚠️ Frescor OBRIGATÓRIO: pos = camPos(agora) + R(Δ)·ENU(pose→pin) — se a
    // pose estiver STALE, o camPos avança com o usuário e o ENU fica congelado
    // no valor velho => o pin anda JUNTO com o usuário 1:1 (bug de device
    // 2026-11-08: "os pontos saíram junto comigo" ao sair de casa).
    const fallbackAllowed =
      delta !== null &&
      pose !== null &&
      isPoseFresh(pose) &&
      (pose.horizontalAccuracy <= FALLBACK_MAX_ACCURACY_M || timedOut);

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

      if (native && isValidPosition(native.position)) {
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
            console.log(
              `[ARProj] "${anchor.name}" âncora nativa resolveu a ${gap.toFixed(1)}m da estimativa (est. ±${estimate.targetAccM.toFixed(0)}m) — nativa vence`,
            );
          }
        }
        renderPos = native.position;
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
      } else if (fallbackAllowed && delta !== null && pose) {
        // 2. Fallback world-stable: camPos + R(Δ)·ENU(pose→pin).
        const { east, north } = geodeticToENU(
          pose.latitude,
          pose.longitude,
          0,
          anchor.latitude,
          anchor.longitude,
          0,
        );
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

    // Timeout best-effort: conta pins esperando sem NENHUM visível.
    if (projected.length === 0 && serverAnchors.length > 0) {
      if (waitingSinceRef.current === null) waitingSinceRef.current = Date.now();
    } else {
      waitingSinceRef.current = null;
    }

    setAnchors(projected);
    setTransitionActive(transitionsRef.current.size > 0);
  }, [serverAnchors, nativeEntries, delta, geoPoseRef, cameraPosRef]);

  recomputeRef.current = recompute;

  // Drivers da re-projeção: pose 1Hz (distância viva + alvo monótono),
  // dados do servidor, Δ travado e refresh manual.
  useEffect(() => {
    recompute();
  }, [recompute, poseTick, reprojectNonce]);

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
    waitingSinceRef.current = null;
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
