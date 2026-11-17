import { Injectable } from '@nestjs/common';

/**
 * Adapter da API REST do ReactVision Spatial (cloud anchors) — seam única
 * para TODA consulta à plataforma (diagnóstico por pin + diff de órfãs).
 * Dois adapters = seam real: a implementação HTTP (produção) e o fake em
 * memória dos testes de integração (sem rede).
 *
 * Auth (§15.5): client key (`RV_CLIENT_API_KEY`) aceita GET por ID (300/min);
 * o LIST completo exige SECRET key (`RV_SECRET_API_KEY`) — 1 request, todas
 * as âncoras do projeto, incluindo privadas.
 */

const RV_BASE_URL = 'https://platform.reactvision.xyz/functions/v1';
const RV_FETCH_TIMEOUT_MS = 10_000;

/** Resposta do GET /cloud-anchors/{id} (client key). */
export interface RvAnchorResponse {
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
export interface RvListedAnchor {
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
  created_at?: string | null;
}

/** Interface mínima consumida pelo diagnóstico e pelo diff de órfãs. */
export interface RvCloudAnchorClient {
  /** GET por ID via client key. */
  get(cloudAnchorId: string): Promise<RvAnchorResponse>;
  /**
   * LIST completo via secret key — null quando a secret não está
   * configurada (fallback do diagnóstico ao GET individual).
   */
  listAll(): Promise<Map<string, RvListedAnchor> | null>;
}

export const RV_CLOUD_ANCHOR_CLIENT = Symbol('RV_CLOUD_ANCHOR_CLIENT');

@Injectable()
export class HttpRvCloudAnchorClient implements RvCloudAnchorClient {
  async get(cloudAnchorId: string): Promise<RvAnchorResponse> {
    const apiKey = process.env.RV_CLIENT_API_KEY;
    const projectId = process.env.RV_PROJECT_ID;
    if (!apiKey || !projectId) {
      return {
        error: {
          code: 'NOT_CONFIGURED',
          message: 'RV_CLIENT_API_KEY/RV_PROJECT_ID ausentes no .env.api',
        },
      };
    }
    const url = `${RV_BASE_URL}/cloud-anchors/${cloudAnchorId}?project_id=${projectId}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(RV_FETCH_TIMEOUT_MS),
    });
    return (await res.json()) as RvAnchorResponse;
  }

  async listAll(): Promise<Map<string, RvListedAnchor> | null> {
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
      return map; // vazio também é válido (projeto sem âncoras)
    } catch {
      return null; // secret falhou → caller cai no fallback client key
    }
  }
}
