/**
 * @file packages/shared/src/index.ts
 * Ponto de entrada do pacote compartilhado (contratos, tipos, DTOs, schemas de validação e utilitários).
 */

export const SHARED_PACKAGE_VERSION = '1.0.0';

// Reexporta Zod unificado para todos os consumidores do monorepo (API e Client)
export { z } from 'zod';
export type { ZodSchema, ZodError, ZodType } from 'zod';

// Schemas Zod e Tipos Inferidos (Single Source of Truth)
export * from './schemas/anchor.schema.js';
