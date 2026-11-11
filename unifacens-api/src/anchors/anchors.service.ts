import { Injectable, Inject, NotFoundException, OnModuleInit } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Anchor, AnchorDetail, CreateAnchorDto, UpdateAnchorDto } from 'shared';
import { DRIZZLE } from '../db/database.module.js';
import type { DrizzleDB } from '../db/database.module.js';
import { anchors, categories, models } from '../db/schema.js';
import {
  assertSafeKey,
  STORAGE,
  storageKeys,
  type StorageAdapter,
} from '../modules/storage/storage.types.js';
import { StorageFailureException } from '../common/exceptions/domain.exceptions.js';

/** Row de âncora com a categoria (e modelo) resolvidos em UM join. */
type AnchorRow = {
  anchor: typeof anchors.$inferSelect;
  categoryId: string | null;
  categorySlug: string | null;
  categoryLabel: string | null;
  modelId: string | null;
  modelKey: string | null;
  modelDerivedKey: string | null;
  modelFormat: string | null;
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class AnchorsService implements OnModuleInit {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'production') return;
    await this.seedSampleAnchorsIfEmpty();
  }

  /**
   * Retorna todas as âncoras Cloud Anchors registradas no catálogo,
   * com a categoria (e o modelo 3D) embutidas — join único, sem N+1.
   */
  async findAll(): Promise<Anchor[]> {
    const rows = await this.withCategory()
      .orderBy(desc(anchors.createdAt));
    return rows.map((row) => this.mapToAnchor(row));
  }

  /**
   * Busca uma âncora específica por ID (com imagens e detalhe enriquecido).
   */
  async findById(id: string): Promise<AnchorDetail | null> {
    const [row] = await this.withCategory()
      .where(eq(anchors.id, id))
      .limit(1);
    if (!row) return null;
    return this.mapToDetail(row);
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
        categoryId: dto.categoryId ?? null,
        // positionX/Y/Z permanecem NULL: coordenadas AR de mundo local são
        // session-relative (removidas do contrato — SSOT é lat/lng/alt)
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        altitude: dto.altitude ?? null,
        heading: dto.heading ?? null,
      })
      .returning();

    return this.mapToAnchor({
      anchor: inserted,
      categoryId: null,
      categorySlug: null,
      categoryLabel: null,
      modelId: null,
      modelKey: null,
      modelDerivedKey: null,
      modelFormat: null,
    });
  }

  /**
   * Atualização parcial — fluxo de ancoragem visual: após hospedar o Cloud
   * Anchor (scan do ambiente), o app grava o ID da nuvem + o offset do pin
   * no frame da âncora (estável entre sessões, ao contrário do antigo
   * `position` session-relative — as colunas positionX/Y/Z voltam a viver
   * com semântica correta: coordenadas no FRAME DA CLOUD ANCHOR).
   */
  async update(id: string, dto: UpdateAnchorDto): Promise<Anchor | null> {
    const patch: Partial<typeof anchors.$inferInsert> = {};
    if (dto.cloudAnchorId !== undefined) patch.cloudAnchorId = dto.cloudAnchorId;
    if (dto.categoryId !== undefined) patch.categoryId = dto.categoryId ?? null;
    if (dto.frameOffset !== undefined) {
      patch.positionX = dto.frameOffset?.[0] ?? null;
      patch.positionY = dto.frameOffset?.[1] ?? null;
      patch.positionZ = dto.frameOffset?.[2] ?? null;
    }
    if (Object.keys(patch).length === 0) {
      const current = await this.findById(id);
      return current;
    }

    const [updated] = await this.db
      .update(anchors)
      .set(patch)
      .where(eq(anchors.id, id))
      .returning();
    if (!updated) return null;
    const [withCategory] = await this.withCategory()
      .where(eq(anchors.id, id))
      .limit(1);
    return this.mapToAnchor(
      withCategory ?? {
        anchor: updated,
        categoryId: null,
        categorySlug: null,
        categoryLabel: null,
        modelId: null,
        modelKey: null,
        modelDerivedKey: null,
        modelFormat: null,
      },
    );
  }

  /**
   * Salva imagens no storage (points/images/{id}/) e atualiza o JSONB images
   * com as CHAVES lógicas — a URL pública é resolvida na serialização.
   */
  async addImages(id: string, buffers: Buffer[], mimetypes: string[]): Promise<string[]> {
    const [record] = await this.db
      .select()
      .from(anchors)
      .where(eq(anchors.id, id))
      .limit(1);
    if (!record) throw new NotFoundException(`Âncora com ID ${id} não encontrada`);

    const existing: string[] = Array.isArray(record.images) ? record.images : [];
    const newKeys: string[] = [];

    try {
      for (let i = 0; i < buffers.length; i++) {
        const ext = EXT_BY_MIME[mimetypes[i]] ?? 'jpg';
        // Chave canônica (prefixada) é a que persiste no JSONB.
        const stored = await this.storage.put(
          storageKeys.pointImage(id, `${randomUUID()}.${ext}`),
          buffers[i],
          mimetypes[i],
        );
        newKeys.push(stored.key);
      }
    } catch {
      // Falha de infra no meio do lote: chaves já gravadas limpam abaixo.
      await Promise.allSettled(newKeys.map((key) => this.storage.delete(key)));
      throw new StorageFailureException();
    }

    const updatedImages = [...existing, ...newKeys];
    await this.db
      .update(anchors)
      .set({ images: updatedImages })
      .where(eq(anchors.id, id));

    // Contrato consistente: sempre URLs resolvidas (como no mapToDetail).
    return updatedImages.map((key) => this.storage.url(key));
  }

  /** Remove UMA imagem do JSONB + do storage (idempotente). Aceita a URL
   *  serializada (relativa ou pública do S3) ou a chave crua. */
  async removeImage(id: string, urlOrKey: string): Promise<string[]> {
    const key = this.storage.keyFor(urlOrKey);
    assertSafeKey(key);
    const [record] = await this.db
      .select()
      .from(anchors)
      .where(eq(anchors.id, id))
      .limit(1);
    if (!record) throw new NotFoundException(`Âncora com ID ${id} não encontrada`);

    const existing: string[] = Array.isArray(record.images) ? record.images : [];
    if (!existing.includes(key)) {
      throw new NotFoundException('Imagem não encontrada neste ponto.');
    }
    const updated = existing.filter((entry) => entry !== key);
    await this.db
      .update(anchors)
      .set({ images: updated })
      .where(eq(anchors.id, id));
    await this.storage.delete(key).catch(() => undefined);
    return updated.map((entry) => this.storage.url(entry));
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

  /** Select base com categoria+modelo em UM join (left — pin pode ser null). */
  private withCategory() {
    return this.db
      .select({
        anchor: anchors,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryLabel: categories.label,
        modelId: models.id,
        modelKey: models.originalKey,
        modelDerivedKey: models.derivedKey,
        modelFormat: models.format,
      })
      .from(anchors)
      .leftJoin(categories, eq(anchors.categoryId, categories.id))
      .leftJoin(models, eq(categories.modelId, models.id));
  }

  private mapToAnchor(row: AnchorRow): Anchor {
    const record = row.anchor;
    const hasFrameOffset =
      record.positionX !== null &&
      record.positionY !== null &&
      record.positionZ !== null;
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
      // Colunas positionX/Y/Z renascidas: offset no frame da cloud anchor
      // (estável entre sessões). Null quando o pin não tem âncora visual.
      frameOffset: hasFrameOffset
        ? [record.positionX as number, record.positionY as number, record.positionZ as number]
        : null,
      // Categoria + modelo renderizável no AR (null = visual padrão ViroBox).
      category: row.categoryId
        ? {
            id: row.categoryId,
            slug: row.categorySlug ?? '',
            label: row.categoryLabel ?? '',
            modelId: row.modelId,
            model:
              row.modelKey
                ? {
                    // Renderizável: GLB derivado quando a origem é FBX.
                    url: this.storage.url(row.modelDerivedKey ?? row.modelKey),
                    format: row.modelDerivedKey
                      ? 'glb'
                      : (row.modelFormat as 'glb' | 'gltf' | 'obj' | 'fbx' | 'vrx'),
                  }
                : null,
          }
        : null,
    };
  }

  private mapToDetail(row: AnchorRow): AnchorDetail {
    const record = row.anchor;
    return {
      ...this.mapToAnchor(row),
      longDescription: record.longDescription ?? null,
      images: Array.isArray(record.images)
        ? record.images.map((key) => this.storage.url(key))
        : [],
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
