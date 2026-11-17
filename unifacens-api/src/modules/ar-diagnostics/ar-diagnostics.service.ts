import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { anchors } from '../../db/schema.js';
import {
  RV_CLOUD_ANCHOR_CLIENT,
  type RvAnchorResponse,
  type RvCloudAnchorClient,
  type RvListedAnchor,
} from './rv-cloud-anchor.client.js';

/**
 * ── Diagnóstico de Cloud Anchors (ReactVision Spatial) ────────────────────
 * Cruza os pins do banco com a API REST do ReactVision e expõe a QUALIDADE real
 * de cada âncora: keypoint_count (doc recomenda 300–500 para relocalização
 * confiável), resolve_count / successful_resolve_count / average_confidence
 * e o GPS tag embutido no hosting.
 *
 * Classificação de cloudAnchorId (lição de device 2026-11-10 — a divergência
 * "precisão horrível entre sessões" vinha de pins de providers misturados):
 * - UUID  → provider reactvision (CONSULTÁVEL na API)
 * - ua-<hex> → provider arcore/Google (NÃO existe no backend RV)
 * - coord-* / ua-facens-* → sintéticos (hosting falhou / seeds — nunca resolvem)
 *
 * Acesso à plataforma vive no adapter RV_CLOUD_ANCHOR_CLIENT (seam compartilhado
 * com o diff de órfãs; fake em memória nos testes).
 */

/** Doc: faixa recomendada de keypoints para âncora confiável. */
const RV_MIN_KEYPOINTS = 300;

export interface CloudAnchorDiagnostic {
  pinId: string;
  name: string;
  cloudAnchorId: string | null;
  provider: 'reactvision' | 'google' | 'synthetic' | 'seed' | 'none';
  /** Detalhe da API RV (somente provider reactvision). */
  rv: {
    keypoints: number | null;
    descriptors: number | null;
    resolves: number | null;
    successfulResolves: number | null;
    averageConfidence: number | null;
    lastResolvedAt: string | null;
    gps: { lat: number; lng: number; alt: number } | null;
    /** Verdadeiro quando keypoints ≥ 300 (faixa recomendada). */
    qualityOk: boolean | null;
  } | null;
  /** Erro da consulta RV (ex.: ANCHOR_NOT_FOUND), se houver. */
  rvError: string | null;
}

function rvDetailFromListed(listed: RvListedAnchor) {
  const keypoints = listed.keypoint_count ?? null;
  return {
    keypoints,
    descriptors: listed.descriptor_count ?? null,
    resolves: listed.resolve_count ?? null,
    successfulResolves: listed.successful_resolve_count ?? null,
    averageConfidence: listed.average_confidence ?? null,
    lastResolvedAt: listed.last_resolved_at ?? null,
    gps:
      listed.latitude != null && listed.longitude != null
        ? { lat: listed.latitude, lng: listed.longitude, alt: listed.altitude ?? 0 }
        : null,
    qualityOk: keypoints != null ? keypoints >= RV_MIN_KEYPOINTS : null,
  };
}

function rvDetailFromAnchor(a: NonNullable<RvAnchorResponse['anchor']>) {
  const keypoints = a.keypoint_count ?? null;
  return {
    keypoints,
    descriptors: a.descriptor_count ?? null,
    resolves: a.resolve_count ?? null,
    successfulResolves: a.successful_resolve_count ?? null,
    averageConfidence: a.average_confidence ?? null,
    lastResolvedAt: a.last_resolved_at ?? null,
    gps:
      a.latitude != null && a.longitude != null
        ? { lat: a.latitude, lng: a.longitude, alt: a.altitude ?? 0 }
        : null,
    qualityOk: keypoints != null ? keypoints >= RV_MIN_KEYPOINTS : null,
  };
}

@Injectable()
export class ArDiagnosticsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(RV_CLOUD_ANCHOR_CLIENT) private readonly rv: RvCloudAnchorClient,
  ) {}

  private classify(cloudAnchorId: string | null): CloudAnchorDiagnostic['provider'] {
    if (!cloudAnchorId) return 'none';
    if (cloudAnchorId.startsWith('coord-')) return 'synthetic';
    if (cloudAnchorId.startsWith('ua-facens-')) return 'seed';
    if (cloudAnchorId.startsWith('ua-')) return 'google';
    return 'reactvision'; // UUID do backend RV
  }

  /** Painel de qualidade dos pins x âncoras RV (GET /ar/diagnostics/cloud-anchors). */
  async cloudAnchorsPanel(): Promise<CloudAnchorDiagnostic[]> {
    const rows = await this.db.select().from(anchors).orderBy(desc(anchors.createdAt)).limit(100);

    // Caminho LIST (secret key): 1 request, todas as âncoras + campos privados.
    const listByCloudId = await this.rv.listAll();

    return Promise.all(
      rows.map(async (row) => {
        const provider = this.classify(row.cloudAnchorId);
        const base: CloudAnchorDiagnostic = {
          pinId: row.id,
          name: row.name,
          cloudAnchorId: row.cloudAnchorId,
          provider,
          rv: null,
          rvError: null,
        };
        if (provider !== 'reactvision' || !row.cloudAnchorId) return base;

        // Hit no mapa do list (se disponível); senão GET individual (client).
        const listed = listByCloudId?.get(row.cloudAnchorId) ?? null;
        if (listed) {
          return { ...base, rv: rvDetailFromListed(listed) };
        }
        if (listByCloudId) {
          // List disponível mas a âncora não está lá (hospedada em outro
          // projeto/excluída) — sem fallback de client key (a secret já cobre).
          return { ...base, rvError: 'ANCHOR_NOT_IN_PROJECT' };
        }

        try {
          const body = await this.rv.get(row.cloudAnchorId);
          if (body.error || !body.anchor) {
            return { ...base, rvError: body.error?.code ?? 'SEM_ANCORAS' };
          }
          return { ...base, rv: rvDetailFromAnchor(body.anchor) };
        } catch (err) {
          return { ...base, rvError: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }
}

