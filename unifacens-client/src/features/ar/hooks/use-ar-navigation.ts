import { useCallback, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import {
  calculateDistance,
  geodeticToENU,
  isPointInCampusBBox,
  normalizeDegrees,
  type Anchor,
} from 'shared';
import type { GeospatialPose } from '@/components/ar/hooks/use-geospatial-pose';
import type { NativeAnchorEntry } from '@/components/ar/hooks/use-native-anchors';
import { requestRoute } from '../services/routing-api';

export type NavInstruction = 'straight' | 'left' | 'right' | 'arrive';

/** Chevron da janela de navegação — key = arco (m) para reuso de nós Viro. */
export interface RouteChevron {
  key: number;
  pos: [number, number, number];
  angleDeg: number;
}

export interface ARRouteState {
  active: boolean;
  wgs84Path: Array<{ latitude: number; longitude: number }>;
  chevrons: RouteChevron[];
  distanceRemaining: number;
  targetName: string;
  isLoading: boolean;
  isRerouting: boolean;
  error?: string;
  mode: 'campus' | 'direct' | 'direct-ar';
  totalLengthM: number;
  progressArcM: number;
  offRouteM: number;
  instruction: NavInstruction;
  metersToTurn: number;
  headingToPathDeg: number | null;
  arrived: boolean;
}

interface UseARNavigationParams {
  /** Pose geospatial (Terra) da câmera — origem da rota e projeção de chevrons. */
  geoPoseRef: React.MutableRefObject<GeospatialPose | null>;
  /** Pose SLAM da câmera (para perna viva e distância). */
  cameraPosRef: React.MutableRefObject<[number, number, number]>;
  /**
   * Âncoras nativas resolvidas (cloud/geospatial) — quando o destino tem uma
   * entrada aqui, a rota usa a posição VISUAL (centimétrica, frame SLAM) em
   * vez do lat/lng GPS do banco (±5-15m indoor) — lição de device 2026-11-10:
   * "rota de 8.8m para um pin a 1.2m da câmera" porque a rota seguia o GPS.
   */
  nativeEntries?: Map<string, NativeAnchorEntry>;
}

// ── Constantes ───────────────────────────────────────────────────────────────
const CHEVRON_SPACING_M = 1;
const WINDOW_BEHIND_M = 0.5;
const WINDOW_AHEAD_M = 25;
const MAX_WINDOW_CHEVRONS = 30;
const ARRIVE_RADIUS_M = 3;
const OFFROUTE_THRESHOLD_M = 8;
const DIRECT_OFFROUTE_THRESHOLD_M = 3;
const OFFROUTE_SUSTAIN_MS = 3000;
const MIN_REROUTE_INTERVAL_MS = 5000;
const DIRECT_MIN_REROUTE_INTERVAL_MS = 4000;
const FINAL_WAYPOINT_TOLERANCE_M = 2;
const LIVE_LEG_THRESHOLD_M = 1.5;
const LIVE_LEG_LOOKAHEAD_M = 4;
/** Y do chão no espaço AR (câmera ~1.5m acima). */
const FLOOR_Y = -1.5;

const EMPTY_ROUTE: ARRouteState = {
  active: false,
  wgs84Path: [],
  chevrons: [],
  distanceRemaining: 0,
  targetName: '',
  isLoading: false,
  isRerouting: false,
  mode: 'direct',
  totalLengthM: 0,
  progressArcM: 0,
  offRouteM: 0,
  instruction: 'straight',
  metersToTurn: 0,
  headingToPathDeg: null,
  arrived: false,
};

// ── Geometria do path (metros locais ENU relativos ao primeiro waypoint) ────
interface PathGeometry {
  origin: { latitude: number; longitude: number };
  pts: Array<{ e: number; n: number }>;
  cum: number[];
  totalM: number;
}

function buildGeometry(path: Array<{ latitude: number; longitude: number }>): PathGeometry {
  const first = path[0]!;
  const pts = path.map((p) => {
    const { east, north } = geodeticToENU(first.latitude, first.longitude, 0, p.latitude, p.longitude, 0);
    return { e: east, n: north };
  });
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot(pts[i]!.e - pts[i - 1]!.e, pts[i]!.n - pts[i - 1]!.n));
  }
  return { origin: first, pts, cum, totalM: cum[cum.length - 1]! };
}

function userToLocal(geom: PathGeometry, lat: number, lng: number): { e: number; n: number } {
  const { east, north } = geodeticToENU(geom.origin.latitude, geom.origin.longitude, 0, lat, lng, 0);
  return { e: east, n: north };
}

function projectOntoPath(
  geom: PathGeometry,
  u: { e: number; n: number },
): { segIndex: number; arcM: number; offRouteM: number } {
  let best = { segIndex: 0, arcM: 0, offRouteM: Number.POSITIVE_INFINITY };
  for (let i = 0; i < geom.pts.length - 1; i++) {
    const a = geom.pts[i]!;
    const b = geom.pts[i + 1]!;
    const abx = b.e - a.e;
    const aby = b.n - a.n;
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((u.e - a.e) * abx + (u.n - a.n) * aby) / len2));
    const d = Math.hypot(u.e - (a.e + abx * t), u.n - (a.n + aby * t));
    if (d < best.offRouteM) {
      best = { segIndex: i, arcM: geom.cum[i]! + Math.sqrt(len2) * t, offRouteM: d };
    }
  }
  return best;
}

/** Converte WGS84 → AR world usando pose geospatial (Terra-ancorada). */
function geoToArWorld(
  pose: GeospatialPose,
  camPos: [number, number, number],
  lat: number,
  lng: number,
  alt: number,
): [number, number, number] {
  const { east, north, up } = geodeticToENU(pose.latitude, pose.longitude, pose.altitude, lat, lng, alt);
  const h = (pose.heading * Math.PI) / 180;
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);
  // Rotação do ENU para o frame AR (câmera no heading H):
  const arX = east * cosH - north * sinH;
  const arZ = -(east * sinH + north * cosH);
  // Offset relativo à câmera + posição da câmera no mundo AR
  return [camPos[0] + arX, FLOOR_Y + (up || 0), camPos[2] + arZ];
}

function pointAtArcAR(
  geom: PathGeometry,
  arPts: Array<[number, number, number]>,
  arcM: number,
): [number, number, number] {
  const s = Math.max(0, Math.min(geom.totalM, arcM));
  let i = 0;
  while (i < geom.cum.length - 2 && geom.cum[i + 1]! < s) i++;
  const segLen = geom.cum[i + 1]! - geom.cum[i]! || 1;
  const t = (s - geom.cum[i]!) / segLen;
  const a = arPts[i]!;
  const b = arPts[i + 1]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function chevronsForWindow(
  geom: PathGeometry,
  arPts: Array<[number, number, number]>,
  fromArc: number,
  toArc: number,
): RouteChevron[] {
  const out: RouteChevron[] = [];
  const first = Math.max(0, Math.ceil(fromArc / CHEVRON_SPACING_M) * CHEVRON_SPACING_M);
  let seg = 0;
  for (let s = first; s <= toArc && out.length < MAX_WINDOW_CHEVRONS; s += CHEVRON_SPACING_M) {
    while (seg < geom.cum.length - 2 && geom.cum[seg + 1]! < s) seg++;
    const a = arPts[seg]!;
    const b = arPts[seg + 1]!;
    const segLen = geom.cum[seg + 1]! - geom.cum[seg]! || 1;
    const t = Math.min(1, (s - geom.cum[seg]!) / segLen);
    out.push({
      key: Math.round(s),
      pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
      angleDeg: (-Math.atan2(b[0] - a[0], -(b[2] - a[2])) * 180) / Math.PI,
    });
  }
  return out;
}

function segmentBearing(geom: PathGeometry, i: number): number {
  const a = geom.pts[i]!;
  const b = geom.pts[i + 1]!;
  return (Math.atan2(b.e - a.e, b.n - a.n) * 180) / Math.PI;
}

function instructionAt(
  geom: PathGeometry,
  segIndex: number,
  arcM: number,
): { instruction: NavInstruction; metersToTurn: number } {
  const last = geom.pts.length - 2;
  let j = segIndex;
  let meters = Math.max(0, geom.cum[j + 1]! - arcM);
  while (j < last) {
    const delta = ((segmentBearing(geom, j + 1) - segmentBearing(geom, j) + 540) % 360) - 180;
    if (Math.abs(delta) >= 25) {
      return { instruction: delta > 0 ? 'right' : 'left', metersToTurn: Math.round(meters) };
    }
    j++;
    meters += geom.cum[j + 1]! - geom.cum[j]!;
  }
  return { instruction: 'arrive', metersToTurn: Math.round(Math.max(0, geom.totalM - arcM)) };
}

function bearingToPath(geom: PathGeometry, u: { e: number; n: number }, arcM: number): number {
  const s = Math.max(0, Math.min(geom.totalM, arcM + 5));
  let i = 0;
  while (i < geom.cum.length - 2 && geom.cum[i + 1]! < s) i++;
  const segLen = geom.cum[i + 1]! - geom.cum[i]! || 1;
  const t = (s - geom.cum[i]!) / segLen;
  const a = geom.pts[i]!;
  const b = geom.pts[i + 1]!;
  const look = { e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t };
  return normalizeDegrees((Math.atan2(look.e - u.e, look.n - u.n) * 180) / Math.PI);
}

/**
 * Hook de navegação AR pós-WorldAnchor:
 * - Origem e projeção via POSE GEOSPATIAL da câmera (Terra-ancorada)
 * - Chevrons projetados com geoToArWorld (pose + câmera SLAM)
 * - Perna viva nos pés do usuário quando fora da polyline
 * - Reroute ágil em modo direto, conservador no campus
 */
export function useARNavigation({ geoPoseRef, cameraPosRef, nativeEntries }: UseARNavigationParams) {
  const [route, setRoute] = useState<ARRouteState>(EMPTY_ROUTE);
  const routeRef = useRef<ARRouteState>(EMPTY_ROUTE);
  const geometryRef = useRef<PathGeometry | null>(null);
  const arPtsRef = useRef<Array<[number, number, number]>>([]);
  const targetRef = useRef<Anchor | null>(null);
  const lastUserWgsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const offRouteSinceRef = useRef<number | null>(null);
  const lastRerouteAtRef = useRef(0);
  const reroutingRef = useRef(false);

  const commitRoute = useCallback((next: ARRouteState) => {
    routeRef.current = next;
    setRoute(next);
  }, []);

  const failRoute = useCallback(
    (targetName: string, message: string) => {
      commitRoute({ ...EMPTY_ROUTE, targetName, error: message });
      setTimeout(() => {
        if (routeRef.current.error) commitRoute(EMPTY_ROUTE);
      }, 4000);
    },
    [commitRoute],
  );

  /** Projeta waypoints WGS84 → AR usando pose geospatial atual. */
  const projectPath = useCallback(
    (path: Array<{ latitude: number; longitude: number }>): Array<[number, number, number]> => {
      const pose = geoPoseRef.current;
      const camPos = cameraPosRef.current;
      if (!pose) return path.map(() => [0, FLOOR_Y, 0] as [number, number, number]);
      // alt = pose.altitude → up = 0 → y = FLOOR_Y (chão). A subtração extra
      // de 1.5m aqui DUPLICAVA o FLOOR_Y e enterrava os chevrons 1.5m abaixo
      // do chão — removida.
      return path.map((p) =>
        geoToArWorld(pose, camPos, p.latitude, p.longitude, pose.altitude),
      );
    },
    [geoPoseRef, cameraPosRef],
  );

  /** (Re)constrói a sessão a partir de um path WGS84. */
  const installRoute = useCallback(
    (path: Array<{ latitude: number; longitude: number }>, targetName: string) => {
      const geom = buildGeometry(path);
      geometryRef.current = geom;
      arPtsRef.current = projectPath(path);
      offRouteSinceRef.current = null;
      const mode: 'campus' | 'direct' = isPointInCampusBBox(
        geom.origin.latitude,
        geom.origin.longitude,
      )
        ? 'campus'
        : 'direct';

      const instr = instructionAt(geom, 0, 0);
      commitRoute({
        ...EMPTY_ROUTE,
        active: true,
        mode,
        wgs84Path: path,
        chevrons: chevronsForWindow(geom, arPtsRef.current, 0, Math.min(WINDOW_AHEAD_M, geom.totalM)),
        distanceRemaining: Math.round(geom.totalM),
        targetName,
        totalLengthM: geom.totalM,
        instruction: instr.instruction,
        metersToTurn: instr.metersToTurn,
      });
      console.log(
        `[AR Nav] rota instalada [${mode}]: ${path.length} pts, ${geom.totalM.toFixed(1)}m`,
      );
    },
    [projectPath, commitRoute],
  );

  /** Recalcula a rota da posição atual. */
  const reroute = useCallback(async () => {
    const target = targetRef.current;
    const userWgs = lastUserWgsRef.current;
    if (!target?.latitude || !target?.longitude || !userWgs || reroutingRef.current) return;

    reroutingRef.current = true;
    lastRerouteAtRef.current = Date.now();
    commitRoute({ ...routeRef.current, isRerouting: true });
    try {
      const response = await requestRoute(
        { latitude: userWgs.latitude, longitude: userWgs.longitude },
        { anchorId: target.id },
      );
      let path = response.path;
      const last = path[path.length - 1];
      if (
        last &&
        calculateDistance(last.latitude, last.longitude, target.latitude, target.longitude) >
          FINAL_WAYPOINT_TOLERANCE_M
      ) {
        path = [...path, { latitude: target.latitude, longitude: target.longitude }];
      }
      installRoute(path, target.name);
    } catch {
      commitRoute({ ...routeRef.current, isRerouting: false });
    } finally {
      reroutingRef.current = false;
    }
  }, [installRoute, commitRoute]);

  /**
   * Instala uma rota "direct-AR": linha reta da posição SLAM da câmera até a
   * posição VISUAL do destino (cloud anchor resolvida, centimétrica) — 100%
   * no frame SLAM da sessão, sem GPS, sem backend, sem geospatial. Este é o
   * modo correto para pins cloud indoor (lição 2026-11-10: rota de 8.8m para
   * um pin a 1.2m — o GPS best-effort do banco erra a direção).
   */
  const installDirectARRoute = useCallback(
    (anchor: Anchor, targetPos: [number, number, number]) => {
      const cam = cameraPosRef.current;
      const dx = targetPos[0] - cam[0];
      const dz = targetPos[2] - cam[2];
      const dist = Math.hypot(dx, dz);
      if (dist < 0.5) {
        // Já em cima do destino
        commitRoute({
          ...EMPTY_ROUTE,
          active: true,
          mode: 'direct-ar',
          targetName: anchor.name,
          distanceRemaining: 0,
          instruction: 'arrive',
          arrived: true,
        });
        Vibration.vibrate([0, 120, 80, 160]);
        console.log('[AR Nav] direct-AR: já está no destino');
        setTimeout(() => {
          commitRoute(EMPTY_ROUTE);
          targetRef.current = null;
        }, 3000);
        return;
      }

      // Direção da câmera → destino (no plano XZ, chevrons no chão)
      const angleDeg = (-Math.atan2(dx, -dz) * 180) / Math.PI;
      const instr: NavInstruction =
        Math.abs(angleDeg) > 45 ? (angleDeg > 0 ? 'right' : 'left') : 'straight';
      const totalM = Math.max(dist, 1);

      // Chevrons: do usuário até o destino, espaçados 1m (sem janela — rota curta)
      const chevrons: RouteChevron[] = [];
      const num = Math.min(Math.ceil(totalM / CHEVRON_SPACING_M), MAX_WINDOW_CHEVRONS);
      for (let i = 1; i <= num; i++) {
        const t = (i * CHEVRON_SPACING_M) / totalM;
        chevrons.push({
          key: i,
          pos: [
            cam[0] + dx * t,
            FLOOR_Y,
            cam[2] + dz * t,
          ] as [number, number, number],
          angleDeg,
        });
      }

      // Guardar a posição AR do destino para updateProgress
      directARTargetRef.current = targetPos;

      commitRoute({
        ...EMPTY_ROUTE,
        active: true,
        mode: 'direct-ar',
        targetName: anchor.name,
        chevrons,
        distanceRemaining: Math.round(dist),
        totalLengthM: totalM,
        instruction: instr,
        metersToTurn: Math.round(dist),
        arrived: false,
      });
      console.log(
        `[AR Nav] direct-AR instalada: ${dist.toFixed(1)}m [${instr}] — pin "${anchor.name}" pos=[${targetPos.map((v) => v.toFixed(2)).join(', ')}]`,
      );
    },
    [cameraPosRef, commitRoute],
  );

  /** Posição AR do destino em modo direct-AR (para updateProgress). */
  const directARTargetRef = useRef<[number, number, number] | null>(null);

  /** Inicia navegação para uma âncora. */
  const startNavigation = useCallback(
    async (anchor: Anchor) => {
      // ── PRIORIDADE 1: rota direct-AR (visual) ────────────────────────────
      // Se o destino tem entrada nativa resolvida (cloud anchor), a posição
      // VISUAL é centimétrica — usar direto, sem GPS/backend (lição 8.8m).
      const nativeEntry = nativeEntries?.get(anchor.id);
      if (nativeEntry && nativeEntry.position) {
        installDirectARRoute(anchor, nativeEntry.position);
        return;
      }

      // ── FALLBACK: rota por lat/lng (GPS → backend) ──────────────────────
      const pose = geoPoseRef.current;
      if (!pose) {
        failRoute(anchor.name, 'Aguardando sinal GPS/Geospatial para navegar.');
        return;
      }
      if (!anchor.latitude || !anchor.longitude) return;

      targetRef.current = anchor;
      commitRoute({
        ...routeRef.current,
        isLoading: true,
        targetName: anchor.name,
        error: undefined,
        arrived: false,
      });

      try {
        const mode = isPointInCampusBBox(pose.latitude, pose.longitude) ? 'campus' : 'direct';
        console.log(
          `[AR Nav] origin (geospatial): ${pose.latitude.toFixed(6)}, ${pose.longitude.toFixed(6)} [${mode}]`,
        );

        const response = await requestRoute(
          { latitude: pose.latitude, longitude: pose.longitude },
          { anchorId: anchor.id },
        );

        let path = response.path;
        const last = path[path.length - 1];
        if (
          last &&
          calculateDistance(last.latitude, last.longitude, anchor.latitude, anchor.longitude) >
            FINAL_WAYPOINT_TOLERANCE_M
        ) {
          path = [...path, { latitude: anchor.latitude, longitude: anchor.longitude }];
        }

        installRoute(path, anchor.name);
      } catch {
        failRoute(
          anchor.name,
          'Não foi possível calcular a rota.',
        );
      }
    },
    [geoPoseRef, installRoute, failRoute, commitRoute, nativeEntries, installDirectARRoute],
  );

  /** Tick de progresso (~1s): desliza janela, perna viva, chegada, reroute. */
  const updateProgress = useCallback(
    (userLat: number, userLng: number) => {
      const current = routeRef.current;
      const geom = geometryRef.current;

      // ── MODO direct-AR: progresso pela posição SLAM (sem geospatial) ──
      if (current.active && current.mode === 'direct-ar') {
        const target = directARTargetRef.current;
        if (!target || current.arrived) return;
        const cam = cameraPosRef.current;
        const dx = target[0] - cam[0];
        const dz = target[2] - cam[2];
        const dist = Math.hypot(dx, dz);

        if (dist <= ARRIVE_RADIUS_M) {
          Vibration.vibrate([0, 120, 80, 160]);
          commitRoute({
            ...current,
            chevrons: [],
            distanceRemaining: 0,
            instruction: 'arrive',
            metersToTurn: 0,
            arrived: true,
          });
          console.log('[AR Nav] 🎉 direct-AR: chegou ao destino');
          setTimeout(() => {
            commitRoute(EMPTY_ROUTE);
            directARTargetRef.current = null;
            targetRef.current = null;
          }, 4000);
          return;
        }

        // Reposiciona chevrons da câmera ao destino (o caminho anda)
        const angleDeg = (-Math.atan2(dx, -dz) * 180) / Math.PI;
        const chevrons: RouteChevron[] = [];
        const num = Math.min(Math.ceil(dist / CHEVRON_SPACING_M), MAX_WINDOW_CHEVRONS);
        for (let i = 1; i <= num; i++) {
          const t = (i * CHEVRON_SPACING_M) / dist;
          chevrons.push({
            key: i,
            pos: [cam[0] + dx * t, FLOOR_Y, cam[2] + dz * t] as [number, number, number],
            angleDeg,
          });
        }

        commitRoute({
          ...current,
          chevrons,
          distanceRemaining: Math.round(dist),
          metersToTurn: Math.round(dist),
        });
        return;
      }

      if (!current.active || !geom || current.arrived) return;

      lastUserWgsRef.current = { latitude: userLat, longitude: userLng };
      const u = userToLocal(geom, userLat, userLng);
      const proj = projectOntoPath(geom, u);
      const instr = instructionAt(geom, proj.segIndex, proj.arcM);
      const heading = bearingToPath(geom, u, proj.arcM);

      const last = current.wgs84Path[current.wgs84Path.length - 1]!;
      const distToEnd = calculateDistance(userLat, userLng, last.latitude, last.longitude);
      const arrivedNow = distToEnd <= ARRIVE_RADIUS_M;

      if (arrivedNow) {
        Vibration.vibrate([0, 120, 80, 160]);
        commitRoute({
          ...current,
          chevrons: [],
          progressArcM: proj.arcM,
          offRouteM: proj.offRouteM,
          distanceRemaining: Math.round(distToEnd),
          instruction: 'arrive',
          metersToTurn: 0,
          headingToPathDeg: heading,
          arrived: true,
        });
        console.log('[AR Nav] 🎉 chegou ao destino');
        setTimeout(() => {
          commitRoute(EMPTY_ROUTE);
          geometryRef.current = null;
          arPtsRef.current = [];
          targetRef.current = null;
          offRouteSinceRef.current = null;
        }, 4000);
        return;
      }

      // Janela + perna viva
      const from = Math.max(0, proj.arcM - WINDOW_BEHIND_M);
      const to = Math.min(geom.totalM, proj.arcM + WINDOW_AHEAD_M);
      let chevrons = chevronsForWindow(geom, arPtsRef.current, from, to);
      const pose = geoPoseRef.current;
      if (pose && proj.offRouteM > LIVE_LEG_THRESHOLD_M) {
        const camPos = cameraPosRef.current;
        const livePos: [number, number, number] = [camPos[0], FLOOR_Y, camPos[2]];
        const ahead = pointAtArcAR(geom, arPtsRef.current, proj.arcM + LIVE_LEG_LOOKAHEAD_M);
        const dx = ahead[0] - livePos[0];
        const dz = ahead[2] - livePos[2];
        if (Math.hypot(dx, dz) >= 0.5) {
          chevrons = [
            { key: -1, pos: livePos, angleDeg: (-Math.atan2(dx, -dz) * 180) / Math.PI },
            ...chevrons,
          ];
        }
      }

      commitRoute({
        ...current,
        chevrons,
        progressArcM: proj.arcM,
        offRouteM: proj.offRouteM,
        distanceRemaining: Math.round(distToEnd),
        instruction: instr.instruction,
        metersToTurn: instr.metersToTurn,
        headingToPathDeg: heading,
      });

      // Reroute por desvio sustentado
      const isDirect = current.mode === 'direct';
      const offThreshold = isDirect ? DIRECT_OFFROUTE_THRESHOLD_M : OFFROUTE_THRESHOLD_M;
      const minReroute = isDirect ? DIRECT_MIN_REROUTE_INTERVAL_MS : MIN_REROUTE_INTERVAL_MS;
      const now = Date.now();
      if (proj.offRouteM > offThreshold) {
        if (offRouteSinceRef.current === null) offRouteSinceRef.current = now;
      } else {
        offRouteSinceRef.current = null;
      }
      if (
        offRouteSinceRef.current !== null &&
        now - offRouteSinceRef.current >= OFFROUTE_SUSTAIN_MS &&
        now - lastRerouteAtRef.current >= minReroute &&
        !reroutingRef.current
      ) {
        void reroute();
      }
    },
    [reroute, commitRoute, geoPoseRef, cameraPosRef, installDirectARRoute, nativeEntries],
  );

  /** Encerra a navegação. */
  const stopNavigation = useCallback(() => {
    commitRoute(EMPTY_ROUTE);
    geometryRef.current = null;
    arPtsRef.current = [];
    targetRef.current = null;
    offRouteSinceRef.current = null;
    reroutingRef.current = false;
    directARTargetRef.current = null;
  }, [commitRoute]);

  return { route, startNavigation, stopNavigation, updateProgress };
}
