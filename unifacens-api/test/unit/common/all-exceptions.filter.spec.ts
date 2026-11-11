import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from '../../../src/common/filters/all-exceptions.filter.js';

function run(filter: AllExceptionsFilter, exception: unknown, url = '/test') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  filter.catch(exception, {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url }),
    }),
  } as never);
  return { status, json };
}

/** Simula o wrapper do Drizzle: erro com .cause aninhado. */
function drizzleWrapped(pgError: object) {
  return { name: 'DrizzleQueryError', cause: pgError };
}

describe('AllExceptionsFilter (envelope global de erros)', () => {
  const filter = new AllExceptionsFilter('test');

  it('HttpException com corpo string vira envelope com path/timestamp', () => {
    const { status, json } = run(filter, new NotFoundException('Âncora sumiu'));
    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: 404,
      message: 'Âncora sumiu',
      path: '/test',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('preserva corpo objeto (validationErrors) e apenas anota path/timestamp', () => {
    const { status, json } = run(
      filter,
      new BadRequestException({
        message: 'Dados inválidos',
        validationErrors: [{ campo: 'name' }],
      }),
    );
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.validationErrors).toEqual([{ campo: 'name' }]);
    expect(body.path).toBe('/test');
    expect(body.timestamp).toBeDefined();
  });

  it('mapeia FK violation do Postgres (23503) para 409 amigável', () => {
    const { status, json } = run(
      filter,
      drizzleWrapped({
        code: '23503',
        constraint: 'places_category_id_categories_id_fkey',
      }),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].message).toMatch(/em uso por locais/i);
  });

  it('mapeia unique violation (23505) para 409 de duplicado', () => {
    const { status, json } = run(
      filter,
      drizzleWrapped({ code: '23505', constraint: 'categories_slug_key' }),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].message).toMatch(/já existe/i);
  });

  it('mapeia check violation (23514) para 400', () => {
    const { status } = run(
      filter,
      drizzleWrapped({ code: '23514', constraint: 'models_format_values' }),
    );
    expect(status).toHaveBeenCalledWith(400);
  });

  it('erro desconhecido vira 500 sem vazar detalhe em produção', () => {
    const prod = new AllExceptionsFilter('production');
    const { status, json } = run(prod, new Error('segredo interno do banco'));
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].message).not.toContain('segredo');
    // Em dev o detalhe permanece para debug rápido.
    const dev = new AllExceptionsFilter('development');
    const devResult = run(dev, new Error('detalhe dev'));
    expect(devResult.json.mock.calls[0][0].message).toBe('detalhe dev');
  });
});
