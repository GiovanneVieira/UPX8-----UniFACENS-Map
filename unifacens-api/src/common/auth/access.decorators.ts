import { SetMetadata } from '@nestjs/common';

/** Rotas públicas — isentas de autenticação (ex.: política de acesso, healthcheck). */
export const PUBLIC = 'public-route';
/** Rotas que exigem role admin (default para mutations; estende para leituras). */
export const ADMIN_ONLY = 'admin-only';

export const Public = () => SetMetadata(PUBLIC, true);
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
