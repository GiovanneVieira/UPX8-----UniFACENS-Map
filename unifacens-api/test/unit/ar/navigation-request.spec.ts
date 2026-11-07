import { describe, expect, it, vi } from 'vitest';
import { createNavigationRequest } from '../../../../unifacens-client/src/features/ar/services/navigation-request';

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Solicitações de navegação AR', () => {
  it('ignora a rota antiga que chega depois do novo destino', async () => {
    const navigation = createNavigationRequest();
    const old = deferred();
    const next = deferred();
    const success = vi.fn();
    const failure = vi.fn();
    let oldSignal!: AbortSignal;
    const first = navigation.run(
      (signal) => {
        oldSignal = signal;
        return old.promise;
      },
      success,
      failure,
    );
    const second = navigation.run(() => next.promise, success, failure);
    expect(oldSignal.aborted).toBe(true);
    next.resolve('destino novo');
    await second;
    old.resolve('destino antigo');
    await first;
    expect(success).toHaveBeenCalledExactlyOnceWith('destino novo');
    expect(failure).not.toHaveBeenCalled();
  });

  it('cancelar impede resposta tardia de reativar a navegação', async () => {
    const navigation = createNavigationRequest();
    const pending = deferred();
    const success = vi.fn();
    const failure = vi.fn();
    let signal!: AbortSignal;
    const task = navigation.run(
      (value) => {
        signal = value;
        return pending.promise;
      },
      success,
      failure,
    );
    navigation.cancel();
    expect(signal.aborted).toBe(true);
    pending.resolve('rota');
    await task;
    expect(success).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  it('não mostra erro de requisição cancelada', async () => {
    const navigation = createNavigationRequest();
    const pending = deferred();
    const failure = vi.fn();
    const task = navigation.run(() => pending.promise, vi.fn(), failure);
    navigation.cancel();
    pending.reject(new Error('AbortError'));
    await task;
    expect(failure).not.toHaveBeenCalled();
  });

  it('erro antigo não sobrescreve o carregamento do novo destino', async () => {
    const navigation = createNavigationRequest();
    const old = deferred();
    const next = deferred();
    const failure = vi.fn();
    const success = vi.fn();
    const first = navigation.run(() => old.promise, success, failure);
    const second = navigation.run(() => next.promise, success, failure);
    old.reject(new Error('Falha antiga'));
    await first;
    expect(failure).not.toHaveBeenCalled();
    next.resolve('novo');
    await second;
    expect(success).toHaveBeenCalledExactlyOnceWith('novo');
  });

  it('mostra a falha atual e permite uma nova tentativa', async () => {
    const navigation = createNavigationRequest();
    const failure = vi.fn();
    const success = vi.fn();
    const error = new Error('Falha de conexão');
    await navigation.run(
      async () => {
        throw error;
      },
      success,
      failure,
    );
    expect(failure).toHaveBeenCalledExactlyOnceWith(error);
    await navigation.run(async () => 'recuperada', success, failure);
    expect(success).toHaveBeenCalledExactlyOnceWith('recuperada');
  });
});
