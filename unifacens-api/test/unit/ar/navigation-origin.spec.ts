import { describe, expect, it, vi } from 'vitest';
import {
  NavigationOriginError,
  validateNavigationOrigin,
} from '../../../../unifacens-client/src/features/ar/services/navigation-origin';
import { createNavigationRequest } from '../../../../unifacens-client/src/features/ar/services/navigation-request';

const campus = { latitude: -23.4699, longitude: -47.4297, altitude: 605 };

function northOfCampus(meters: number) {
  return {
    ...campus,
    latitude: campus.latitude + (meters / 6371000) * (180 / Math.PI),
  };
}

describe('Origem real da navegação AR', () => {
  it('preserva as coordenadas recebidas dentro do campus', () => {
    const origin = Object.freeze({ ...campus, latitude: -23.47035 });
    expect(validateNavigationOrigin(origin, true)).toBe(origin);
  });

  it('não aceita o centro padrão antes de receber localização', () => {
    expect(() => validateNavigationOrigin(campus, false)).toThrow(
      'Localização indisponível',
    );
  });

  it.each([
    { latitude: NaN },
    { longitude: Infinity },
    { latitude: 91 },
    { longitude: -181 },
    { altitude: NaN },
  ])('rejeita coordenadas inválidas: %j', (value) => {
    expect(() =>
      validateNavigationOrigin({ ...campus, ...value }, true),
    ).toThrow(NavigationOriginError);
  });

  it('aceita a origem a 999 metros e recusa a origem a 1001 metros', () => {
    const nearby = northOfCampus(999);
    expect(validateNavigationOrigin(nearby, true)).toBe(nearby);
    expect(() => validateNavigationOrigin(northOfCampus(1001), true)).toThrow(
      'fora da área de navegação',
    );
  });

  it('não substitui uma posição distante nem solicita rota', async () => {
    const origin = Object.freeze({
      latitude: -23.55,
      longitude: -46.63,
      altitude: 760,
    });
    const request = vi.fn();
    const success = vi.fn();
    const failure = vi.fn();
    await createNavigationRequest().run(
      async () => {
        const validated = validateNavigationOrigin(origin, true);
        return request(validated);
      },
      success,
      failure,
    );
    expect(request).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith(expect.any(NavigationOriginError));
    expect(origin.latitude).toBe(-23.55);
  });

  it('permite nova tentativa quando a localização chega à área do campus', async () => {
    const navigation = createNavigationRequest();
    const success = vi.fn();
    const failure = vi.fn();
    await navigation.run(
      async () => validateNavigationOrigin(northOfCampus(2000), true),
      success,
      failure,
    );
    await navigation.run(
      async () => validateNavigationOrigin(campus, true),
      success,
      failure,
    );
    expect(success).toHaveBeenCalledExactlyOnceWith(campus);
    expect(failure).toHaveBeenCalledTimes(1);
  });
});
