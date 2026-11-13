import { describe, expect, it } from 'vitest';
import {
  navigationAnchorPlanFormSchema,
  navigationAnchorRequestSchema,
  filterNavigationPoints,
  navigationGraphSchema,
} from 'shared';
import { makeNavigationGraph } from './navigation.fixture.js';

const origin = '10000000-0000-4000-8000-000000000001';
const destination = '10000000-0000-4000-8000-000000000002';
const values = {
  originAnchorId: origin,
  destinationAnchorId: destination,
  networkKey: 'rede.v1/versao-1',
  mode: 'navigation' as const,
  stepFree: true,
  avoidLifts: false,
  requireHandrail: false,
  requireTactilePaving: false,
  requireFirmSurface: false,
  minWidthMeters: '',
  maxUphillSlopePercent: '',
  maxDownhillSlopePercent: '',
  maxCrossSlopePercent: '',
};
describe('Planejamento por identidade AR', () => {
  it('converte o formulário para IDs de âncora e versão, sem limites presumidos', () => {
    expect(
      navigationAnchorPlanFormSchema.parse({
        ...values,
        minWidthMeters: '1,2',
      }),
    ).toMatchObject({
      network: { networkId: 'rede.v1', version: 'versao-1' },
      request: {
        origin: { anchorId: origin },
        destination: { anchorId: destination },
        mode: 'navigation',
        needs: {
          stepFree: true,
          minWidthMeters: 1.2,
          maxUphillSlopePercent: null,
        },
      },
    });
  });
  it('exige IDs reais e área válida, permitindo origem e destino iguais', () => {
    expect(
      navigationAnchorPlanFormSchema.safeParse({ ...values, networkKey: '' })
        .success,
    ).toBe(false);
    expect(
      navigationAnchorPlanFormSchema.safeParse({
        ...values,
        networkKey: 'a/b/c',
      }).success,
    ).toBe(false);
    expect(
      navigationAnchorPlanFormSchema.safeParse({
        ...values,
        originAnchorId: 'entrada',
      }).success,
    ).toBe(false);
    expect(
      navigationAnchorPlanFormSchema.safeParse({
        ...values,
        destinationAnchorId: origin,
      }).success,
    ).toBe(true);
  });
  it('aceita origem por nó e recusa ambas as identidades ou grafo enviado pelo client', () => {
    expect(
      navigationAnchorRequestSchema.safeParse({
        origin: { nodeId: 'origin' },
        destination: { anchorId: destination },
      }).success,
    ).toBe(true);
    expect(
      navigationAnchorRequestSchema.safeParse({
        origin: { nodeId: 'origin', anchorId: origin },
        destination: { anchorId: destination },
      }).success,
    ).toBe(false);
    expect(
      navigationAnchorRequestSchema.safeParse({
        origin: { anchorId: origin },
        destination: { anchorId: destination },
        graph: {},
      }).success,
    ).toBe(false);
  });
  it('busca referências e acentos sem mudar a identidade, categoria ou ordem dos pontos', () => {
    const points = [
      { id: origin, name: 'Bibliotéca', description: 'Ao lado do prédio A' },
      { id: destination, name: 'Outro ponto', description: null },
    ];
    expect(filterNavigationPoints(points, ' BIBLIOTECA ')).toEqual([points[0]]);
    expect(filterNavigationPoints(points, 'PREDIO a')).toEqual([points[0]]);
    expect(filterNavigationPoints(points, '')).toEqual(points);
    expect(filterNavigationPoints(points, 'inexistente')).toEqual([]);
  });
  it('recusa âncoras duplicadas em uma versão, mantendo compatibilidade de redes anteriores', () => {
    const graph = makeNavigationGraph();
    expect(navigationGraphSchema.safeParse(graph).success).toBe(true);
    Object.assign(graph.nodes[0], { anchorId: origin });
    Object.assign(graph.nodes[2], { anchorId: origin });
    expect(navigationGraphSchema.safeParse(graph).success).toBe(false);
  });
});
