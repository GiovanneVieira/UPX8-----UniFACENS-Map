import { Inject, Injectable } from '@nestjs/common';
import type { OrphanAnchor } from 'shared';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { anchors } from '../../db/schema.js';
import {
  RV_CLOUD_ANCHOR_CLIENT,
  type RvCloudAnchorClient,
} from './rv-cloud-anchor.client.js';

/**
 * Âncoras órfãs — diff (plataforma ReactVision − banco). Uma âncora fica
 * órfã quando o hosting conclui (cloudAnchorId existe, TTL 30d rodando) mas
 * o registro no banco nunca nasceu (ex.: modal de criação fechado na fase
 * `hosted`, antes do "Salvar Ponto"). A adoção é um POST /anchors comum
 * reaproveitando o cloudAnchorId — o pin passa a resolver normalmente.
 *
 * Custo: 1 fetch RV (secret key, list) + 1 query banco (cloudAnchorIds) —
 * diff em memória, zero N+1.
 */
@Injectable()
export class OrphanAnchorsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(RV_CLOUD_ANCHOR_CLIENT) private readonly rv: RvCloudAnchorClient,
  ) {}

  async listOrphans(): Promise<OrphanAnchor[]> {
    const listed = await this.rv.listAll();
    // Sem secret key não há fonte de verdade da plataforma — lista vazia
    // (o painel sinaliza a env ausente, não inventa órfãs).
    if (!listed) return [];

    const knownIds = await this.selectCloudAnchorIds();

    return [...listed.values()]
      .filter((anchor) => !knownIds.has(anchor.id))
      .map((anchor) => ({
        cloudAnchorId: anchor.id,
        // IDs do LIST são sempre do projeto RV (UUID) — classificação
        // defensiva por prefixo (§15.12: IDs de providers não são intercambiáveis).
        provider: anchor.id.startsWith('ua-') ? ('google' as const) : ('reactvision' as const),
        keypoints: anchor.keypoint_count ?? null,
        resolveCount: anchor.resolve_count ?? null,
        successfulResolveCount: anchor.successful_resolve_count ?? null,
        averageConfidence: anchor.average_confidence ?? null,
        gps:
          anchor.latitude != null && anchor.longitude != null
            ? { latitude: anchor.latitude, longitude: anchor.longitude }
            : null,
        hostedAt: anchor.created_at ?? null,
      }))
      .sort((a, b) => (b.hostedAt ?? '').localeCompare(a.hostedAt ?? ''));
  }

  /** Set com os cloudAnchorIds já registrados no banco (1 query, só a coluna). */
  private async selectCloudAnchorIds(): Promise<Set<string>> {
    const rows = await this.db
      .select({ cloudAnchorId: anchors.cloudAnchorId })
      .from(anchors);
    return new Set(
      rows
        .map((row) => row.cloudAnchorId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
  }
}
