import type { NavigationEdge, NavigationGraph } from 'shared';

/** Rede inteiramente fictícia: não representa posição ou medida do campus. */
export const NAVIGATION_TEST_TIME = '2026-11-08T12:00:00Z';

export function makeNavigationEdge(
  overrides: Partial<NavigationEdge> = {},
): NavigationEdge {
  return {
    id: 'stairs',
    fromNodeId: 'origin',
    toNodeId: 'building-access',
    kind: 'stairs',
    lengthMeters: 20,
    widthMeters: 1.2,
    longitudinalSlopePercent: 0,
    crossSlopePercent: 0,
    stepCount: 8,
    hasHandrail: true,
    hasTactilePaving: false,
    surface: 'firm_regular',
    verification: {
      status: 'verified',
      verifiedAt: '2026-11-01T12:00:00Z',
      validUntil: '2026-12-01T12:00:00Z',
      evidenceIds: ['synthetic-evidence-not-a-field-survey'],
    },
    availability: {
      status: 'open',
      checkedAt: '2026-11-08T11:00:00Z',
      validUntil: '2026-11-08T13:00:00Z',
    },
    ...overrides,
  };
}

export function makeNavigationGraph(): NavigationGraph {
  return {
    id: 'synthetic-navigation',
    version: 'test-v1',
    dataSource: 'demo',
    nodes: [
      { id: 'origin', name: 'Origem fictícia', kind: 'gate', position: null },
      {
        id: 'junction',
        name: 'Bifurcação fictícia',
        kind: 'junction',
        position: null,
      },
      {
        id: 'building-access',
        name: 'Acesso fictício',
        kind: 'building_access',
        position: null,
      },
    ],
    edges: [
      makeNavigationEdge(),
      makeNavigationEdge({
        id: 'sidewalk',
        toNodeId: 'junction',
        kind: 'walkway',
        lengthMeters: 40,
        stepCount: 0,
        hasTactilePaving: true,
      }),
      makeNavigationEdge({
        id: 'ramp',
        fromNodeId: 'junction',
        kind: 'ramp',
        lengthMeters: 30,
        stepCount: 0,
        longitudinalSlopePercent: 5,
        hasTactilePaving: true,
      }),
    ],
  };
}
