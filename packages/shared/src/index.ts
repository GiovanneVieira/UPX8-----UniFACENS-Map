// Re-exporta Zod universalmente a partir de packages/shared
// Cumpre a regra arquitetural: Apenas shared declara 'zod' em dependencies
export { z } from 'zod';
export type { ZodSchema, ZodError, ZodType } from 'zod';

// Schemas Zod e Tipos Inferidos (Single Source of Truth)
export * from './schemas/anchor.schema.js';
export * from './schemas/place.schema.js';
export * from './schemas/access.schema.js';

// Motor Geodésico e Utilitários de Projeção Espacial
export * from './utils/geodesy.js';
