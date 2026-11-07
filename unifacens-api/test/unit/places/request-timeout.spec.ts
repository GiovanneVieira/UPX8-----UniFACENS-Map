import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRequestTimeout } from '../../../../unifacens-client/src/services/request-timeout';

function pendingRequest(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

afterEach(() => vi.useRealTimers());

describe('Prazo das operações do catálogo', () => {
  it('retorna os dados e remove timer e listener após sucesso', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(
      withRequestTimeout(async () => ({ id: 'local' }), controller.signal),
    ).resolves.toEqual({ id: 'local' });
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('interrompe resposta pendente após oito segundos e permite nova tentativa', async () => {
    vi.useFakeTimers();
    const result = withRequestTimeout(pendingRequest);
    const assertion = expect(result).rejects.toThrow(
      'O servidor demorou para responder',
    );
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    await expect(withRequestTimeout(async () => 'recuperado')).resolves.toBe(
      'recuperado',
    );
  });

  it('mantém o prazo durante a leitura do corpo após receber headers', async () => {
    vi.useFakeTimers();
    const result = withRequestTimeout(async (signal) => {
      const response = await Promise.resolve({
        json: () => pendingRequest(signal),
      });
      return response.json();
    });
    const assertion = expect(result).rejects.toThrow('O servidor demorou');
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });

  it('preserva cancelamento de uma busca obsoleta', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = withRequestTimeout(pendingRequest, controller.signal);
    const assertion = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('repassa sinal já cancelado sem aguardar timeout', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    await expect(
      withRequestTimeout(pendingRequest, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserva erros de HTTP e validação e limpa recursos', async () => {
    vi.useFakeTimers();
    const error = new Error('Local não encontrado');
    await expect(
      withRequestTimeout(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });
});
