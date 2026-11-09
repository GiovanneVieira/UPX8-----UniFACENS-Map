import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeDegrees } from 'shared';
import type { GeospatialPose } from './use-geospatial-pose';

/**
 * ── Motor de Alinhamento Mundial (Δ) ────────────────────────────────────────
 * O mundo AR do ARCore nasce com yaw ARBITRÁRIO (origem = pose do device no
 * launch da sessão). Para projetar WGS84→AR é preciso saber o azimute
 * verdadeiro do eixo -Z do mundo: o Δ.
 *
 * Δ = pose.heading (azimute verdadeiro da câmera, da Geospatial API)
 *   − yawAR (azimute da câmera no frame AR, derivado do forward da câmera)
 *
 * Diferença fatal vs. o antigo WorldAnchor: a fonte é a POSE GEOSPATIAL
 * (Terra-ancorada, imune ao viés ferromagnético que condenou a fusão por
 * bússola), e o Δ é congelado UMA vez por sessão — jamais fusão contínua
 * (lição §11.5 do AGENTS.MD: reajustar Δ continuamente gira o mundo em
 * torno da câmera e faz os pins perseguirem o celular).
 */

/** Acurácia de heading máxima para o lock primário do Δ. */
const LOCK_HEADING_ACCURACY_DEG = 12;
/** Dispersão máxima entre amostras de Δ do lote (rejeita lote turbulento). */
const LOCK_SPREAD_DEG = 10;
/** Amostras de Δ mantidas (janela deslizante ~6s @1Hz). */
const DELTA_SAMPLES = 6;
/** Amostras mínimas para estimativa robusta do Δ. */
const MIN_ROBUST_SAMPLES = 3;
/** Outlier: amostra além disso do centro do lote é descartada. */
const OUTLIER_REJECT_DEG = 15;
/** Sem lock bom até aqui → trava best-effort e abre janela de refinamento. */
const BEST_EFFORT_AFTER_MS = 20_000;
/** Duração da janela de refinamento pós-lock best-effort. */
const REFINE_WINDOW_MS = 10_000;
/** Amostra com esta acurácia congela o Δ de vez dentro da janela. */
const REFINE_FREEZE_ACCURACY_DEG = 8;
/** Guarda: amostra que giraria o mundo mais que isso é descartada. */
const REFINE_MAX_JUMP_DEG = 30;
/** Componente horizontal mínima do forward (câmera ~no horizonte). */
const MIN_HORIZONTAL_FWD = 0.4;

/** Amostra candidata de Δ em um tick de pose. */
interface DeltaSample {
  delta: number;
  headingAcc: number;
}

export type ARWorldAlignmentStatus = 'aligning' | 'locked';

/** Desvio circular mínimo entre dois ângulos [0, 180]. */
function circularDev(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Média circular ROBUSTA: descarta outliers (>OUTLIER_REJECT_DEG do centro)
 * e tira a média circular dos sobreviventes. Retorna null se o lote estiver
 * espalhado demais (câmera girando / pose ainda convergindo).
 */
function robustCircularMean(samples: DeltaSample[]): { value: number; spreadDeg: number } | null {
  if (samples.length === 0) return null;
  const sinSum = samples.reduce((a, s) => a + Math.sin((s.delta * Math.PI) / 180), 0);
  const cosSum = samples.reduce((a, s) => a + Math.cos((s.delta * Math.PI) / 180), 0);
  const center = (((Math.atan2(sinSum, cosSum) * 180) / Math.PI) + 360) % 360;

  const survivors = samples.filter((s) => circularDev(s.delta, center) <= OUTLIER_REJECT_DEG);
  if (survivors.length < Math.min(MIN_ROBUST_SAMPLES, samples.length)) return null;

  const sSin = survivors.reduce((a, s) => a + Math.sin((s.delta * Math.PI) / 180), 0);
  const sCos = survivors.reduce((a, s) => a + Math.cos((s.delta * Math.PI) / 180), 0);
  const value = (((Math.atan2(sSin, sCos) * 180) / Math.PI) + 360) % 360;
  const spreadDeg = Math.max(...survivors.map((s) => circularDev(s.delta, value)));
  return { value, spreadDeg };
}

/**
 * Estima e CONGELA o Δ do mundo AR da sessão a partir da pose geospatial
 * (1Hz) e do yaw da câmera no mundo AR. Recalibração apenas explícita via
 * `realign()` (botão de refresh).
 *
 * ⚠️ Fonte do yaw (lição de device, 2026-11-08): o **vetor `forward`** com
 * guarda de horizontalidade — `yawAR = atan2(fwd.x, −fwd.z)` é válido para
 * QUALQUER pitch (projeção no plano XZ). `rotation[1]` (euler) foi testado e
 * **garbla o yaw sob câmera inclinada** (convenção de ordem euler mistura
 * pitch/roll no componente Y) — a pose típica de criar pin mirando o chão —
 * envenenando o Δ da sessão inteira. Amostras com câmera muito inclinada
 * (|fwd.y| alto / horizontal < MIN_HORIZONTAL_FWD) são descartadas.
 */
export function useARWorldAlignment(
  /** Estado da pose (1Hz) — driver do efeito. */
  pose: GeospatialPose | null,
  /** Forward da câmera no frame AR (atualizado pelo onCameraTransformUpdate). */
  cameraFwdRef: React.MutableRefObject<[number, number, number]>,
) {
  const deltaRef = useRef<number | null>(null);
  const lockedAccuracyRef = useRef<number | null>(null);
  const firstPoseAtRef = useRef<number | null>(null);
  const refineUntilRef = useRef<number | null>(null);
  /** Janela deslizante de amostras de Δ (1 por tick de pose). */
  const deltaSamplesRef = useRef<DeltaSample[]>([]);
  const [delta, setDelta] = useState<number | null>(null);
  const [status, setStatus] = useState<ARWorldAlignmentStatus>('aligning');

  /** Amostra candidata de Δ — null se o yaw AR não for confiável agora. */
  const sampleDelta = (p: GeospatialPose): number | null => {
    const fwd = cameraFwdRef.current;
    const horiz = Math.hypot(fwd[0], fwd[2]);
    if (horiz < MIN_HORIZONTAL_FWD) return null; // apontando p/ chão/céu
    const yawAR = normalizeDegrees((Math.atan2(fwd[0], -fwd[2]) * 180) / Math.PI);
    return normalizeDegrees(p.heading - yawAR);
  };

  useEffect(() => {
    if (!pose) return;
    const now = Date.now();
    if (firstPoseAtRef.current === null) firstPoseAtRef.current = now;

    // Travado sem janela de refinamento → NUNCA mais mexe (lição §11.5).
    if (deltaRef.current !== null && refineUntilRef.current === null) return;
    // Janela de refinamento expirada → fecha e congela.
    if (deltaRef.current !== null && refineUntilRef.current !== null && now >= refineUntilRef.current) {
      refineUntilRef.current = null;
      return;
    }

    const sample = sampleDelta(pose);
    if (sample === null) return;
    const acc = Number.isFinite(pose.headingAccuracy) ? pose.headingAccuracy : 999;

    // Acumula na janela deslizante e estimativa ROBUSTA do lote.
    const window = deltaSamplesRef.current;
    window.push({ delta: sample, headingAcc: acc });
    if (window.length > DELTA_SAMPLES) window.shift();
    const robust = robustCircularMean(window);

    if (deltaRef.current === null) {
      if (robust && robust.spreadDeg <= LOCK_SPREAD_DEG && acc <= LOCK_HEADING_ACCURACY_DEG) {
        // Lock primário: lote conciso + acurácia boa → congela de vez.
        deltaRef.current = robust.value;
        lockedAccuracyRef.current = acc;
        refineUntilRef.current = null;
        setDelta(robust.value);
        setStatus('locked');
        console.log(
          `[ARAlign] Δ travado: ${robust.value.toFixed(1)}° (${window.length} amostras, spread ${robust.spreadDeg.toFixed(1)}°, headingAcc ±${acc.toFixed(1)}°)`,
        );
        return;
      }
      if (now - (firstPoseAtRef.current ?? now) >= BEST_EFFORT_AFTER_MS && robust) {
        // Best-effort: melhor Δ aproximado que mundo girado aleatório.
        deltaRef.current = robust.value;
        lockedAccuracyRef.current = acc;
        refineUntilRef.current = now + REFINE_WINDOW_MS;
        setDelta(robust.value);
        setStatus('locked');
        console.warn(
          `[ARAlign] Δ best-effort: ${robust.value.toFixed(1)}° (spread ${robust.spreadDeg.toFixed(1)}°, ±${acc.toFixed(1)}°) — refinando por ${REFINE_WINDOW_MS / 1000}s`,
        );
      }
      return;
    }

    // Janela de refinamento aberta: aceita apenas lotes MELHORES com salto
    // limitado (guarda contra giros selvagens).
    if (robust && acc < (lockedAccuracyRef.current ?? 999)) {
      const jump = circularDev(robust.value, deltaRef.current);
      if (jump <= REFINE_MAX_JUMP_DEG) {
        deltaRef.current = robust.value;
        lockedAccuracyRef.current = acc;
        setDelta(robust.value);
        if (acc <= REFINE_FREEZE_ACCURACY_DEG) {
          refineUntilRef.current = null;
          console.log(`[ARAlign] Δ refinado e congelado: ${robust.value.toFixed(1)}° (±${acc.toFixed(1)}°)`);
        }
      }
    }
    // cameraFwdRef é ref — leitura no tick, não precisa nas deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);

  /** Recalibração EXPLÍCITA (botão de refresh): reabre a estimativa do Δ. */
  const realign = useCallback(() => {
    deltaRef.current = null;
    lockedAccuracyRef.current = null;
    firstPoseAtRef.current = null;
    refineUntilRef.current = null;
    setDelta(null);
    setStatus('aligning');
    console.log('[ARAlign] recalibração explícita — reabrindo estimativa do Δ');
  }, []);

  return { delta, deltaRef, status, realign };
}
