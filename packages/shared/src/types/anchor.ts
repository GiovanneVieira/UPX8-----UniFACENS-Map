/**
 * @file packages/shared/src/types/anchor.ts
 * Definições e contratos de tipos para âncoras na nuvem (Google ARCore Cloud Anchors).
 */

export interface Anchor {
  id: string;
  name: string;
  cloudAnchorId: string;
  description?: string | null;
  /** Coordenadas WGS84 globais para fixação absoluta no planeta Terra */
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  heading?: number | null;
  createdAt: string;
  /**
   * Posição 3D relativa calculada em tempo de execução pelo ARCore no dispositivo
   * após a resolução visual do Cloud Anchor ou projeção geoespacial.
   */
  arPosition?: [number, number, number];
  /** Distância métrica horizontal até a câmera calculada em tempo real */
  distanceMeters?: number;
  /** Runtime-only (client): pin sem âncora nativa — projeção estimada. */
  estimated?: boolean;
  /** Runtime-only (client): envelope de erro da estimativa (m). */
  estimateAccuracyM?: number;
  /**
   * Runtime-only (client): pin cloud pendente de resolve projetado como
   * estimativa "ghost" (não selecionável; substituído com transição suave
   * pelo resolve — one-way, jamais volta a GPS depois de cravado).
   */
  isGhost?: boolean;
}

export type AnchorCoordinate = Anchor;

export interface CreateAnchorDto {
  name: string;
  cloudAnchorId: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  heading?: number | null;
}

