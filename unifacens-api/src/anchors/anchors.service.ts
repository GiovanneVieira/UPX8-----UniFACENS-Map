import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { DrizzleDB } from '../db/database.module.js';
import { anchors } from '../db/schema.js';
import type { Anchor, CreateAnchorDto } from 'shared';

@Injectable()
export class AnchorsService implements OnModuleInit {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async onModuleInit() {
    await this.seedSampleAnchorsIfEmpty();
  }

  /**
   * Retorna todas as âncoras Cloud Anchors registradas no catálogo.
   */
  async findAll(): Promise<Anchor[]> {
    const records = await this.db
      .select()
      .from(anchors)
      .orderBy(desc(anchors.createdAt));

    return records.map((record) => ({
      id: record.id,
      name: record.name,
      cloudAnchorId: record.cloudAnchorId,
      description: record.description ?? null,
      position:
        record.positionX !== null && record.positionY !== null && record.positionZ !== null
          ? [record.positionX, record.positionY, record.positionZ]
          : null,
      latitude: record.latitude ?? null,
      longitude: record.longitude ?? null,
      altitude: record.altitude ?? null,
      heading: record.heading ?? null,
      createdAt: record.createdAt.toISOString(),
    }));
  }

  /**
   * Busca uma âncora específica por ID.
   */
  async findById(id: string): Promise<Anchor | null> {
    const [record] = await this.db
      .select()
      .from(anchors)
      .where(eq(anchors.id, id))
      .limit(1);

    if (!record) return null;

    return {
      id: record.id,
      name: record.name,
      cloudAnchorId: record.cloudAnchorId,
      description: record.description ?? null,
      position:
        record.positionX !== null && record.positionY !== null && record.positionZ !== null
          ? [record.positionX, record.positionY, record.positionZ]
          : null,
      latitude: record.latitude ?? null,
      longitude: record.longitude ?? null,
      altitude: record.altitude ?? null,
      heading: record.heading ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /**
   * Registra uma nova âncora vinculada a um Cloud Anchor ID gerado pelo Google ARCore ou pose Geoespacial WGS84.
   */
  async create(dto: CreateAnchorDto): Promise<Anchor> {
    const [inserted] = await this.db
      .insert(anchors)
      .values({
        name: dto.name,
        cloudAnchorId: dto.cloudAnchorId,
        description: dto.description ?? null,
        positionX: dto.position ? dto.position[0] : null,
        positionY: dto.position ? dto.position[1] : null,
        positionZ: dto.position ? dto.position[2] : null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        altitude: dto.altitude ?? null,
        heading: dto.heading ?? null,
      })
      .returning();

    return {
      id: inserted.id,
      name: inserted.name,
      cloudAnchorId: inserted.cloudAnchorId,
      description: inserted.description ?? null,
      position:
        inserted.positionX !== null && inserted.positionY !== null && inserted.positionZ !== null
          ? [inserted.positionX, inserted.positionY, inserted.positionZ]
          : null,
      latitude: inserted.latitude ?? null,
      longitude: inserted.longitude ?? null,
      altitude: inserted.altitude ?? null,
      heading: inserted.heading ?? null,
      createdAt: inserted.createdAt.toISOString(),
    };
  }

  /**
   * Remove uma âncora do catálogo pelo ID.
   */
  async remove(id: string): Promise<{ success: boolean }> {
    const deleted = await this.db
      .delete(anchors)
      .where(eq(anchors.id, id))
      .returning();

    return { success: deleted.length > 0 };
  }

  private async seedSampleAnchorsIfEmpty() {
    try {
      const existing = await this.db.select().from(anchors).limit(1);
      if (existing.length === 0) {
        console.log('[AnchorsService] Inserindo Cloud Anchors de exemplo para o campus...');
        await this.db.insert(anchors).values([
          {
            name: 'Ponto Central (Origem Facens)',
            cloudAnchorId: 'ua-facens-demo-central-001',
            description: 'Praça central do campus Facens',
            positionX: 0,
            positionY: 0,
            positionZ: 0,
            latitude: -23.4699,
            longitude: -47.4297,
            altitude: 605,
            heading: 0,
          },
          {
            name: 'Bloco A (Engenharias)',
            cloudAnchorId: 'ua-facens-demo-bloco-a',
            description: 'Prédio das engenharias e salas de aula',
            positionX: null,
            positionY: null,
            positionZ: null,
            latitude: -23.47035,
            longitude: -47.4294,
            altitude: 606,
            heading: 135,
          },
          {
            name: 'Bloco B (Laboratórios)',
            cloudAnchorId: 'ua-facens-demo-bloco-b',
            description: 'Laboratórios práticos e oficinas',
            positionX: null,
            positionY: null,
            positionZ: null,
            latitude: -23.4695,
            longitude: -47.42995,
            altitude: 605,
            heading: 315,
          },
          {
            name: 'Biblioteca Universitária',
            cloudAnchorId: 'ua-facens-demo-biblioteca',
            description: 'Centro de estudos e acervo acadêmico',
            positionX: null,
            positionY: null,
            positionZ: null,
            latitude: -23.4701,
            longitude: -47.4302,
            altitude: 605,
            heading: 225,
          },
        ]);
        console.log('[AnchorsService] Cloud Anchors de exemplo inseridos com sucesso.');
      }
    } catch (err) {
      console.warn('[AnchorsService] Aviso ao verificar seeds:', err);
    }
  }
}
