import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import { isUsablePoint } from 'shared';

/**
 * ── Hosting por PONTO (guia oficial Cloud Anchors, lição definitiva
 *    2026-11-10 noite — dados da plataforma: finishScan = GPS null + 5% de
 *    resolve; hostCloudAnchor = GPS ✓ + 54%) ────────────────────────────────
 *
 * Fluxo (estratégia B, provada em device — 3/3 âncoras com GPS e 424–1094
 * keypoints): o TOQUE do usuário na retícula dispara 1 hit-test pontual →
 * preferir ExistingPlane* → createAnchoredNode (âncora NO PONTO tocado) →
 * guia curto "mova ao redor do ponto" (best practice da doc: "move the
 * phone around the anchor a little before hosting") → hostCloudAnchor(30d).
 *
 * A âncora fica NO ponto físico (geladeira), não no frame da sala/usuário —
 * cada pin resolve para o SEU lugar (fim do empilhamento) e o GPS é taggeado
 * automaticamente pelo SDK neste caminho.
 */

/** TTL do hosting em dias (D4 ≥30). */
const HOST_TTL_DAYS = 30;
/**
 * Guia "mova ao redor do ponto" antes de hospedar (best practice da doc:
 * "move the phone around the anchor a little before hosting" — dataset fraco
 * = ErrorHostingDatasetProcessingFailed, a falha dominante em device).
 */
const GUIDE_MS = 10_000;
/** Timeout JS das chamadas nativas (hit-test/create/host). */
const CALL_TIMEOUT_MS = 30_000;
/** Janela do hit do tap expira ~30s — a âncora criada dele não. */

export type PointHostingPhase =
  | { phase: 'idle' }
  | { phase: 'placing' }
  | { phase: 'guiding'; startedAt: number; position: [number, number, number] }
  | { phase: 'hosting'; position: [number, number, number] }
  | {
      phase: 'hosted';
      cloudAnchorId: string;
      /** Posição do PONTO tocado (hit) — provisória EXATA no mundo da sessão. */
      position: [number, number, number];
    }
  | { phase: 'failed'; error: string };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: sem resposta em ${ms}ms`)), ms),
    ),
  ]);
}

export function usePointHosting({
  focused,
  trackingActive,
  screenWidth,
  screenHeight,
}: {
  focused: boolean;
  trackingActive: boolean;
  screenWidth: number;
  screenHeight: number;
}) {
  const [state, setState] = useState<PointHostingPhase>({ phase: 'idle' });
  /** Cena Viro (hit-test/createAnchoredNode são métodos DA CENA). */
  const sceneRef = useRef<any>(null);
  /** Navigator Viro (hostCloudAnchor é método DO NAVIGATOR — lição de device
   *  2026-11-10: chamar na cena retorna undefined e crasha lendo .state). */
  const navigatorRef = useRef<any>(null);
  const aliveRef = useRef(true);

  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const trackingRef = useRef(trackingActive);
  trackingRef.current = trackingActive;
  const phaseRef = useRef<PointHostingPhase['phase']>('idle');
  phaseRef.current = state.phase;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const handleSceneReady = useCallback((scene: any) => {
    sceneRef.current = scene;
  }, []);

  const handleNavigatorReady = useCallback((nav: any) => {
    navigatorRef.current = nav;
  }, []);

  /** Abre o fluxo: "placing" — o próximo toque na retícula posiciona. */
  const begin = useCallback(() => {
    console.log('[ARHost] fluxo por PONTO — toque na retícula para posicionar');
    setState({ phase: 'placing' });
  }, []);

  const cancel = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  /**
   * O TOQUE da retícula (roudeado pelo container quando phase==='placing'):
   * 1 hit-test no pixel central → melhor hit anchorable → createAnchoredNode
   * (retry ×2 — interop Fabric, §12.4) → âncora NO PONTO + posição exata.
   */
  const handleTap = useCallback(async (): Promise<boolean> => {
    if (phaseRef.current !== 'placing') return false;
    const scene = sceneRef.current;
    if (!scene?.performARHitTestWithPoint || !scene?.createAnchoredNode) {
      setState({ phase: 'failed', error: 'cena AR não pronta' });
      return true;
    }
    if (!focusedRef.current || !trackingRef.current) {
      setState({ phase: 'failed', error: 'tracking/foco indisponíveis — aguarde o mundo estabilizar' });
      return true;
    }

    const pixelRatio = PixelRatio.get();
    const px = Math.round((screenWidth / 2) * pixelRatio);
    const py = Math.round((screenHeight / 2) * pixelRatio);

    try {
      // 1× hit-test pontual (não é poll — seguro; tap só ocorce com tab viva).
      const hits = (await withTimeout(
        scene.performARHitTestWithPoint(px, py) as Promise<unknown>,
        CALL_TIMEOUT_MS,
        'hitTest',
      )) as any[];

      const usable = (Array.isArray(hits) ? hits : []).filter(
        (h: any) => isUsablePoint(h?.transform?.position),
      );
      const plane =
        usable.find((h: any) => h.type === 'ExistingPlaneUsingExtent') ??
        usable.find((h: any) => h.type === 'ExistingPlane');
      const feature = usable.find((h: any) => h.type === 'FeaturePoint');
      const best = plane ?? feature ?? null;
      if (!best) {
        setState({
          phase: 'failed',
          error: 'Nenhuma superfície na mira — aponte para uma superfície com textura e toque novamente',
        });
        return true;
      }
      console.log(
        `[ARHost] hit ${best.type} — ${plane ? 'plano estável ✓' : 'FeaturePoint (instável — plano é melhor)'}`,
      );

      // createAnchoredNode com retry ×2 (interop pode rejeitar a 1ª).
      let anchorId: string | null = null;
      let position: [number, number, number] | null = null;
      for (let attempt = 1; attempt <= 2 && !anchorId; attempt++) {
        try {
          const node = (await withTimeout(
            scene.createAnchoredNode(best) as Promise<unknown>,
            CALL_TIMEOUT_MS,
            'createAnchoredNode',
          )) as { anchorId?: string } | null;
          anchorId = node?.anchorId ?? null;
        } catch (err) {
          console.warn(`[ARHost] createAnchoredNode (${attempt}/2):`, err);
        }
      }
      if (!anchorId) {
        setState({
          phase: 'failed',
          error: 'Falha ao criar a âncora local — mire um PLANO detectado (chão/mesa) e tente de novo',
        });
        return true;
      }
      position = [
        Number(best.transform.position[0].toFixed(2)),
        Number(best.transform.position[1].toFixed(2)),
        Number(best.transform.position[2].toFixed(2)),
      ] as [number, number, number];
      console.log(
        `[ARHost] âncora local NO PONTO ${anchorId.slice(0, 14)}… pos=[${position.map((v) => v.toFixed(2)).join(', ')}]`,
      );

      // Guia curta: features ao redor do ponto (best practice da doc).
      setState({ phase: 'guiding', startedAt: Date.now(), position });

      // Após a guia, hospeda.
      setTimeout(
        () => {
          void (async () => {
            if (!aliveRef.current || phaseRef.current !== 'guiding') return;
            if (!focusedRef.current) {
              setState({ phase: 'failed', error: 'tab sem foco — hosting cancelado' });
              return;
            }
            console.log('[ARHost] guia concluída — hostCloudAnchor em voo…');
            setState({ phase: 'hosting', position });
            try {
              const nav = navigatorRef.current;
              if (!nav?.hostCloudAnchor) {
                console.warn('[ARHost] hostCloudAnchor indisponível no navigator');
                setState({ phase: 'failed', error: 'navigator não pronto — reabra a tela AR' });
                return;
              }
              const result = (await withTimeout(
                nav.hostCloudAnchor(anchorId, HOST_TTL_DAYS) as Promise<{
                  success?: boolean;
                  cloudAnchorId?: string;
                  error?: string;
                  state?: string;
                } | undefined | null>,
                90_000,
                'hostCloudAnchor',
              )) as { success?: boolean; cloudAnchorId?: string; error?: string; state?: string } | undefined | null;
              if (!aliveRef.current) return;
              if (result?.success && result.cloudAnchorId) {
                console.log(
                  `[ARHost] hospedada NO PONTO — ${result.cloudAnchorId.slice(0, 16)}… TTL ${HOST_TTL_DAYS}d`,
                );
                setState({
                  phase: 'hosted',
                  cloudAnchorId: result.cloudAnchorId,
                  position,
                });
              } else {
                const errMsg = String(result?.error ?? result?.state ?? 'hosting falhou (sem detalhe)');
                console.warn(`[ARHost] hostCloudAnchor FALHOU: ${errMsg}`);
                setState({ phase: 'failed', error: errMsg });
              }
            } catch (err) {
              if (!aliveRef.current) return;
              const errMsg = err instanceof Error ? err.message : String(err);
              console.warn('[ARHost] hostCloudAnchor erro:', errMsg);
              setState({
                phase: 'failed',
                error: errMsg,
              });
            }
          })();
        },
        GUIDE_MS,
      );
      return true;
    } catch (err) {
      setState({ phase: 'failed', error: err instanceof Error ? err.message : String(err) });
      return true;
    }
  }, [screenWidth, screenHeight]);

  return {
    state,
    handleSceneReady,
    handleNavigatorReady,
    begin,
    handleTap,
    cancel,
  };
}
