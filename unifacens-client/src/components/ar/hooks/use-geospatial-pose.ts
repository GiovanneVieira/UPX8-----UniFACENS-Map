import { useCallback, useRef, useState } from 'react';
import { geodeticToENU } from 'shared';

/** Pose geoespacial da câmera (ancorada na TERRA via VPS+GPS do ARCore). */
export interface GeospatialPose {
  latitude: number;
  longitude: number;
  altitude: number;
  /** Heading verdadeiro (graus) corrigido contra a Terra. */
  heading: number;
  /** Acurácias (95% de confiança) — a pose se auto-corrige via VPS. */
  horizontalAccuracy: number;
  verticalAccuracy: number;
  headingAccuracy: number;
  /** Momento da leitura (Date.now()) — usado para expirar poses velhas. */
  timestamp: number;
}

/** Idade máxima (ms) de uma pose para ser considerada fresca. */
export const GEO_POSE_FRESH_MS = 5000;

/** Amostras mantidas no buffer p/ média na criação de pins (~8s @ 1Hz). */
const POSE_BUFFER_SIZE = 8;

/** Média planar de lat/lng + média circular de heading das amostras frescas. */
function averagePoses(samples: GeospatialPose[]): GeospatialPose {
  const lat = samples.reduce((acc, p) => acc + p.latitude, 0) / samples.length;
  const lng = samples.reduce((acc, p) => acc + p.longitude, 0) / samples.length;
  const alt = samples.reduce((acc, p) => acc + p.altitude, 0) / samples.length;
  // Média circular do heading (vetores unitários)
  const sinSum = samples.reduce((acc, p) => acc + Math.sin((p.heading * Math.PI) / 180), 0);
  const cosSum = samples.reduce((acc, p) => acc + Math.cos((p.heading * Math.PI) / 180), 0);
  const heading = (((Math.atan2(sinSum, cosSum) * 180) / Math.PI) + 360) % 360;
  const acc = samples.reduce((a, p) => a + p.horizontalAccuracy, 0) / samples.length;
  return {
    latitude: lat,
    longitude: lng,
    altitude: alt,
    heading,
    horizontalAccuracy: acc,
    verticalAccuracy: samples.reduce((a, p) => a + p.verticalAccuracy, 0) / samples.length,
    headingAccuracy: samples.reduce((a, p) => a + p.headingAccuracy, 0) / samples.length,
    timestamp: samples[samples.length - 1]!.timestamp,
  };
}

/** Estatísticas de estabilidade das poses frescas do buffer. */
export interface PoseStability {
  /** Amostras frescas disponíveis. */
  sampleCount: number;
  /** Maior distância horizontal ao centroide (m) — ruído/deriva de posição. */
  posSpreadM: number;
  /** Maior desvio circular do heading médio (°) — ruído/deriva de orientação. */
  headingSpreadDeg: number;
}

const UNSTABLE: PoseStability = {
  sampleCount: 0,
  posSpreadM: Number.POSITIVE_INFINITY,
  headingSpreadDeg: Number.POSITIVE_INFINITY,
};

export function isPoseFresh(pose: GeospatialPose | null): pose is GeospatialPose {
  return pose !== null && Date.now() - pose.timestamp < GEO_POSE_FRESH_MS;
}

/**
 * Armazenamento da pose geospatial da câmera, coletada pela cena Viro
 * (que tem acesso ao `arSceneNavigator`). Substitui GPS+bússola quando
 * disponível: posição e heading ancorados na Terra e auto-corrigidos
 * pelo VPS do Google — a raiz da correção de "pins seguindo o celular".
 */
export function useGeospatialPose() {
  const poseRef = useRef<GeospatialPose | null>(null);
  const [pose, setPose] = useState<GeospatialPose | null>(null);
  /** null = desconhecido; true/false = suporte a Geospatial no device. */
  const [supported, setSupported] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  /** Ring buffer das últimas poses (p/ média na criação de pins). */
  const poseBufferRef = useRef<GeospatialPose[]>([]);

  const handleStatus = useCallback((isSupported: boolean, error?: string) => {
    setSupported((prev) => (prev === isSupported ? prev : isSupported));
    setLastError(error ?? null);
  }, []);

  const handlePose = useCallback((next: Omit<GeospatialPose, 'timestamp'>) => {
    const stamped: GeospatialPose = { ...next, timestamp: Date.now() };
    poseRef.current = stamped;
    setPose(stamped);
    const buffer = poseBufferRef.current;
    buffer.push(stamped);
    if (buffer.length > POSE_BUFFER_SIZE) buffer.shift();
  }, []);

  /**
   * Média das últimas poses frescas (reduz ruído ~√N na criação de pins).
   * Retorna null se não houver amostras frescas suficientes.
   */
  const averagedPose = useCallback((): GeospatialPose | null => {
    const fresh = poseBufferRef.current.filter(isPoseFresh);
    if (fresh.length === 0) return null;
    return averagePoses(fresh);
  }, []);

  /**
   * Estabilidade do buffer: espalhamento posicional (m) e de heading (°) das
   * poses frescas. Amostras ESTÁVEIS (spread baixo) = ruído independente em
   * torno do valor verdadeiro → usar a média é seguro (÷√N). Spread alto =
   * a pose ainda está CONVERGINDO/derivando → média seria sistemática-mente
   * atrasada (nunca parear com camPos nesse estado).
   */
  const stability = useCallback((): PoseStability => {
    const fresh = poseBufferRef.current.filter(isPoseFresh);
    if (fresh.length === 0) return UNSTABLE;

    const lat = fresh.reduce((a, p) => a + p.latitude, 0) / fresh.length;
    const lng = fresh.reduce((a, p) => a + p.longitude, 0) / fresh.length;

    let posSpreadM = 0;
    for (const p of fresh) {
      const { east, north } = geodeticToENU(lat, lng, 0, p.latitude, p.longitude, 0);
      posSpreadM = Math.max(posSpreadM, Math.hypot(east, north));
    }

    const sinSum = fresh.reduce((a, p) => a + Math.sin((p.heading * Math.PI) / 180), 0);
    const cosSum = fresh.reduce((a, p) => a + Math.cos((p.heading * Math.PI) / 180), 0);
    const meanRad = Math.atan2(sinSum, cosSum);
    let headingSpreadDeg = 0;
    for (const p of fresh) {
      const devRad = Math.atan2(
        Math.sin((p.heading * Math.PI) / 180 - meanRad),
        Math.cos((p.heading * Math.PI) / 180 - meanRad),
      );
      headingSpreadDeg = Math.max(headingSpreadDeg, Math.abs(devRad) * (180 / Math.PI));
    }

    return { sampleCount: fresh.length, posSpreadM, headingSpreadDeg };
  }, []);

  return {
    pose,
    poseRef,
    supported,
    lastError,
    handleStatus,
    handlePose,
    averagedPose,
    stability,
    isFresh: isPoseFresh(pose),
  };
}
