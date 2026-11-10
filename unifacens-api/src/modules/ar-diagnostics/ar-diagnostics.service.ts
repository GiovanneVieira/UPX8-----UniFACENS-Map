import { Inject, Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { anchors } from '../../db/schema.js';

/**
 * ── Diagnóstico de Cloud Anchors (ReactVision Spatial) ────────────────────
 * Cruza os pins do banco com a API REST do ReactVision
 * (https://platform.reactvision.xyz/functions/v1) e expõe a QUALIDADE real
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
 * Auth: client key aceita GET por ID e nearby (300/min por IP); o LIST
 * completo exige secret key (roadmap: criar rv_secret_ no Editor).
 */

const RV_BASE_URL = 'https://platform.reactvision.xyz/functions/v1';
const RV_FETCH_TIMEOUT_MS = 10_000;
/** Doc: faixa recomendada de keypoints para âncora confiável. */
const RV_MIN_KEYPOINTS = 300;

interface RvAnchorResponse {
  anchor?: {
    id: string;
    keypoint_count?: number | null;
    descriptor_count?: number | null;
    resolve_count?: number | null;
    successful_resolve_count?: number | null;
    average_confidence?: number | null;
    last_resolved_at?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    altitude?: number | null;
    platform?: string | null;
    created_at?: string | null;
  };
  error?: { code: string; message: string };
}

/** Registro do LIST (secret key) — mesmos campos analíticos. */
interface RvListedAnchor {
  id: string;
  keypoint_count?: number | null;
  descriptor_count?: number | null;
  resolve_count?: number | null;
  successful_resolve_count?: number | null;
  average_confidence?: number | null;
  last_resolved_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
}

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

@Injectable()
export class ArDiagnosticsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private classify(cloudAnchorId: string | null): CloudAnchorDiagnostic['provider'] {
    if (!cloudAnchorId) return 'none';
    if (cloudAnchorId.startsWith('coord-')) return 'synthetic';
    if (cloudAnchorId.startsWith('ua-facens-')) return 'seed';
    if (cloudAnchorId.startsWith('ua-')) return 'google';
    return 'reactvision'; // UUID do backend RV
  }

  private async fetchRvAnchor(cloudAnchorId: string): Promise<RvAnchorResponse> {
    const apiKey = process.env.RV_CLIENT_API_KEY;
    const projectId = process.env.RV_PROJECT_ID;
    if (!apiKey || !projectId) {
      return { error: { code: 'NOT_CONFIGURED', message: 'RV_CLIENT_API_KEY/RV_PROJECT_ID ausentes no .env.api' } };
    }
    const url = `${RV_BASE_URL}/cloud-anchors/${cloudAnchorId}?project_id=${projectId}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(RV_FETCH_TIMEOUT_MS),
    });
    return (await res.json()) as RvAnchorResponse;
  }

  /** Painel de qualidade dos pins x âncoras RV (GET /ar/diagnostics/cloud-anchors). */
  async cloudAnchorsPanel(): Promise<CloudAnchorDiagnostic[]> {
    const rows = await this.db.select().from(anchors).orderBy(desc(anchors.createdAt)).limit(100);

    // Caminho LIST (secret key): 1 request, todas as âncoras + campos privados.
    const listByCloudId = await this.fetchRvAnchorList();

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
          const keypoints = listed.keypoint_count ?? null;
          return {
            ...base,
            rv: {
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
            },
          };
        }
        if (listByCloudId) {
          // List disponível mas a âncora não está lá (hospedada em outro
          // projeto/excluída) — sem fallback de client key (a secret já cobre).
          return { ...base, rvError: 'ANCHOR_NOT_IN_PROJECT' };
        }

        try {
          const body = await this.fetchRvAnchor(row.cloudAnchorId);
          if (body.error || !body.anchor) {
            return { ...base, rvError: body.error?.code ?? 'SEM_ANCORAS' };
          }
          const a = body.anchor;
          const keypoints = a.keypoint_count ?? null;
          return {
            ...base,
            rv: {
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
            },
          };
        } catch (err) {
          return { ...base, rvError: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
  }

  /**
   * LIST completo via secret key (`/cloud-anchors/list` — todas as âncoras,
   * incluindo private, em 1 request). Retorna null quando a secret não está
   * configurada (fallback ao GET individual por client key).
   */
  private async fetchRvAnchorList(): Promise<Map<string, RvListedAnchor> | null> {
    const secret = process.env.RV_SECRET_API_KEY;
    const projectId = process.env.RV_PROJECT_ID;
    if (!secret || !projectId) return null;
    try {
      const res = await fetch(
        `${RV_BASE_URL}/cloud-anchors/list?project_id=${projectId}&limit=100`,
        {
          headers: { 'x-api-key': secret },
          signal: AbortSignal.timeout(RV_FETCH_TIMEOUT_MS),
        },
      );
      const body = (await res.json()) as { anchors?: RvListedAnchor[] };
      const map = new Map<string, RvListedAnchor>();
      for (const a of body.anchors ?? []) map.set(a.id, a);
      return map.size > 0 ? map : map; // map vazio também é válido (projeto sem âncoras)
    } catch {
      return null; // secret falhou → fallback client key
    }
  }
}
