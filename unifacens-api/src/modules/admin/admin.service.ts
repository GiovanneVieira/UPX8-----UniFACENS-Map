import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  anchorDetailSchema,
  adminUsersPageSchema,
  type AdminListQuery,
  type UpdateAdminPoint,
} from 'shared';
import { AdminRepository } from './admin.repository.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.types.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}
  private point(row: {
    anchor: {
      id: string;
      name: string;
      cloudAnchorId: string;
      description: string | null;
      longDescription: string | null;
      images: unknown;
      placeId: string | null;
      positionX: number | null;
      positionY: number | null;
      positionZ: number | null;
      latitude: number | null;
      longitude: number | null;
      altitude: number | null;
      heading: number | null;
      createdAt: Date;
    };
    categoryId: string | null;
    categorySlug: string | null;
    categoryLabel: string | null;
    modelId: string | null;
    modelKey: string | null;
    modelDerivedKey: string | null;
    modelFormat: string | null;
  }) {
    return anchorDetailSchema.parse({
      ...row.anchor,
      images: Array.isArray(row.anchor.images)
        ? (row.anchor.images as string[]).map((key) => this.storage.url(key))
        : [],
      createdAt: row.anchor.createdAt.toISOString(),
      category: row.categoryId
        ? {
            id: row.categoryId,
            slug: row.categorySlug ?? '',
            label: row.categoryLabel ?? '',
            modelId: row.modelId,
            model: row.modelKey
              ? {
                  url: this.storage.url(row.modelDerivedKey ?? row.modelKey),
                  format: row.modelDerivedKey
                    ? 'glb'
                    : (row.modelFormat as 'glb' | 'gltf' | 'obj' | 'fbx' | 'vrx'),
                }
              : null,
          }
        : null,
    });
  }
  async listPoints(query: AdminListQuery) {
    const page = await this.repository.listPoints(query);
    return {
      total: page.total,
      items: page.items.map((row) => this.point(row)),
    };
  }
  async updatePoint(id: string, dto: UpdateAdminPoint) {
    const record = await this.repository.updatePoint(id, dto);
    if (!record)
      throw new NotFoundException('Este ponto não está mais disponível.');
    // Releitura com join de categoria para o payload completo.
    const detail = await this.repository.findPointById(id);
    if (!detail)
      throw new NotFoundException('Este ponto não está mais disponível.');
    return this.point(detail);
  }
  async listUsers(query: AdminListQuery) {
    const page = await this.repository.listUsers(query);
    return adminUsersPageSchema.parse({
      total: page.total,
      items: page.items.map((record) => ({
        ...record,
        banned: record.banned ?? false,
        createdAt: record.createdAt.toISOString(),
      })),
    });
  }
}
