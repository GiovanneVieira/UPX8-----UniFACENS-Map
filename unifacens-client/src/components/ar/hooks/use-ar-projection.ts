import { useCallback, useEffect, useRef, useState } from 'react';
import { geodeticToENU, type Anchor } from 'shared';
import type { NativeAnchorEntry } from './use-native-anchors';
import type { GeospatialPose } from './use-geospatial-pose';

interface UseARProjectionParams {
  /** Âncoras vindas do server state (TanStack Query). */
  serverAnchors: Anchor[] | undefined;
  /** Âncoras nativas (pinId -> posição AR mantida pelo ARCore). */
  nativeEntries: Map<string, NativeAnchorEntry>;
  /** Pose geospatial da câmera (para fallback de projeção). */
  geoPoseRef: React.MutableRefObject<GeospatialPose | null>;
  /** Pose instantânea da câmera no mundo AR. */
  cameraPosRef: React.MutableRefObject<[number, number, number]>;
}

/** Fallback: projeta WGS84→AR usando a pose geospatial (sem âncora nativa). */
function fallbackProject(
  pose: GeospatialPose,
  camPos: [number, number, number],
  lat: number,
  lng: number,
): [number, number, number] {
  const { east, north } = geodeticToENU(pose.latitude, pose.longitude, 0, lat, lng, 0);
  const h = (pose.heading * Math.PI) / 180;
  const arX = east * Math.cos(h) - north * Math.sin(h);
  const arZ = -(east * Math.sin(h) + north * Math.cos(h));
  return [camPos[0] + arX, -1.5, camPos[2] + arZ];
}

/** Acurácia máxima da pose para o FALLBACK projetar pins (m). */
const FALLBACK_MAX_ACCURACY_M = 15;
/** Sem pins visíveis por este tempo → usa qualquer pose (best-effort). */
const FALLBACK_TIMEOUT_MS = 15_000;

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
 * Projeção de âncoras pós-WorldAnchor — DUAS fontes:
 *
 * 1. Âncora NATIVA (ARCore mantém Terra-ancorada) — prioridade máxima
 * 2. FALLBACK via pose geospatial — quando a âncora nativa falha,
 *    ainda está resolvendo, ou retornou posição inválida
 *
 * Pin invisível APENAS quando não há nem âncora nativa nem pose geospatial.
 */
export function useARProjection({
  serverAnchors,
  nativeEntries,
  geoPoseRef,
  cameraPosRef,
}: UseARProjectionParams) {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  /** Momento em que o primeiro serverAnchor chegou sem pin visível. */
  const waitingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!serverAnchors) {
      setAnchors([]);
      waitingSinceRef.current = null;
      return;
    }
    const camPos = cameraPosRef.current;
    const pose = geoPoseRef.current;
    const projected: Anchor[] = [];

    for (const anchor of serverAnchors) {
      if (
        typeof anchor.latitude !== 'number' ||
        !Number.isFinite(anchor.latitude) ||
        typeof anchor.longitude !== 'number' ||
        !Number.isFinite(anchor.longitude)
      ) {
        continue;
      }

      // 1. Âncora nativa (ARCore mantém) — se válida, usa SEMPRE
      const native = nativeEntries.get(anchor.id);
      if (native && isValidPosition(native.position)) {
        const dist = Math.hypot(
          native.position[0] - camPos[0],
          native.position[1] - camPos[1],
          native.position[2] - camPos[2],
        );
        projected.push({
          ...anchor,
          arPosition: native.position,
          distanceMeters: Number(dist.toFixed(2)),
        });
        continue;
      }

      // 2. FALLBACK: projeção via pose geospatial — quando acurácia é boa
      //    OU quando já esperou demais (best-effort: melhor impreciso que invisível)
      const now = Date.now();
      const timedOut = waitingSinceRef.current !== null && now - waitingSinceRef.current >= FALLBACK_TIMEOUT_MS;
      if (pose && (pose.horizontalAccuracy <= FALLBACK_MAX_ACCURACY_M || timedOut)) {
        const fbPos = fallbackProject(pose, camPos, anchor.latitude, anchor.longitude);
        if (isValidPosition(fbPos)) {
          const dist = Math.hypot(
            fbPos[0] - camPos[0],
            fbPos[1] - camPos[1],
            fbPos[2] - camPos[2],
          );
          projected.push({
            ...anchor,
            arPosition: fbPos,
            distanceMeters: Number(dist.toFixed(2)),
          });
        }
      }
    }

    // Rastreia se há pins esperando (para o timeout best-effort)
    if (projected.length === 0 && serverAnchors.length > 0) {
      if (waitingSinceRef.current === null) waitingSinceRef.current = Date.now();
    } else {
      waitingSinceRef.current = null;
    }

    setAnchors(projected);
  }, [serverAnchors, nativeEntries, geoPoseRef, cameraPosRef]);

  /** Remove a âncora das listas locais (exclusão otimista). */
  const removeAnchorLocal = useCallback((id: string) => {
    setAnchors((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return {
    anchors,
    removeAnchorLocal,
  };
}
