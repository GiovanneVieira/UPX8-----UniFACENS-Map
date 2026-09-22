import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnchorsController } from '../../../src/anchors/anchors.controller.js';
import { AnchorsService } from '../../../src/anchors/anchors.service.js';

describe('AnchorsController (Unit)', () => {
  let controller: AnchorsController;
  let service: AnchorsService;

  const mockAnchors = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Ponto Teste Cloud',
      cloudAnchorId: 'ua-mock-cloud-id-123',
      description: 'Mesa do laboratório',
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnchorsController],
      providers: [
        {
          provide: AnchorsService,
          useValue: {
            findAll: vi.fn().mockResolvedValue(mockAnchors),
            findById: vi.fn().mockImplementation((id: string) => {
              if (id === '123e4567-e89b-12d3-a456-426614174000') {
                return Promise.resolve(mockAnchors[0]);
              }
              return Promise.resolve(null);
            }),
            create: vi.fn().mockImplementation((dto) =>
              Promise.resolve({
                id: 'new-uuid',
                ...dto,
                createdAt: new Date().toISOString(),
              }),
            ),
            remove: vi.fn().mockImplementation((id: string) => {
              if (id === 'not-found') return Promise.resolve({ success: false });
              return Promise.resolve({ success: true });
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<AnchorsController>(AnchorsController);
    service = module.get<AnchorsService>(AnchorsService);
  });

  it('deve retornar a lista de cloud anchors', async () => {
    const result = await controller.getAnchors();
    expect(result).toEqual(mockAnchors);
    expect(service.findAll).toHaveBeenCalled();
  });

  it('deve buscar uma âncora por ID existente', async () => {
    const result = await controller.getAnchorById('123e4567-e89b-12d3-a456-426614174000');
    expect(result.name).toBe('Ponto Teste Cloud');
    expect(result.cloudAnchorId).toBe('ua-mock-cloud-id-123');
  });

  it('deve lançar NotFoundException ao buscar âncora inexistente', async () => {
    await expect(controller.getAnchorById('inexistente')).rejects.toThrow(NotFoundException);
  });

  it('deve criar uma nova âncora com cloudAnchorId', async () => {
    const result = await controller.createAnchor({
      name: 'Entrada Biblioteca',
      cloudAnchorId: 'ua-biblio-999',
      description: 'Porta principal',
    });
    expect(result.id).toBe('new-uuid');
    expect(result.cloudAnchorId).toBe('ua-biblio-999');
    expect(service.create).toHaveBeenCalledWith({
      name: 'Entrada Biblioteca',
      cloudAnchorId: 'ua-biblio-999',
      description: 'Porta principal',
    });
  });

  it('deve excluir uma âncora com sucesso', async () => {
    const result = await controller.deleteAnchor('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: true });
    expect(service.remove).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
  });

  it('deve lançar NotFoundException ao excluir âncora inexistente', async () => {
    await expect(controller.deleteAnchor('not-found')).rejects.toThrow(NotFoundException);
  });
});
