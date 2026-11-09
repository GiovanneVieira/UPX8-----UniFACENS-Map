import React, { FC, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  ViroARScene,
  ViroBox,
  ViroText,
  ViroNode,
  ViroQuad,
  ViroAmbientLight,
  ViroDirectionalLight,
  ViroMaterials,
} from '@reactvision/react-viro';
import { ViroSharedFrame, cloudAnchorFrameSource } from '@reactvision/react-viro';
import type { Anchor } from 'shared';
import { isUsablePoint } from 'shared';
import type { RouteChevron } from '@/features/ar/hooks/use-ar-navigation';
import type { GeospatialPose } from './hooks/use-geospatial-pose';

// Registra materiais vivos com Constant lighting para visualização 3D garantida em qualquer iluminação
ViroMaterials.createMaterials({
  blueAnchor: {
    diffuseColor: '#3B82F6',
    lightingModel: 'Constant',
  },
  emeraldAnchor: {
    diffuseColor: '#10B981',
    lightingModel: 'Constant',
  },
  amberAnchor: {
    diffuseColor: '#F59E0B',
    lightingModel: 'Constant',
  },
  violetAnchor: {
    diffuseColor: '#8B5CF6',
    lightingModel: 'Constant',
  },
  roseAnchor: {
    diffuseColor: '#F43F5E',
    lightingModel: 'Constant',
  },
  pinStem: {
    diffuseColor: '#94A3B8',
    lightingModel: 'Constant',
  },
  detectedPlaneSurface: {
    diffuseColor: '#3B82F633', // Azul translúcido para superfícies rastreadas
    lightingModel: 'Constant',
  },
  // Rota de navegação (estilo Google Live View): chevrons azuis de textura no chão
  routeChevron: {
    diffuseTexture: require('../../../assets/images/ar/route-chevron.png'),
    lightingModel: 'Constant',
  },
  // Postes de diagnóstico (dev): cravados em coordenadas FIXAS do mundo AR
  diagPost: {
    diffuseColor: '#F472B6',
    lightingModel: 'Constant',
  },
  diagOrigin: {
    diffuseColor: '#FBBF24',
    lightingModel: 'Constant',
  },
  anchorHitArea: {
    diffuseColor: '#FFFFFF00', // Invisível — seleção é por retícula, não por raycast
    lightingModel: 'Constant',
  },
  // MODO PREVIEW: âmbar vibrante — inconfundível com os pins regulares
  previewPin: {
    diffuseColor: '#F59E0B',
    lightingModel: 'Constant',
  },
  previewStem: {
    diffuseColor: '#FBBF24',
    lightingModel: 'Constant',
  },
});

/**
 * Visualização dos planos detectados (quads azuis translúcidos) — DESLIGADA.
 *
 * ⚠️ Lição de device (2026-11-08): um plano horizontal grande (cômodo inteiro)
 * renderizado como ViroQuad translúcido #3B82F633 visto de dentro ocupa o
 * frustum INTEIRO abaixo da sua borda distante — parecia um "artefato azul /
 * estar dentro do pin" cobrindo ~90% da tela e ocluindo os pins reais.
 * Detecção de planos permanece ATIVA (hit-tests dependem dela); só o RENDER
 * visual fica fora. Flipar aqui apenas para depuração.
 */
const SHOW_DETECTED_PLANES = false;

export interface ViroARAnchorSceneProps {
  anchors?: Anchor[];
  /**
   * Sensores cloud anchor MEMOIZADOS (source criado 1× por sessão).
   * Sem memo, cada re-render do container recria cloudAnchorFrameSource
   * → ViroSharedFrame componentDidUpdate pode re-adquirir.
   */
  cloudAnchorSensors?: Array<{
    pin: Anchor;
    source: ReturnType<typeof cloudAnchorFrameSource>;
  }>;
  /**
   * ARCore session pronto (Geospatial habilitado + tracking 3)?
   * Sensores cloud SÓ montam quando true — montar antes do ARCore
   * session ready faz resolveCloudAnchor pendurar PARA SEMPRE.
   * Uma vez montados, NÃO desmontar (evita "already in progress").
   */
  cloudSensorsReady?: boolean;
  /** Callback quando um cloud anchor localiza (posição em sessão AR). */
  onCloudAnchorLocalized?: (
    pinId: string,
    cloudAnchorId: string,
    position: [number, number, number],
    yawDeg: number,
  ) => void;
  /** Callback quando um cloud anchor falha ao localizar. */
  onCloudAnchorError?: (pinId: string, error: string) => void;
  /**
   * Superfície detectável no centro da tela (retícula)? Muda a cor da
   * retícula: verde = pode criar pin, vermelho = sem superfície.
   */
  surfaceAvailable?: boolean;
  /**
   * Tracking do ARCore saudável (estado 3)? Com tracking degradado o quadro
   * do mundo NÃO é rígido — TODO conteúdo AR "anda" com o aparelho (§12.8).
   * Conteúdo é OCULTADO em vez de mentir visualmente (padrão Live View).
   */
  trackingHealthy?: boolean;
  /**
   * MODO PREVIEW: posição do pin que está sendo criado. Quando definido,
   * todos os pins regulares são OCULTADOS e apenas o preview aparece —
   * o usuário vê em tempo real onde o ponto será persistido conforme
   * ajusta a distância da mira.
   */
  previewPosition?: [number, number, number] | null;
  /** Janela de chevrons da sessão de navegação (keys = arco em metros). */
  routeChevrons?: RouteChevron[];
  /** Status do modo Geospatial (suporte no device / erros de key). */
  onGeospatialStatus?: (supported: boolean, error?: string) => void;
  /** Pose geoespacial da câmera (poll 1Hz, ancorada na Terra via VPS). */
  onGeospatialPose?: (pose: Omit<GeospatialPose, 'timestamp'>) => void;
  /** Passa o arSceneNavigator para o container (criar âncoras nativas). */
  onNavigatorReady?: (navigator: any) => void;
  onSelectAnchor?: (anchor: Anchor) => void;
  onPlaneTapped?: (anchorId: string, position: [number, number, number]) => void;
  onCameraUpdate?: (
    pos: [number, number, number],
    fwd: [number, number, number],
    yawDeg: number,
  ) => void;
  onTrackingUpdate?: (state: number, reason: number) => void;
  onRegisterSceneRef?: (sceneRef: any) => void;
  onPlanesUpdated?: (count: number, planes: any[]) => void;
  onMarkerFound?: (anchorMap: any) => void;
  onMarkerUpdated?: (anchorMap: any) => void;
  onMarkerRemoved?: () => void;
  sceneNavigator?: any;
  arSceneNavigator?: any;
}

export const ViroARAnchorScene: FC<ViroARAnchorSceneProps> = (props) => {
  // Extrai propriedades dinâmicas do viroAppProps
  const viroProps: ViroARAnchorSceneProps =
    props.sceneNavigator?.viroAppProps ||
    props.arSceneNavigator?.viroAppProps ||
    props;

  const anchors = viroProps.anchors || [];
  const trackingHealthy = viroProps.trackingHealthy !== false;
  const previewPosition = viroProps.previewPosition ?? null;
  const cloudAnchorSensors = viroProps.cloudAnchorSensors || [];
  const cloudSensorsReady = viroProps.cloudSensorsReady === true;
  /** Uma vez montados (ready passou a true 1×), ficam montados para sempre. */
  const cloudSensorsMountedRef = useRef(false);
  if (cloudSensorsReady) cloudSensorsMountedRef.current = true;
  const shouldRenderSensors = cloudSensorsMountedRef.current;
  const onCloudAnchorLocalized = viroProps.onCloudAnchorLocalized;
  const onCloudAnchorError = viroProps.onCloudAnchorError;
  const onCameraUpdate = viroProps.onCameraUpdate;
  const onTrackingUpdate = viroProps.onTrackingUpdate;
  const onRegisterSceneRef = viroProps.onRegisterSceneRef;
  const onPlanesUpdated = viroProps.onPlanesUpdated;
  const routeChevrons = viroProps.routeChevrons || [];
  // onPlaneTapped removido: planos NÃO devem ter onClick (interceptam taps nos pins).
  // onSelectAnchor removido: tap vem do RNGH Exclusive(Tap, Pinch) no container,
  // não mais do onClick da GLSurfaceView do Viro.

  const arSceneRef = useRef<any>(null);
  const allPlanesRef = useRef<Map<string, any>>(new Map());
  const [visiblePlanes, setVisiblePlanes] = useState<any[]>([]);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCameraUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (arSceneRef.current && onRegisterSceneRef) {
      onRegisterSceneRef(arSceneRef.current);
    }
  }, [onRegisterSceneRef]);

  // ── Modo Geospatial (ARCore/VPS): habilita e faz poll da pose da câmera ──
  // A pose é ANCORADA NA TERRA (GPS + VPS + SLAM fundidos pelo ARCore) e se
  // auto-corrige — é a fonte da verdade que substitui GPS+bússola no client.
  // Callbacks em refs: o interval não re-cria a cada viroAppProps.
  const geoStatusRef = useRef(viroProps.onGeospatialStatus);
  const geoPoseRef = useRef(viroProps.onGeospatialPose);
  geoStatusRef.current = viroProps.onGeospatialStatus;
  geoPoseRef.current = viroProps.onGeospatialPose;
  const geoEnabledRef = useRef(false);
  const navigatorReadyRef = useRef(viroProps.onNavigatorReady);
  navigatorReadyRef.current = viroProps.onNavigatorReady;
  /** Guarda de mount: SIGSEGV se chamarmos nativo após unmount da cena. */
  const sceneAliveRef = useRef(true);

  useEffect(() => {
    sceneAliveRef.current = true; // mount
    return () => {
      sceneAliveRef.current = false; // unmount — intervals checam isto
      geoEnabledRef.current = false;
    };
  }, []);

  useEffect(() => {
    // sceneNavigator/arSceneNavigator vivem nos PROPS crus da cena (o mesmo
    // objeto de onde lemos viroAppProps) — não dentro de viroProps/viroAppProps.
    const nav = (props.arSceneNavigator ?? props.sceneNavigator) as any;
    if (nav) {
      navigatorReadyRef.current?.(nav);
    }
    if (!nav?.isGeospatialModeSupported || !nav?.getCameraGeospatialPose) {
      console.warn(
        '[ARGeo] métodos geospatial ausentes no arSceneNavigator —',
        'arSceneNavigator?', Boolean(props.arSceneNavigator),
        '| sceneNavigator?', Boolean(props.sceneNavigator),
        '| keys:', nav ? Object.keys(nav).filter((k) => k.toLowerCase().includes('geo')).join(',') || 'nenhuma' : 'nav indefinido',
      );
      geoStatusRef.current?.(false, 'Geospatial não disponível nesta build');
      return;
    }

    // Timeout: se a chamada nativa pendurar (ex.: key ausente no manifest),
    // revela em vez de ficar mudo para sempre.
    const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label}: sem resposta nativa em ${ms}ms`)), ms),
        ),
      ]);
    };

    const maxAttempts = 10;
    let attempts = 0;
    // Delay inicial: a interop Fabric precisa settle após o mount da cena
    const INITIAL_DELAY_MS = 2000;
    const RETRY_INTERVAL_MS = 3000;
    let isTrying = false; // guarda local anti-reentrada

    const tryEnable = async (): Promise<void> => {
      if (!sceneAliveRef.current) return; // cena morta → não tocar no nativo
      attempts++;
      try {
        const support = (await withTimeout(
          nav.isGeospatialModeSupported() as Promise<{ supported?: boolean; error?: string }>,
          8000,
          'isGeospatialModeSupported',
        )) as { supported?: boolean; error?: string };
        if (support?.supported) {
          await nav.setGeospatialModeEnabled(true);
          geoEnabledRef.current = true;
          console.log('[ARGeo] modo Geospatial habilitado (provider arcore)');
          geoStatusRef.current?.(true, undefined);
          return;
        }
        // Diagnóstico granular: qual gate falhou (key, location, play-services)?
        let setup: unknown = null;
        if (nav.getGeospatialSetupStatus) {
          try {
            setup = await withTimeout(nav.getGeospatialSetupStatus(), 8000, 'getGeospatialSetupStatus');
          } catch {
            // diagnóstico é best-effort
          }
        }
        console.warn(
          `[ARGeo] não suportado (tentativa ${attempts}/${maxAttempts}):`,
          support?.error ?? 'sem mensagem',
          '| setup:',
          JSON.stringify(setup),
        );
        // Retry é feito pelo retryInterval fora desta função
        geoStatusRef.current?.(false, support?.error);
        return;
      } catch (err) {
        // "Invalid view type" etc. podem ser transições da interop no mount — retry
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[ARGeo] falha (tentativa ${attempts}/${maxAttempts}):`, message);
        geoStatusRef.current?.(false, message);
      }
    };
    // Delay inicial para a interop Fabric settle + retry agressivo
    const startTimer = setTimeout(() => void tryEnable(), INITIAL_DELAY_MS);

    const retryInterval = setInterval(() => {
      if (geoEnabledRef.current || attempts >= maxAttempts) {
        clearInterval(retryInterval);
        return;
      }
      if (!isTrying) {
        isTrying = true;
        void tryEnable().finally(() => { isTrying = false; });
      }
    }, RETRY_INTERVAL_MS);

    const timer = setInterval(async () => {
      if (!sceneAliveRef.current || !geoEnabledRef.current) return;
      try {
        const result = await nav.getCameraGeospatialPose();
        if (result?.success && result.pose) {
          geoPoseRef.current?.(result.pose);
        }
      } catch {
        // poll silencioso: erros persistentes aparecem no status/habilitação
      }
    }, 1000);

    return () => {
      clearTimeout(startTimer);
      clearInterval(retryInterval);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtra âncoras cujo arPosition foi resolvido e projetado no espaço tridimensional.
  // Tracking degradado (≠3) => conteúdo OCULTO: o mundo não é rígido e tudo
  // renderizaria "colado" ao aparelho (§12.8) — melhor sumir que mentir.
  // MODO PREVIEW: pins regulares ocultos — apenas o preview aparece.
  const visibleAnchors = useMemo(() => {
    if (!trackingHealthy || previewPosition) return [];
    return anchors.filter((a) => isUsablePoint(a.arPosition));
  }, [anchors, trackingHealthy, previewPosition]);

  // Notifica o componente pai e atualiza planos visíveis de forma agendada fora do render
  const schedulePlanesUpdate = useCallback(() => {
    if (updateTimerRef.current) return;

    updateTimerRef.current = setTimeout(() => {
      updateTimerRef.current = null;
      const allPlanes = Array.from(allPlanesRef.current.values());

      onPlanesUpdated?.(allPlanes.length, allPlanes);

      // Renderiza apenas as 3 maiores superfícies para evitar sobrecarga de views nativas
      const sorted = [...allPlanes].sort((a, b) => {
        const areaA = (a.width || 0.5) * (a.height || 0.5);
        const areaB = (b.width || 0.5) * (b.height || 0.5);
        return areaB - areaA;
      });

      setVisiblePlanes(sorted.slice(0, 3));
    }, 400);
  }, [onPlanesUpdated]);

  const handleAnchorFound = useCallback(
    (anchor: any) => {
      if (anchor && anchor.anchorId != null) {
        allPlanesRef.current.set(String(anchor.anchorId), anchor);
        schedulePlanesUpdate();
      }
    },
    [schedulePlanesUpdate],
  );

  const handleAnchorUpdated = useCallback(
    (anchor: any) => {
      if (anchor && anchor.anchorId != null) {
        allPlanesRef.current.set(String(anchor.anchorId), anchor);
        schedulePlanesUpdate();
      }
    },
    [schedulePlanesUpdate],
  );

  const handleAnchorRemoved = useCallback(
    (anchor: any) => {
      if (anchor && anchor.anchorId != null) {
        allPlanesRef.current.delete(String(anchor.anchorId));
        schedulePlanesUpdate();
      }
    },
    [schedulePlanesUpdate],
  );

  const materialsPalette = ['blueAnchor', 'emeraldAnchor', 'amberAnchor', 'violetAnchor', 'roseAnchor'];

  return (
    <ViroARScene
      ref={arSceneRef}
      anchorDetectionTypes={['PlanesHorizontal']}
      onTrackingUpdated={(state: any, reason: any) => {
        onTrackingUpdate?.(Number(state), Number(reason));
      }}
      onAnchorFound={handleAnchorFound}
      onAnchorUpdated={handleAnchorUpdated}
      onAnchorRemoved={handleAnchorRemoved}
      onCameraTransformUpdate={(event: any) => {
        const now = Date.now();
        if (now - lastCameraUpdateRef.current < 100) return;
        lastCameraUpdateRef.current = now;
        const cam = event.cameraTransform || event;
        const pos: [number, number, number] = cam.position || [0, 0, 0];
        const fwd: [number, number, number] = cam.forward || [0, 0, -1];
        // rotation[1] = yaw da câmera no MUNDO AR (graus, euler) — fonte mais
        // robusta que o vetor forward (sem ambiguidade de frame/normalização).
        const yawDeg: number = Array.isArray(cam.rotation) ? Number(cam.rotation[1]) || 0 : 0;
        if (onCameraUpdate) {
          onCameraUpdate(pos, fwd, yawDeg);
        }
      }}>
      {/* Iluminação ambiente e direcional otimizada para GPU mobile */}
      <ViroAmbientLight color="#FFFFFF" intensity={800} />
      <ViroDirectionalLight color="#FFFFFF" direction={[0, -1, -0.4]} />

      {/* POSTES DE DIAGNÓSTICO (dev-only): coordenadas FIXAS do mundo AR —
          0/3/6/9m à frente de onde a sessão iniciou. Não passam por GPS,
          bússola ou projeção: se ESTES postes seguirem o celular ao andar,
          o problema está no ARCore/Viro (pose ou render), não na projeção. */}
      {__DEV__
        ? [-0.01, -3, -6, -9].map((z, i) => (
            <ViroNode key={`diag-post-${i}`} position={[0, -1.5, z]}>
              <ViroBox
                scale={i === 0 ? [0.5, 0.06, 0.5] : [0.1, 1.3, 0.1]}
                position={i === 0 ? [0, 0, 0] : [0, 0.65, 0]}
                materials={i === 0 ? ['diagOrigin'] : ['diagPost']}
              />
            </ViroNode>
          ))
        : null}

      {/* Rota de navegação estilo Google Live View: janela de chevrons azuis
          achatados no chão, enviada pronta pela sessão de navegação (useARNavigation).
          Keys = arco em metros -> React reaproveita os nós ao deslizar a janela.
          O Y é o FLOOR_Y da sessão (chão do mundo AR, câmera ~1.5m acima).
          Ocultos quando o tracking degrada (mundo não-rígido, §12.8). */}
      {trackingHealthy
        ? routeChevrons.map((chevron) => (
            <ViroNode
              key={`route-chevron-${chevron.key}`}
              position={chevron.pos}
              rotation={[0, chevron.angleDeg, 0]}>
              {/* Achatado no chão (rot X -90°); +3cm contra z-fighting com
                  planos detectados. Topo da textura = -Z = frente. */}
              <ViroQuad
                width={1.25}
                height={1.0}
                rotation={[-90, 0, 0]}
                position={[0, 0.03, 0]}
                materials={['routeChevron']}
              />
            </ViroNode>
          ))
        : null}

      {/* Visualização das Maiores Superfícies Físicas Detectadas pelo ARCore.
          DESLIGADA por padrão (ver SHOW_DETECTED_PLANES acima) — o quad azul
          translúcido de um plano do tamanho do cômodo cobria a tela toda.
          SEM onClick — planos interceptam o raycast de taps nos pins (o chão
          está fisicamente entre a câmera e qualquer pin a nível do solo).
          O botão "Marcar Ponto" já abre o modal via hit test do retículo. */}
      {SHOW_DETECTED_PLANES
        ? visiblePlanes.map((plane) => {
            const extentWidth = plane.width || 0.5;
            const extentHeight = plane.height || 0.5;
            const isHorizontal = !plane.alignment || plane.alignment.includes('Horizontal');
            const planePos: [number, number, number] = plane.center || plane.position || [0, 0, 0];
            const planeId = String(plane.anchorId);

            return (
              <ViroNode key={`plane-${planeId}`} position={planePos}>
                <ViroQuad
                  width={Math.max(0.4, extentWidth)}
                  height={Math.max(0.4, extentHeight)}
                  rotation={isHorizontal ? [-90, 0, 0] : [0, 0, 0]}
                  materials={['detectedPlaneSurface']}
                />
              </ViroNode>
            );
          })
        : null}

      {/* ÂNCORAS GEODÉSICAS E ESPACIAIS COM ESCALA DINÂMICA (WGS84 -> ENU -> AR Frustum) */}
      {visibleAnchors.map((anchor, index) => {
        const materialName = materialsPalette[index % materialsPalette.length];
        const renderPos = anchor.arPosition as [number, number, number];

        // Cálculo de distância métrica para escala dinâmica adaptativa
        const dist =
          typeof anchor.distanceMeters === 'number' && anchor.distanceMeters > 0
            ? anchor.distanceMeters
            : Math.hypot(renderPos[0], renderPos[1], renderPos[2]);

        // Escala dinâmica com clamping para manter legibilidade tanto a 5m quanto a 150m:
        // scaleFactor = clamp(1.0, 6.0, sqrt(dist) * 0.45)
        const scaleFactor = Math.max(1.0, Math.min(6.0, Math.sqrt(Math.max(1, dist)) * 0.45));
        const distLabel = Math.round(dist);
        // Estimativa (sem âncora nativa): selo honesto com envelope de erro.
        const estimateSuffix =
          anchor.estimated && typeof anchor.estimateAccuracyM === 'number'
            ? ` ±${Math.round(anchor.estimateAccuracyM)}m`
            : '';
        const labelText = `${anchor.name}\n${distLabel} m${estimateSuffix}`;

        return (
          <ViroNode
            key={anchor.id || `anchor-${index}`}
            position={renderPos}
            opacity={anchor.estimated ? 0.6 : 1}>
            {/* HIT AREA visual reduzida (debug): só um pouco maior que o pin
                para validar que a seleção é pela retícula, não pela hitbox. */}
            <ViroBox
              scale={[Math.max(0.5, 0.35 * scaleFactor), Math.max(0.7, 0.45 * scaleFactor), Math.max(0.5, 0.35 * scaleFactor)]}
              position={[0, 0.15 * scaleFactor, 0]}
              materials={['anchorHitArea']}
            />

            {/* Cubo 3D representando a âncora com escala dinâmica adaptativa */}
            <ViroBox
              scale={[0.35 * scaleFactor, 0.35 * scaleFactor, 0.35 * scaleFactor]}
              materials={[materialName]}
            />

            {/* Haste inferior de sustentação visual */}
            <ViroBox
              position={[0, -0.18 * scaleFactor, 0]}
              scale={[0.02 * scaleFactor, 0.2 * scaleFactor, 0.02 * scaleFactor]}
              materials={['pinStem']}
            />

            {/* Rótulo de texto FLUTUANTE — grande e legível com distância */}
            <ViroText
              text={labelText}
              scale={[0.5 * scaleFactor, 0.5 * scaleFactor, 0.5 * scaleFactor]}
              position={[0, 0.55 * scaleFactor, 0]}
              transformBehaviors={['billboardY']}
              style={styles.viroText}
            />
          </ViroNode>
        );
      })}

      {/* ══ CLOUD ANCHORS: sensores visuais (posição em SESSÃO AR) ════════
          Cada <ViroARCloudAnchor> resolve contra o mapa visual hospedado no
          Google e entrega a posição do frame em COORDENADAS DA SESSÃO AR
          (metros da origem) via onLocalized — não ECEF como o método
          imperativo resolveCloudAnchor. O callback alimenta o pipeline de
          projeção (distância, transições, labels).
          ⚠️ NÃO desmontar por trackingState: cada remount tenta um novo
          resolve e o ARCore responde "already in progress" → nunca completa.
          O gate de tracking aplica à RENDERIZAÇÃO dos pins (projeção),
          não aos sensores. */}
      {shouldRenderSensors ? cloudAnchorSensors.map(({ pin, source }) => {
        if (!pin.cloudAnchorId || !Array.isArray(pin.frameOffset)) return null;
        const nav = (props.arSceneNavigator ?? props.sceneNavigator) as any;
        return (
          <ViroSharedFrame
            key={`cloud-${pin.id}`}
            source={source}
            arSceneNavigator={nav}
            onLocalized={(event) => {
              console.log(`[ARCloud] "${pin.name}" LOCALIZADA — pos=[${event.position.map((v: number) => v.toFixed(2)).join(', ')}]`);
              onCloudAnchorLocalized?.(
                pin.id,
                pin.cloudAnchorId,
                event.position as [number, number, number],
                event.rotation?.[1] ?? 0,
              );
            }}
            onLocalizeError={(error: string, state?: string) => {
              console.warn(`[ARCloud] "${pin.name}" ERRO: ${error} (state=${state})`);
              onCloudAnchorError?.(pin.id, `${error} (state=${state})`);
            }}
            onLocalizeProgress={(status: { message: string; attempt: number }) => {
              console.log(`[ARCloud] "${pin.name}" progresso: ${status.message} (tentativa ${status.attempt})`);
            }}
          />
        );
      }) : null}

      {/* ══ MODO PREVIEW: pin fantasma no ponto de criação ═════════════════
          Diamante âmbar + haste — visualmente DISTINTO dos pins regulares
          (cubos coloridos). Atualiza em tempo real conforme o usuário
          ajusta a distância da mira no modal minimizado. */}
      {previewPosition ? (
        <ViroNode position={previewPosition}>
          {/* Diamante âmbar flutuante (rotaciona 45° nos 3 eixos) */}
          <ViroBox
            scale={[0.28, 0.28, 0.28]}
            rotation={[45, 45, 0]}
            materials={['previewPin']}
          />
          {/* Haste vertical fina até o "chão" */}
          <ViroBox
            position={[0, -0.35, 0]}
            scale={[0.015, 0.7, 0.015]}
            materials={['previewStem']}
          />
          {/* Base circular no chão */}
          <ViroBox
            position={[0, -0.7, 0]}
            scale={[0.15, 0.02, 0.15]}
            materials={['previewStem']}
          />
          {/* Label flutuante */}
          <ViroText
            text="NOVO PONTO"
            scale={[0.4, 0.4, 0.4]}
            position={[0, 0.45, 0]}
            transformBehaviors={['billboardY']}
            style={styles.previewText}
          />
        </ViroNode>
      ) : null}
    </ViroARScene>
  );
};

const styles = StyleSheet.create({
  viroText: {
    fontFamily: 'Arial',
    fontSize: 28,
    color: '#FFFFFF',
    textAlignVertical: 'center',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  previewText: {
    fontFamily: 'Arial',
    fontSize: 24,
    color: '#FCD34D',
    textAlignVertical: 'center',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
