import { Injectable, NotFoundException } from '@nestjs/common';
import {
  anchorDetailSchema,
  adminUsersPageSchema,
  type AdminListQuery,
  type UpdateAdminPoint,
} from 'shared';
import { AdminRepository } from './admin.repository.js';
import type { anchors } from '../../db/schema.js';

@Injectable()
export class AdminService {
  constructor(private readonly repository: AdminRepository) {}
  private point(record: typeof anchors.$inferSelect) {
    return anchorDetailSchema.parse({
      ...record,
      images: record.images ?? [],
      createdAt: record.createdAt.toISOString(),
    });
  }
  async listPoints(query: AdminListQuery) {
    const page = await this.repository.listPoints(query);
    return {
      total: page.total,
      items: page.items.map((record) => this.point(record)),
    };
  }
  async updatePoint(id: string, dto: UpdateAdminPoint) {
    const record = await this.repository.updatePoint(id, dto);
    if (!record)
      throw new NotFoundException('Este ponto não está mais disponível.');
    return this.point(record);
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
