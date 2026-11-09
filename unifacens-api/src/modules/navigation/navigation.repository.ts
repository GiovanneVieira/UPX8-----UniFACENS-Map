import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import {
  navigationNetworkVersionSchema,
  navigationNetworksPageSchema,
  type NavigationGraph,
  type NavigationNetworkParams,
  type NavigationNetworkVersion,
  type NavigationNetworksQuery,
  type NavigationEdge,
} from 'shared';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import {
  navigationNetworks,
  navigationVersions,
  navigationNodes,
  navigationEdges,
} from '../../db/schema.js';

const summaryColumns = {
  networkId: navigationVersions.networkId,
  version: navigationVersions.version,
  dataSource: navigationNetworks.dataSource,
  status: navigationVersions.status,
  nodeCount: navigationVersions.nodeCount,
  edgeCount: navigationVersions.edgeCount,
  createdAt: navigationVersions.createdAt,
  publishedAt: navigationVersions.publishedAt,
  retiredAt: navigationVersions.retiredAt,
};
const nodeColumns = {
  id: navigationNodes.id,
  name: navigationNodes.name,
  kind: navigationNodes.kind,
  position: navigationNodes.position,
};
const edgeColumns = {
  id: navigationEdges.id,
  fromNodeId: navigationEdges.fromNodeId,
  toNodeId: navigationEdges.toNodeId,
  kind: navigationEdges.kind,
  lengthMeters: navigationEdges.lengthMeters,
  widthMeters: navigationEdges.widthMeters,
  longitudinalSlopePercent: navigationEdges.longitudinalSlopePercent,
  crossSlopePercent: navigationEdges.crossSlopePercent,
  stepCount: navigationEdges.stepCount,
  hasHandrail: navigationEdges.hasHandrail,
  hasTactilePaving: navigationEdges.hasTactilePaving,
  surface: navigationEdges.surface,
  verification: navigationEdges.verification,
  availability: navigationEdges.availability,
};

function versionFilter(params: NavigationNetworkParams) {
  return and(
    eq(navigationVersions.networkId, params.networkId),
    eq(navigationVersions.version, params.version),
  );
}
function serializeSummary(row: {
  networkId: string;
  version: string;
  dataSource: string;
  status: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: Date;
  publishedAt: Date | null;
  retiredAt: Date | null;
}) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    retiredAt: row.retiredAt?.toISOString() ?? null,
  };
}
function uniqueViolation(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    cause?: { code?: string };
  } | null;
  return candidate?.code === '23505' || candidate?.cause?.code === '23505';
}

@Injectable()
export class NavigationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async importVersion(graph: NavigationGraph, actorId: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .insert(navigationNetworks)
          .values({ id: graph.id, dataSource: graph.dataSource })
          .onConflictDoNothing();
        const [network] = await tx
          .select({ dataSource: navigationNetworks.dataSource })
          .from(navigationNetworks)
          .where(eq(navigationNetworks.id, graph.id))
          .for('update');
        if (network.dataSource !== graph.dataSource)
          throw new ConflictException(
            'A origem dos dados de uma rede não pode ser alterada.',
          );
        await tx.insert(navigationVersions).values({
          networkId: graph.id,
          version: graph.version,
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          createdByUserId: actorId,
        });
        await tx
          .insert(navigationNodes)
          .values(
            graph.nodes.map((node) => ({
              ...node,
              networkId: graph.id,
              version: graph.version,
            })),
          );
        if (graph.edges.length > 0) {
          await tx.insert(navigationEdges).values(
            graph.edges.map((edge) => ({
              ...edge,
              networkId: graph.id,
              version: graph.version,
              // Uma nova importação de campo nunca herda aprovação do corpo enviado.
              verification:
                graph.dataSource === 'field_survey'
                  ? { status: 'unverified' as const }
                  : edge.verification,
            })),
          );
        }
      });
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictException(
          'Versão já cadastrada. Importe uma nova versão para alterar a rede.',
        );
      throw error;
    }
  }

  async list(query: NavigationNetworksQuery, includeDrafts: boolean) {
    const rows = await this.db
      .select(summaryColumns)
      .from(navigationVersions)
      .innerJoin(
        navigationNetworks,
        eq(navigationNetworks.id, navigationVersions.networkId),
      )
      .where(
        includeDrafts ? undefined : eq(navigationVersions.status, 'published'),
      )
      .orderBy(
        asc(navigationVersions.createdAt),
        asc(navigationVersions.networkId),
        asc(navigationVersions.version),
      )
      .offset(query.offset)
      .limit(query.limit + 1);
    return navigationNetworksPageSchema.parse({
      items: rows.slice(0, query.limit).map(serializeSummary),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    });
  }

  async findVersion(
    params: NavigationNetworkParams,
    includeDrafts: boolean,
  ): Promise<NavigationNetworkVersion | null> {
    // Metadados e conteúdo da versão são lidos no mesmo snapshot, inclusive ao publicar.
    return this.db.transaction(
      async (tx) => {
        const [summary] = await tx
          .select(summaryColumns)
          .from(navigationVersions)
          .innerJoin(
            navigationNetworks,
            eq(navigationNetworks.id, navigationVersions.networkId),
          )
          .where(
            and(
              versionFilter(params),
              includeDrafts
                ? undefined
                : eq(navigationVersions.status, 'published'),
            ),
          )
          .limit(1);
        if (!summary) return null;
        const nodes = await tx
          .select(nodeColumns)
          .from(navigationNodes)
          .where(
            and(
              eq(navigationNodes.networkId, params.networkId),
              eq(navigationNodes.version, params.version),
            ),
          )
          .orderBy(asc(navigationNodes.id));
        const edges = await tx
          .select(edgeColumns)
          .from(navigationEdges)
          .where(
            and(
              eq(navigationEdges.networkId, params.networkId),
              eq(navigationEdges.version, params.version),
            ),
          )
          .orderBy(asc(navigationEdges.id));
        return navigationNetworkVersionSchema.parse({
          ...serializeSummary(summary),
          graph: {
            id: params.networkId,
            version: params.version,
            dataSource: summary.dataSource,
            nodes,
            edges,
          },
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async publish(
    params: NavigationNetworkParams,
    actorId: string,
    now: Date,
    verification?: NavigationEdge['verification'],
  ) {
    await this.db.transaction(async (tx) => {
      // Serializa publicações da mesma rede: só pode existir uma versão ativa.
      await tx
        .select({ id: navigationNetworks.id })
        .from(navigationNetworks)
        .where(eq(navigationNetworks.id, params.networkId))
        .for('update');
      const [version] = await tx
        .select({ status: navigationVersions.status })
        .from(navigationVersions)
        .where(versionFilter(params))
        .for('update');
      if (!version || version.status === 'published') return;
      if (version.status === 'retired')
        throw new ConflictException(
          'Uma versão retirada não pode ser reativada; importe uma nova revisão.',
        );
      if (verification) {
        await tx
          .update(navigationEdges)
          .set({ verification })
          .where(
            and(
              eq(navigationEdges.networkId, params.networkId),
              eq(navigationEdges.version, params.version),
            ),
          );
      }
      await tx
        .update(navigationVersions)
        .set({ status: 'retired', retiredAt: now })
        .where(
          and(
            eq(navigationVersions.networkId, params.networkId),
            eq(navigationVersions.status, 'published'),
          ),
        );
      await tx
        .update(navigationVersions)
        .set({
          status: 'published',
          publishedAt: now,
          publishedByUserId: actorId,
        })
        .where(versionFilter(params));
    });
  }
}
