/**
 * @file packages/shared/src/types/anchor.ts
 * Definições e contratos de tipos para âncoras na nuvem (Google ARCore Cloud Anchors).
 */

export interface Anchor {
  id: string;
  name: string;
  cloudAnchorId: string;
  description?: string | null;
  position?: [number, number, number] | null;
  createdAt: string;
  /**
   * Posição 3D relativa calculada em tempo de execução pelo ARCore no dispositivo
   * após a resolução visual do Cloud Anchor.
   */
  arPosition?: [number, number, number];
}

export type AnchorCoordinate = Anchor;

export interface CreateAnchorDto {
  name: string;
  cloudAnchorId: string;
  description?: string | null;
  position?: [number, number, number] | null;
}
