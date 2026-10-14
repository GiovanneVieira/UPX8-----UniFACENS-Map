import { SetMetadata } from '@nestjs/common';

export const PUBLIC_CONTRIBUTION = 'public-contribution';
export const TEAM_ONLY = 'team-only';
export const PublicContribution = () => SetMetadata(PUBLIC_CONTRIBUTION, true);
export const TeamOnly = () => SetMetadata(TEAM_ONLY, true);
