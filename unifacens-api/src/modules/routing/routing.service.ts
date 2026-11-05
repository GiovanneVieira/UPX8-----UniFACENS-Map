import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../db/database.module.js';
import type { DrizzleDB } from '../../db/database.module.js';
import { campusObstacles, campusEntrances, anchors } from '../../db/schema.js';
import type { RouteRequest, RouteResponse, RoutePoint, RouteSegment } from 'shared';
import { buildGrid, type WalkableGrid, type ObstaclePolygon } from './grid-builder.js';
import { findRoute } from './astar.js';
import { CAMPUS_FIXTURE } from './campus-fixture.js';


function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class RoutingService implements OnModuleInit {
  private grid: WalkableGrid | null = null;
  private entrances: Array<{ id: string; name: string; latitude: number; longitude: number; obstacleId: string | null }> = [];

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async onModuleInit() {
    await this.seedFixtureIfEmpty();
    await this.rebuildGrid();
  }

  /**
   * Calcula a rota pedestrian entre origem e destino.
   * - Target = anchor: resolve a entrada do prédio mais próxima se a âncora
   *   estiver dentro de um obstáculo; caso contrário roteia direto.
   * - Retorna polyline WGS84 suavizada + distância + segmentos de instrução.
   */
  async route(request: RouteRequest): Promise<RouteResponse> {
    if (!this.grid) {
      throw new Error('Grid do campus não inicializado.');
    }

    const { origin, target } = request;

    // Resolve o destino em lat/lng
    let targetLat: number;
    let targetLng: number;

    if ('anchorId' in target) {
      const [anchor] = await this.db
        .select({ latitude: anchors.latitude, longitude: anchors.longitude })
        .from(anchors)
        .where(eq(anchors.id, target.anchorId))
        .limit(1);
      if (!anchor?.latitude || !anchor?.longitude) {
        throw new Error(`Âncora ${target.anchorId} não encontrada ou sem coordenadas.`);
      }
      targetLat = anchor.latitude;
      targetLng = anchor.longitude;
    } else if ('latitude' in target) {
      targetLat = target.latitude;
      targetLng = target.longitude;
    } else {
      throw new Error('Tipo de destino não suportado ainda (placeId em roadmap).');
    }

    const path = findRoute(this.grid, origin.latitude, origin.longitude, targetLat, targetLng);
    if (!path) {
      throw new Error('Não foi possível encontrar um caminho caminhável.');
    }

    const distanceMeters = path.reduce((acc, point, i) => {
      if (i === 0) return 0;
      return acc + haversine(path[i - 1]!.latitude, path[i - 1]!.longitude, point.latitude, point.longitude);
    }, 0);

    const segments = this.buildSegments(path);

    return { path, distanceMeters: Math.round(distanceMeters * 10) / 10, segments };
  }

  /** Gera instruções simplificadas ("siga reto", "vire à esquerda") a partir da polyline. */
  private buildSegments(path: RoutePoint[]): RouteSegment[] {
    if (path.length < 2) return [{ instruction: 'arrive', meters: 0 }];

    const segments: RouteSegment[] = [];
    let currentBearing: number | null = null;

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1]!;
      const curr = path[i]!;
      const bearing =
        (Math.atan2(
          curr.longitude - prev.longitude,
          curr.latitude - prev.latitude,
        ) *
          180) /
        Math.PI;
      const meters = haversine(prev.latitude, prev.longitude, curr.latitude, curr.longitude);

      if (currentBearing === null) {
        currentBearing = bearing;
        segments.push({ instruction: 'straight', meters: Math.round(meters) });
        continue;
      }

      const delta = ((bearing - currentBearing + 540) % 360) - 180;
      if (Math.abs(delta) < 25) {
        segments[segments.length - 1]!.meters += Math.round(meters);
      } else if (delta > 0) {
        segments.push({ instruction: 'right', meters: Math.round(meters) });
      } else {
        segments.push({ instruction: 'left', meters: Math.round(meters) });
      }
      currentBearing = bearing;
    }

    segments.push({ instruction: 'arrive', meters: 0 });
    return segments;
  }

  /** Popula as tabelas campus_obstacles/campus_entrances com a fixture (idempotente). */
  private async seedFixtureIfEmpty() {
    const [existing] = await this.db.select().from(campusObstacles).limit(1);
    if (existing) return;

    console.log('[Routing] Semeando malha caminhável do campus (fixture)...');
    for (const obs of CAMPUS_FIXTURE.obstacles) {
      await this.db.insert(campusObstacles).values({
        id: obs.id,
        name: obs.name,
        category: obs.category,
        polygon: obs.polygon,
      });
    }
    for (const ent of CAMPUS_FIXTURE.entrances) {
      await this.db.insert(campusEntrances).values({
        id: ent.id,
        name: ent.name,
        latitude: ent.latitude,
        longitude: ent.longitude,
        altitude: ent.altitude ?? null,
        accessible: ent.accessible ?? true,
        obstacleId: ent.obstacleId ?? null,
      });
    }
    console.log('[Routing] ✅ Malha caminhável semeada.');
  }

  /** Rebuilda o grid em memória a partir das tabelas. */
  private async rebuildGrid() {
    const obstacles: ObstaclePolygon[] = await this.db
      .select({ id: campusObstacles.id, polygon: campusObstacles.polygon })
      .from(campusObstacles);

    this.grid = buildGrid(CAMPUS_FIXTURE.bbox, obstacles);
    this.entrances = await this.db
      .select({
        id: campusEntrances.id,
        name: campusEntrances.name,
        latitude: campusEntrances.latitude,
        longitude: campusEntrances.longitude,
        obstacleId: campusEntrances.obstacleId,
      })
      .from(campusEntrances);

    console.log(
      `[Routing] Grid ${this.grid.cols}x${this.grid.rows} células (${this.grid.cellSizeM}m), ` +
        `${obstacles.length} obstáculos, ${this.entrances.length} entradas.`,
    );
  }
}
