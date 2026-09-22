import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnchorsService } from '../../../src/anchors/anchors.service.js';

describe('AnchorsService (Unit)', () => {
  let service: AnchorsService;
  let mockDb: any;

  beforeEach(() => {
    let lastInserted: any = null;
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          id: '123',
          name: 'Ponto Teste',
          cloudAnchorId: 'ua-test-anchor-123',
          description: 'Ponto de teste',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() =>
        Promise.resolve([
          {
            id: '123',
            name: 'Ponto Teste',
            cloudAnchorId: 'ua-test-anchor-123',
            description: 'Ponto de teste',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      ),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockImplementation((val) => {
        lastInserted = { id: 'new-id', createdAt: new Date('2026-01-01T00:00:00.000Z'), ...val };
        return mockDb;
      }),
      returning: vi.fn().mockImplementation(() => Promise.resolve([lastInserted])),
      delete: vi.fn().mockReturnThis(),
    };

    service = new AnchorsService(mockDb);
  });

  it('deve listar âncoras salvas com cloudAnchorId', async () => {
    const records = await service.findAll();
    expect(records.length).toBe(1);
    expect(records[0].name).toBe('Ponto Teste');
    expect(records[0].cloudAnchorId).toBe('ua-test-anchor-123');
  });

  it('deve buscar uma âncora por ID', async () => {
    const record = await service.findById('123');
    expect(record).not.toBeNull();
    expect(record?.name).toBe('Ponto Teste');
    expect(record?.cloudAnchorId).toBe('ua-test-anchor-123');
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
});
