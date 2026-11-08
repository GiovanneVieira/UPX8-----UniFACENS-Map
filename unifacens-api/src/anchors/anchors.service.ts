import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRIZZLE } from '../db/database.module.js';
import type { DrizzleDB } from '../db/database.module.js';
import { anchors } from '../db/schema.js';
import type { Anchor, AnchorDetail, CreateAnchorDto } from 'shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');

@Injectable()
export class AnchorsService implements OnModuleInit {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'production') return;
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

    return records.map((record) => this.mapToAnchor(record));
  }

  /**
   * Busca uma âncora específica por ID (com imagens e detalhe enriquecido).
   */
  async findById(id: string): Promise<AnchorDetail | null> {
    const [record] = await this.db
      .select()
      .from(anchors)
      .where(eq(anchors.id, id))
      .limit(1);

    if (!record) return null;
    return this.mapToDetail(record);
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
        // positionX/Y/Z permanecem NULL: coordenadas AR de mundo local são
        // session-relative (removidas do contrato — SSOT é lat/lng/alt)
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        altitude: dto.altitude ?? null,
        heading: dto.heading ?? null,
      })
      .returning();

    return this.mapToAnchor(inserted);
  }

  /**
   * Salva imagens em disco (/uploads/anchors/:id/) e atualiza o JSONB images.
   */
  async addImages(id: string, buffers: Buffer[], mimetypes: string[]): Promise<string[]> {
    const [record] = await this.db
      .select()
      .from(anchors)
      .where(eq(anchors.id, id))
      .limit(1);
    if (!record) return [];

    const anchorDir = path.join(UPLOADS_ROOT, 'anchors', id);
    fs.mkdirSync(anchorDir, { recursive: true });

    const existing: string[] = Array.isArray(record.images) ? record.images : [];
    const newPaths: string[] = [];

    for (let i = 0; i < buffers.length; i++) {
      const ext = mimetypes[i] === 'image/png' ? 'png' : mimetypes[i] === 'image/webp' ? 'webp' : 'jpg';
      const filename = `${randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(anchorDir, filename), buffers[i]);
      newPaths.push(`/uploads/anchors/${id}/${filename}`);
    }

    const updatedImages = [...existing, ...newPaths];
    await this.db
      .update(anchors)
      .set({ images: updatedImages })
      .where(eq(anchors.id, id));

    return updatedImages;
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

  private mapToAnchor(record: typeof anchors.$inferSelect): Anchor {
    return {
      id: record.id,
      name: record.name,
      cloudAnchorId: record.cloudAnchorId,
      description: record.description ?? null,
      latitude: record.latitude ?? null,
      longitude: record.longitude ?? null,
      altitude: record.altitude ?? null,
      heading: record.heading ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private mapToDetail(record: typeof anchors.$inferSelect): AnchorDetail {
    return {
      ...this.mapToAnchor(record),
      longDescription: record.longDescription ?? null,
      images: Array.isArray(record.images) ? record.images : [],
      placeId: record.placeId ?? null,
    };
  }

  private async seedSampleAnchorsIfEmpty() {
    try {
      const existing = await this.db.select().from(anchors).limit(1);
      if (existing.length === 0) {
        console.log('[AnchorsService] Inserindo Cloud Anchors de exemplo para o campus...');
        // altitude NULL de propósito: seeds não têm altitude elipsoidal real
        // (ARCore/WGS84). Nulos roteiam para createTerrainAnchor(+1.5m acima
        // do terreno) — nunca para createGeospatialAnchor com datum errado.
        await this.db.insert(anchors).values([
          {
            name: 'Ponto Central (Origem Facens)',
            cloudAnchorId: 'ua-facens-demo-central-001',
            description: 'Praça central do campus Facens',
            latitude: -23.4699,
            longitude: -47.4297,
            altitude: null,
            heading: 0,
          },
          {
            name: 'Bloco A (Engenharias)',
            cloudAnchorId: 'ua-facens-demo-bloco-a',
            description: 'Prédio das engenharias e salas de aula',
            latitude: -23.47035,
            longitude: -47.4294,
            altitude: null,
            heading: 135,
          },
          {
            name: 'Bloco B (Laboratórios)',
            cloudAnchorId: 'ua-facens-demo-bloco-b',
            description: 'Laboratórios práticos e oficinas',
            latitude: -23.4695,
            longitude: -47.42995,
            altitude: null,
            heading: 315,
          },
          {
            name: 'Biblioteca Universitária',
            cloudAnchorId: 'ua-facens-demo-biblioteca',
            description: 'Centro de estudos e acervo acadêmico',
            latitude: -23.4701,
            longitude: -47.4302,
            altitude: null,
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
