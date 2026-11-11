import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnchorsService } from '../../../src/anchors/anchors.service.js';
import type { StorageAdapter } from '../../../src/modules/storage/storage.types.js';

/** Stub do adapter local: mesma semântica de URL relativa /uploads/<key>. */
const storageStub: StorageAdapter = {
  driver: 'local',
  put: async (key, _buffer, _mime) => ({ key, url: `/uploads/${key}` }),
  delete: async () => undefined,
  url: (key) => (key.startsWith('/uploads/') ? key : `/uploads/${key}`),
  keyFor: (urlOrKey) =>
    urlOrKey.startsWith('/uploads/') ? urlOrKey.slice('/uploads/'.length) : urlOrKey,
};

const joinedRow = (overrides: Record<string, unknown> = {}) => ({
  anchor: {
    id: '123',
    name: 'Ponto Teste',
    cloudAnchorId: 'ua-test-anchor-123',
    description: 'Ponto de teste',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  },
  categoryId: null,
  categorySlug: null,
  categoryLabel: null,
  modelKey: null,
  modelDerivedKey: null,
  modelFormat: null,
});

describe('AnchorsService (Unit)', () => {
  let service: AnchorsService;
  let mockDb: any;

  beforeEach(() => {
    let lastInserted: any = null;
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([joinedRow()]),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => Promise.resolve([joinedRow()])),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockImplementation((val) => {
        lastInserted = { id: 'new-id', createdAt: new Date('2026-01-01T00:00:00.000Z'), ...val };
        return mockDb;
      }),
      returning: vi.fn().mockImplementation(() => Promise.resolve([lastInserted])),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };

    service = new AnchorsService(mockDb, storageStub);
  });

  it('deve listar âncoras salvas com cloudAnchorId', async () => {
    const records = await service.findAll();
    expect(records.length).toBe(1);
    expect(records[0].name).toBe('Ponto Teste');
    expect(records[0].cloudAnchorId).toBe('ua-test-anchor-123');
    expect(records[0].category).toBeNull();
  });

  it('deve buscar uma âncora por ID', async () => {
    const record = await service.findById('123');
    expect(record).not.toBeNull();
    expect(record?.name).toBe('Ponto Teste');
    expect(record?.cloudAnchorId).toBe('ua-test-anchor-123');
  });

  it('deve embutir a categoria e o modelo renderizável quando o pin tem vínculo', async () => {
    mockDb.orderBy.mockResolvedValueOnce([
      joinedRow(),
      {
        anchor: {
          id: '124',
          name: 'Geladeira do laboratório',
          cloudAnchorId: 'ua-real-124',
          description: null,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        categoryId: 'cat-uuid',
        categorySlug: 'laboratory',
        categoryLabel: 'Laboratório',
        modelKey: 'models/originals/m/geladeira.fbx',
        modelDerivedKey: 'models/derived/m/geladeira.glb',
        modelFormat: 'fbx',
      },
    ]);
    const records = await service.findAll();
    expect(records[1].category).toMatchObject({
      slug: 'laboratory',
      label: 'Laboratório',
    });
    // FBX converte para GLB derivado — a URL renderizável aponta pro derivado.
    expect(records[1].category?.model?.format).toBe('glb');
    expect(records[1].category?.model?.url).toBe(
      '/uploads/models/derived/m/geladeira.glb',
    );
  });

  it('deve cadastrar uma nova âncora com Cloud Anchor ID', async () => {
    const created = await service.create({
      name: 'Entrada Bloco A',
      cloudAnchorId: 'ua-bloco-a-456',
      description: 'Hall de entrada',
    });
    expect(created.id).toBe('new-id');
    expect(created.name).toBe('Entrada Bloco A');
    expect(created.cloudAnchorId).toBe('ua-bloco-a-456');
    expect(created.description).toBe('Hall de entrada');
  });

  it('deve excluir uma âncora por ID', async () => {
    mockDb.returning.mockResolvedValueOnce([{ id: '123' }]);
    const result = await service.remove('123');
    expect(result.success).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
  });

  it('deve salvar imagens via storage e devolver URLs resolvidas', async () => {
    mockDb.limit
      .mockResolvedValueOnce([
        {
          id: '123',
          name: 'Ponto Teste',
          cloudAnchorId: 'ua-test-anchor-123',
          description: null,
          images: ['points/images/123/existing.png'],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ])
      .mockResolvedValue([]);
    const images = await service.addImages('123', [Buffer.from('img')], ['image/png']);
    expect(images).toHaveLength(2);
    // Contrato: sempre URLs resolvidas (mesma forma do mapToDetail).
    expect(images[0]).toBe('/uploads/points/images/123/existing.png');
    expect(images[1]).toMatch(/^\/uploads\/points\/images\/123\/[0-9a-f-]+\.png$/);
  });
});
