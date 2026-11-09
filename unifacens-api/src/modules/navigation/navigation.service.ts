import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  findNavigationRoute,
  type ImportNavigationNetworkDto,
  type NavigationNetworkParams,
  type NavigationNetworksQuery,
  type NavigationRequest,
  type PublishNavigationNetworkDto,
  type NavigationEdge,
} from 'shared';
import { NavigationRepository } from './navigation.repository.js';

@Injectable()
export class NavigationService {
  constructor(
    @Inject(NavigationRepository)
    private readonly repository: NavigationRepository,
  ) {}

  list(query: NavigationNetworksQuery, isAdmin: boolean) {
    return this.repository.list(query, isAdmin);
  }

  async getVersion(params: NavigationNetworkParams, isAdmin: boolean) {
    const version = await this.repository.findVersion(params, isAdmin);
    if (!version) throw new NotFoundException('Versão da rede não encontrada.');
    return version;
  }

  async importVersion(graph: ImportNavigationNetworkDto, actorId: string) {
    await this.repository.importVersion(graph, actorId);
    return this.getVersion(
      { networkId: graph.id, version: graph.version },
      true,
    );
  }

  async publish(
    params: NavigationNetworkParams,
    dto: PublishNavigationNetworkDto,
    actorId: string,
  ) {
    const version = await this.getVersion(params, true);
    if (version.status === 'published') return version;
    if (version.status === 'retired')
      throw new ConflictException(
        'Uma versão retirada não pode ser reativada; importe uma nova revisão.',
      );
    const now = new Date();
    let verification: NavigationEdge['verification'] | undefined;
    if (version.dataSource === 'field_survey') {
      if (!dto.review || Date.parse(dto.review.validUntil) <= now.getTime()) {
        throw new BadRequestException(
          'Informe a revisão do levantamento, suas evidências e uma validade futura.',
        );
      }
      if (version.graph.nodes.some((node) => node.position === null)) {
        throw new BadRequestException(
          'Identifique as posições dos nós antes de publicar um levantamento real.',
        );
      }
      verification = {
        status: 'verified',
        verifiedAt: now.toISOString(),
        validUntil: dto.review.validUntil,
        evidenceIds: dto.review.evidenceIds,
      };
    }
    await this.repository.publish(params, actorId, now, verification);
    return this.getVersion(params, true);
  }

  async route(
    params: NavigationNetworkParams,
    dto: NavigationRequest,
    isAdmin: boolean,
  ) {
    const version = await this.getVersion(params, isAdmin);
    if (version.status !== 'published')
      throw new ConflictException(
        'Publique a versão antes de calcular percursos.',
      );
    return findNavigationRoute(version.graph, dto, new Date().toISOString());
  }
}
