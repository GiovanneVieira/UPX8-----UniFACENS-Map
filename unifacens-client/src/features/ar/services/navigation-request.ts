export function createNavigationRequest() {
  let current: AbortController | null = null;

  function cancel() {
    const previous = current;
    current = null;
    previous?.abort();
  }

  async function run<T>(
    request: (signal: AbortSignal) => Promise<T>,
    onSuccess: (value: T) => void,
    onError: (error: unknown) => void,
  ) {
    cancel();
    const controller = new AbortController();
    current = controller;
    try {
      const result = await request(controller.signal);
      if (current === controller) onSuccess(result);
    } catch (error) {
      if (current === controller) onError(error);
    } finally {
      if (current === controller) current = null;
    }
  }

  return { run, cancel };
}
