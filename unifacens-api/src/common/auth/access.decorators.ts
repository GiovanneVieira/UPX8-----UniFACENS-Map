import { SetMetadata } from '@nestjs/common';

/** Rotas de contribuição pública (mutation sem autenticação, ex.: POST /places). */
export const PUBLIC_CONTRIBUTION = 'public-contribution';
/** Rotas que exigem Bearer JWT de administrador mesmo sendo leitura. */
export const ADMIN_ONLY = 'admin-only';

export const PublicContribution = () => SetMetadata(PUBLIC_CONTRIBUTION, true);
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
