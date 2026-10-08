import { describe, expect, it } from 'vitest';
import { createPlaceFormSchema } from 'shared';

const form = {
  name: 'Local de exemplo',
  category: 'building',
  latitude: '-23,4699',
  longitude: '-47.4297',
  building: '',
  floor: '0',
  description: '',
  source: 'demo',
};
describe('Contrato compartilhado do formulário de locais', () => {
  it('aceita vírgula decimal e mantém térreo como zero', () => {
    expect(createPlaceFormSchema.parse(form)).toMatchObject({
      latitude: -23.4699,
      longitude: -47.4297,
      floor: 0,
      building: null,
    });
  });
  it.each(['', ' ', 'texto', '91'])(
    'rejeita latitude inválida em vez de assumir zero: %j',
    (latitude) => {
      expect(
        createPlaceFormSchema.safeParse({ ...form, latitude }).success,
      ).toBe(false);
    },
  );
  it('recusa andar fracionário e preserva andar não informado', () => {
    expect(
      createPlaceFormSchema.safeParse({ ...form, floor: '0.5' }).success,
    ).toBe(false);
    expect(
      createPlaceFormSchema.parse({ ...form, floor: '' }).floor,
    ).toBeNull();
  });
});
