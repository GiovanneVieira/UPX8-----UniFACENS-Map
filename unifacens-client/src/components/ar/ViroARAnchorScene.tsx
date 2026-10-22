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
import type { Anchor } from 'shared';

const isUsablePoint = (
  p?: [number, number, number] | number[] | null,
): p is [number, number, number] => {
  return Boolean(
    Array.isArray(p) &&
      p.length >= 3 &&
      p.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      !(Math.abs(p[0]) < 0.005 && Math.abs(p[1]) < 0.005 && Math.abs(p[2]) < 0.005),
  );
};

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
});

export interface ViroARAnchorSceneProps {
  anchors?: Anchor[];
  onSelectAnchor?: (anchor: Anchor) => void;
  onPlaneTapped?: (anchorId: string, position: [number, number, number]) => void;
  onCameraUpdate?: (pos: [number, number, number], fwd: [number, number, number]) => void;
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
  const onSelectAnchor = viroProps.onSelectAnchor;
  const onCameraUpdate = viroProps.onCameraUpdate;
  const onTrackingUpdate = viroProps.onTrackingUpdate;
  const onRegisterSceneRef = viroProps.onRegisterSceneRef;
  const onPlaneTapped = viroProps.onPlaneTapped;
  const onPlanesUpdated = viroProps.onPlanesUpdated;

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

  // Filtra âncoras cujo arPosition foi resolvido e projetado no espaço tridimensional
  const visibleAnchors = useMemo(() => {
    return anchors.filter((a) => isUsablePoint(a.arPosition));
  }, [anchors]);

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
        if (onCameraUpdate) {
          onCameraUpdate(pos, fwd);
        }
      }}>
      {/* Iluminação ambiente e direcional otimizada para GPU mobile */}
      <ViroAmbientLight color="#FFFFFF" intensity={800} />
      <ViroDirectionalLight color="#FFFFFF" direction={[0, -1, -0.4]} />

      {/* Visualização das Maiores Superfícies Físicas Detectadas pelo ARCore */}
      {visiblePlanes.map((plane) => {
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
              onClick={() => {
                onPlaneTapped?.(planeId, planePos);
              }}
            />
          </ViroNode>
        );
      })}

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
        const labelText = `${anchor.name}\n📍 ${distLabel} m`;

        return (
          <ViroNode
            key={anchor.id || `anchor-${index}`}
            position={renderPos}>
            {/* Cubo 3D representando a âncora com escala dinâmica adaptativa */}
            <ViroBox
              scale={[0.28 * scaleFactor, 0.28 * scaleFactor, 0.28 * scaleFactor]}
              materials={[materialName]}
              onClick={() => onSelectAnchor?.(anchor)}
            />

            {/* Haste inferior de sustentação visual */}
            <ViroBox
              position={[0, -0.18 * scaleFactor, 0]}
              scale={[0.02 * scaleFactor, 0.2 * scaleFactor, 0.02 * scaleFactor]}
              materials={['pinStem']}
            />

            {/* Rótulo de texto flutuante estabilizado no eixo Y com distância métrica */}
            <ViroText
              text={labelText}
              scale={[0.14 * scaleFactor, 0.14 * scaleFactor, 0.14 * scaleFactor]}
              position={[0, 0.32 * scaleFactor, 0]}
              transformBehaviors={['billboardY']}
              style={styles.viroText}
              onClick={() => onSelectAnchor?.(anchor)}
            />
          </ViroNode>
        );
      })}
    </ViroARScene>
  );
};

const styles = StyleSheet.create({
  viroText: {
    fontFamily: 'Arial',
    fontSize: 18,
    color: '#FFFFFF',
    textAlignVertical: 'center',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
