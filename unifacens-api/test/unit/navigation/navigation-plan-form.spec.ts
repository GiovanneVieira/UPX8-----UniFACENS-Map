import { describe, expect, it } from 'vitest';
import {
  navigationPlanFormSchema,
  type NavigationPlanFormValues,
} from 'shared';

const values: NavigationPlanFormValues = {
  originNodeId: 'origin',
  destinationNodeId: 'building-access',
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

describe('Entrada do planejamento de percurso', () => {
  it('não inventa limites quando campos opcionais ficam vazios', () => {
    const request = navigationPlanFormSchema.parse(values);
    expect(request.needs).toMatchObject({
      stepFree: true,
      minWidthMeters: null,
      maxUphillSlopePercent: null,
      maxDownhillSlopePercent: null,
      maxCrossSlopePercent: null,
    });
  });
  it('converte vírgula e ponto decimal, preservando limite zero de inclinação', () => {
    const request = navigationPlanFormSchema.parse({
      ...values,
      minWidthMeters: ' 1,20 ',
      maxUphillSlopePercent: '5.5',
      maxDownhillSlopePercent: '0',
    });
    expect(request.needs).toMatchObject({
      minWidthMeters: 1.2,
      maxUphillSlopePercent: 5.5,
      maxDownhillSlopePercent: 0,
    });
  });
  it.each(['-1', 'NaN', 'Infinity', '1e3', '1,2.3', 'abc', '1 000'])(
    'rejeita medida inválida %s',
    (minWidthMeters) => {
      expect(
        navigationPlanFormSchema.safeParse({ ...values, minWidthMeters })
          .success,
      ).toBe(false);
    },
  );
  it('rejeita largura zero e identifica o campo para exibir o erro', () => {
    const result = navigationPlanFormSchema.safeParse({
      ...values,
      minWidthMeters: '0',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(['minWidthMeters']);
  });
  it('exige ambos os extremos, mas permite consultar distância zero no mesmo acesso', () => {
    expect(
      navigationPlanFormSchema.safeParse({ ...values, originNodeId: '' })
        .success,
    ).toBe(false);
    expect(
      navigationPlanFormSchema.safeParse({ ...values, destinationNodeId: ' ' })
        .success,
    ).toBe(false);
    expect(
      navigationPlanFormSchema.safeParse({
        ...values,
        originNodeId: 'building-access',
      }).success,
    ).toBe(true);
  });
});
