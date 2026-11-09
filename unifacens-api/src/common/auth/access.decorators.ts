import { SetMetadata } from '@nestjs/common';

/** Rotas públicas — isentas de autenticação (ex.: política de acesso, healthcheck). */
export const PUBLIC = 'public-route';
/** Rotas que exigem role admin (default para mutations; estende para leituras). */
export const ADMIN_ONLY = 'admin-only';
/** Consulta HTTP que exige JWT, mas não altera dados (ex.: POST de cálculo). */
export const AUTHENTICATED_READ = 'authenticated-read';

export const Public = () => SetMetadata(PUBLIC, true);
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
export const AuthenticatedRead = () => SetMetadata(AUTHENTICATED_READ, true);
