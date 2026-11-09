import { describe, expect, it } from 'vitest';
import {
  assessNavigationEdge,
  findNavigationRoute,
  navigationGraphSchema,
  navigationNeedsSchema,
  navigationRequestSchema,
  navigationResultSchema,
} from 'shared';
import {
  makeNavigationEdge,
  makeNavigationGraph,
  NAVIGATION_TEST_TIME,
} from './navigation.fixture.js';

const request = {
  originNodeId: 'origin',
  destinationNodeId: 'building-access',
  mode: 'demonstration',
} as const;
const run = (graph = makeNavigationGraph(), needs = {}) =>
  findNavigationRoute(graph, { ...request, needs }, NAVIGATION_TEST_TIME);
const assess = (edge = makeNavigationEdge(), needs = {}) =>
  assessNavigationEdge(
    edge,
    navigationNeedsSchema.parse(needs),
    NAVIGATION_TEST_TIME,
  );

describe('Contratos da navegação sem dependência de GPS', () => {
  it('aceita rede fictícia com distâncias e sem coordenadas', () => {
    expect(
      navigationGraphSchema.parse(makeNavigationGraph()).nodes[0].position,
    ).toBeNull();
  });

  it('não presume medidas nem requisitos de um diagnóstico', () => {
    expect(navigationNeedsSchema.parse({})).toEqual({
      stepFree: false,
      avoidLifts: false,
      minWidthMeters: null,
      maxUphillSlopePercent: null,
      maxDownhillSlopePercent: null,
      maxCrossSlopePercent: null,
      requireHandrail: false,
      requireTactilePaving: false,
      requireFirmSurface: false,
    });
    expect(
      navigationNeedsSchema.safeParse({ diagnosis: 'example' }).success,
    ).toBe(false);
    expect(
      navigationRequestSchema.safeParse({ ...request, profile: 'accessible' })
        .success,
    ).toBe(false);
  });

  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejeita comprimento inválido: %s',
    (lengthMeters) => {
      const graph = makeNavigationGraph();
      graph.edges[0].lengthMeters = lengthMeters;
      expect(navigationGraphSchema.safeParse(graph).success).toBe(false);
    },
  );

  it('rejeita IDs duplicados e conexões para nós inexistentes', () => {
    const graph = makeNavigationGraph();
    graph.edges[0].toNodeId = 'missing';
    graph.nodes.push(graph.nodes[0]);
    graph.edges.push(graph.edges[1]);
    expect(navigationGraphSchema.safeParse(graph).success).toBe(false);
  });

  it('valida zero em coordenadas e o referencial de posições locais', () => {
    const graph = makeNavigationGraph();
    graph.nodes[0].position = { kind: 'geographic', latitude: 0, longitude: 0 };
    graph.nodes[1].position = {
      kind: 'local',
      referenceId: 'synthetic-plan',
      xMeters: 0,
      yMeters: 0,
    };
    expect(navigationGraphSchema.safeParse(graph).success).toBe(true);
    graph.nodes[0].position.latitude = 91;
    expect(navigationGraphSchema.safeParse(graph).success).toBe(false);
  });

  it('recusa janelas de validade invertidas e restrições negativas', () => {
    const graph = makeNavigationGraph();
    graph.edges[0].verification = {
      status: 'verified',
      verifiedAt: '2026-12-01T00:00:00Z',
      validUntil: '2026-11-01T00:00:00Z',
      evidenceIds: ['synthetic'],
    };
    expect(navigationGraphSchema.safeParse(graph).success).toBe(false);
    expect(
      navigationNeedsSchema.safeParse({ maxUphillSlopePercent: -1 }).success,
    ).toBe(false);
  });
});

describe('Elegibilidade dos trechos', () => {
  it('a rampa posterior não compensa escada ou degrau anterior', () => {
    expect(assess(undefined, { stepFree: true }).reasons).toContain(
      'steps_not_allowed',
    );
    expect(
      assess(makeNavigationEdge({ kind: 'walkway', stepCount: 1 }), {
        stepFree: true,
      }).eligible,
    ).toBe(false);
  });

  it('não transforma ausência de informação em ausência de degraus', () => {
    expect(
      assess(makeNavigationEdge({ kind: 'walkway', stepCount: null }), {
        stepFree: true,
      }).reasons,
    ).toContain('step_count_unknown');
  });

  it('aplica limites de largura e inclinação, aceitando a fronteira exata', () => {
    const edge = makeNavigationEdge({
      kind: 'ramp',
      stepCount: 0,
      longitudinalSlopePercent: 5,
      crossSlopePercent: 2,
    });
    expect(
      assess(edge, {
        minWidthMeters: 1.2,
        maxUphillSlopePercent: 5,
        maxCrossSlopePercent: 2,
      }).eligible,
    ).toBe(true);
    expect(
      assess(edge, {
        minWidthMeters: 1.3,
        maxUphillSlopePercent: 4,
        maxCrossSlopePercent: 1,
      }).reasons,
    ).toEqual(
      expect.arrayContaining([
        'width_below_minimum',
        'uphill_slope_above_maximum',
        'cross_slope_above_maximum',
      ]),
    );
  });

  it('avalia subida e descida no sentido do trecho', () => {
    const edge = makeNavigationEdge({
      kind: 'ramp',
      stepCount: 0,
      longitudinalSlopePercent: -6,
    });
    expect(assess(edge, { maxUphillSlopePercent: 2 }).eligible).toBe(true);
    expect(assess(edge, { maxDownhillSlopePercent: 5 }).reasons).toContain(
      'downhill_slope_above_maximum',
    );
  });

  it('exige medidas e facilitadores selecionados, sem limiares normativos implícitos', () => {
    const result = assess(
      makeNavigationEdge({
        widthMeters: null,
        hasHandrail: null,
        hasTactilePaving: false,
        surface: 'loose',
      }),
      {
        minWidthMeters: 1,
        requireHandrail: true,
        requireTactilePaving: true,
        requireFirmSurface: true,
      },
    );
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'width_unknown',
        'handrail_unknown',
        'tactile_paving_required',
        'firm_surface_required',
      ]),
    );
  });

  it('não inventa limites de largura ou inclinação quando o usuário não os selecionou', () => {
    expect(
      assess(
        makeNavigationEdge({
          widthMeters: null,
          longitudinalSlopePercent: null,
          crossSlopePercent: null,
        }),
      ).eligible,
    ).toBe(true);
    expect(
      assess(
        makeNavigationEdge({
          kind: 'walkway',
          stepCount: 0,
          longitudinalSlopePercent: null,
        }),
        { maxUphillSlopePercent: 0 },
      ).reasons,
    ).toContain('longitudinal_slope_unknown');
  });

  it.each(['elevator', 'platform'] as const)(
    'exclui %s quando solicitado',
    (kind) => {
      expect(
        assess(makeNavigationEdge({ kind, stepCount: 0 }), { avoidLifts: true })
          .reasons,
      ).toContain('lifts_not_allowed');
    },
  );

  it('recusa trecho não conferido, vencido ou datado no futuro', () => {
    expect(
      assess(makeNavigationEdge({ verification: { status: 'unverified' } }))
        .reasons,
    ).toContain('unverified');
    const edge = makeNavigationEdge();
    if (edge.verification.status !== 'verified')
      throw new Error('Fixture inválida');
    edge.verification.validUntil = NAVIGATION_TEST_TIME;
    expect(assess(edge).reasons).toContain('verification_outdated');
    edge.verification.verifiedAt = '2026-11-09T12:00:00Z';
    edge.verification.validUntil = '2026-12-01T12:00:00Z';
    expect(assess(edge).reasons).toContain('verification_outdated');
  });

  it('não presume que um elevador funciona após expirar a leitura operacional', () => {
    const edge = makeNavigationEdge({ kind: 'elevator', stepCount: 0 });
    if (edge.availability.status !== 'open')
      throw new Error('Fixture inválida');
    edge.availability.validUntil = NAVIGATION_TEST_TIME;
    expect(assess(edge).reasons).toContain('availability_outdated');
    expect(
      assess(makeNavigationEdge({ availability: { status: 'unknown' } }))
        .reasons,
    ).toContain('availability_unknown');
    expect(
      assess(makeNavigationEdge({ availability: { status: 'closed' } }))
        .reasons,
    ).toContain('closed');
  });

  it('recusa instante de avaliação inválido em vez de ignorar expiração', () => {
    expect(() =>
      assessNavigationEdge(
        makeNavigationEdge(),
        navigationNeedsSchema.parse({}),
        'invalid',
      ),
    ).toThrow();
  });
});

describe('Busca na rede fictícia', () => {
  it('minimiza a soma das distâncias e não o número de trechos', () => {
    const graph = makeNavigationGraph();
    graph.edges[0].lengthMeters = 100;
    expect(run(graph)).toMatchObject({
      status: 'ok',
      edgeIds: ['sidewalk', 'ramp'],
      distanceMeters: 70,
    });
  });

  it('lida com ciclos sem alterar a rede recebida', () => {
    const graph = makeNavigationGraph();
    graph.edges.push(
      makeNavigationEdge({
        id: 'loop-back',
        fromNodeId: 'junction',
        toNodeId: 'origin',
        kind: 'walkway',
        stepCount: 0,
        lengthMeters: 1,
      }),
    );
    const snapshot = JSON.stringify(graph);
    expect(run(graph, { stepFree: true })).toMatchObject({
      status: 'ok',
      distanceMeters: 70,
    });
    expect(JSON.stringify(graph)).toBe(snapshot);
  });

  it('escolhe 20m com escada quando não há restrição e 70m sem degraus quando exigido', () => {
    expect(run()).toMatchObject({
      status: 'ok',
      edgeIds: ['stairs'],
      distanceMeters: 20,
      dataSource: 'demo',
    });
    const result = run(undefined, { stepFree: true });
    expect(result).toMatchObject({
      status: 'ok',
      nodeIds: ['origin', 'junction', 'building-access'],
      edgeIds: ['sidewalk', 'ramp'],
      distanceMeters: 70,
      needs: { stepFree: true },
    });
    expect(navigationResultSchema.safeParse(result).success).toBe(true);
  });

  it('impede que a rede fictícia seja usada no modo de navegação real', () => {
    expect(
      findNavigationRoute(
        makeNavigationGraph(),
        { ...request, mode: 'navigation' },
        NAVIGATION_TEST_TIME,
      ),
    ).toMatchObject({ status: 'demo_not_allowed' });
    expect(
      navigationRequestSchema.parse({
        originNodeId: 'a',
        destinationNodeId: 'b',
      }).mode,
    ).toBe('navigation');
  });

  it('não relaxa a restrição quando a única alternativa sem degraus é interditada', () => {
    const graph = makeNavigationGraph();
    graph.edges[2].availability = { status: 'closed' };
    expect(run(graph, { stepFree: true })).toMatchObject({
      status: 'no_route',
    });
  });

  it('distingue falta de informação no caminho possível de barreira confirmada', () => {
    const graph = makeNavigationGraph();
    graph.edges[2].widthMeters = null;
    expect(run(graph, { stepFree: true, minWidthMeters: 1 })).toMatchObject({
      status: 'insufficient_data',
    });
    graph.edges[2].widthMeters = 0.8;
    expect(run(graph, { stepFree: true, minWidthMeters: 1 })).toMatchObject({
      status: 'no_route',
    });
  });

  it('não atribui ausência de rota a informação desconhecida de trecho desconectado', () => {
    const graph = makeNavigationGraph();
    graph.edges = [
      makeNavigationEdge(),
      makeNavigationEdge({
        id: 'unrelated',
        fromNodeId: 'junction',
        toNodeId: 'origin',
        verification: { status: 'unverified' },
      }),
    ];
    expect(run(graph, { stepFree: true })).toMatchObject({
      status: 'no_route',
    });
  });

  it('não recomenda a alternativa sem degraus se sua verificação expirou', () => {
    const graph = makeNavigationGraph();
    const verification = graph.edges[2].verification;
    if (verification.status !== 'verified') throw new Error('Fixture inválida');
    verification.validUntil = NAVIGATION_TEST_TIME;
    const result = run(graph, { stepFree: true });
    expect(result).toMatchObject({ status: 'insufficient_data' });
    expect(navigationResultSchema.safeParse(result).success).toBe(true);
    expect(result).not.toHaveProperty('edgeIds');
  });

  it('não inventa ligação reversa ou segmento em linha reta', () => {
    expect(
      findNavigationRoute(
        makeNavigationGraph(),
        {
          ...request,
          originNodeId: 'building-access',
          destinationNodeId: 'origin',
        },
        NAVIGATION_TEST_TIME,
      ),
    ).toMatchObject({ status: 'no_route' });
  });

  it('trata origem igual ao destino e nó inexistente explicitamente', () => {
    expect(
      findNavigationRoute(
        makeNavigationGraph(),
        { ...request, destinationNodeId: 'origin' },
        NAVIGATION_TEST_TIME,
      ),
    ).toMatchObject({ status: 'ok', edgeIds: [], distanceMeters: 0 });
    expect(
      findNavigationRoute(
        makeNavigationGraph(),
        { ...request, originNodeId: 'missing' },
        NAVIGATION_TEST_TIME,
      ),
    ).toMatchObject({ status: 'node_not_found' });
  });

  it('funciona com rede de levantamento sem exigir lat/lon no motor', () => {
    const graph = makeNavigationGraph();
    graph.dataSource = 'field_survey';
    expect(
      findNavigationRoute(
        graph,
        { ...request, mode: 'navigation' },
        NAVIGATION_TEST_TIME,
      ),
    ).toMatchObject({
      status: 'ok',
      graphVersion: 'test-v1',
      dataSource: 'field_survey',
    });
  });
});
