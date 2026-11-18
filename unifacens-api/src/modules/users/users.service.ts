import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import { user } from '../../db/schema.js';
import { StorageFailureException } from '../../common/exceptions/domain.exceptions.js';
import { STORAGE, storageKeys, type StorageAdapter } from '../storage/storage.types.js';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface AvatarResult {
  image: string | null;
}

/**
 * Perfil do usuário autenticado (self-service — qualquer role).
 *
 * O avatar grava no mesmo seam de storage dos demais arquivos
 * (`users/avatars/{userId}/{uuid}.{ext}`) e `user.image` guarda a URL
 * RESOLVIDA (S3 absoluta ou `/uploads/...` no local) — o client renderiza
 * direto (resolveAssetUrl) e `keyFor(url)` recupera a chave p/ troca/remoção.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  /** Grava o novo avatar, atualiza user.image e remove o anterior. */
  async setAvatar(userId: string, buffer: Buffer, mimetype: string): Promise<AvatarResult> {
    const current = await this.currentImage(userId);
    const ext = EXT_BY_MIME[mimetype] ?? 'jpg';
    const stored = await this.storage.put(
      storageKeys.userAvatar(userId, `${randomUUID()}.${ext}`),
      buffer,
      mimetype,
    );
    const [updated] = await this.db
      .update(user)
      .set({ image: stored.url })
      .where(eq(user.id, userId))
      .returning({ image: user.image });
    if (!updated) {
      // Usuário sumiu entre a leitura e a gravação — limpa o órfão.
      await this.storage.delete(stored.key).catch(() => undefined);
      throw new NotFoundException('Usuário não encontrado.');
    }
    if (current) {
      await this.storage.delete(this.storage.keyFor(current)).catch(() => undefined);
    }
    return { image: updated.image };
  }

  /** Remove o avatar (user.image = null + arquivo no storage). */
  async removeAvatar(userId: string): Promise<AvatarResult> {
    const current = await this.currentImage(userId);
    if (current) {
      await this.storage
        .delete(this.storage.keyFor(current))
        .catch(() => new StorageFailureException());
    }
    const [updated] = await this.db
      .update(user)
      .set({ image: null })
      .where(eq(user.id, userId))
      .returning({ image: user.image });
    if (!updated) throw new NotFoundException('Usuário não encontrado.');
    return { image: updated.image };
  }

  private async currentImage(userId: string): Promise<string | null> {
    const [record] = await this.db
      .select({ image: user.image })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!record) throw new NotFoundException('Usuário não encontrado.');
    return record.image ?? null;
  }
}
