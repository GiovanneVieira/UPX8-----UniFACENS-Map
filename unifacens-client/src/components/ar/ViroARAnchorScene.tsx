import React, { FC } from 'react';
import { StyleSheet } from 'react-native';
import {
  ViroARScene,
  ViroBox,
  ViroText,
  ViroNode,
  ViroAmbientLight,
  ViroSpotLight,
  ViroMaterials,
} from '@reactvision/react-viro';
import type { Anchor } from 'shared';

// Registra materiais vivos com Constant lighting para visualização 3D garantida
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
  pinStem: {
    diffuseColor: '#94A3B8',
    lightingModel: 'Constant',
  },
});

interface ViroARAnchorSceneProps {
  anchors?: Anchor[];
  onSelectAnchor?: (anchor: Anchor) => void;
  onPlaceAnchorAtPosition?: (position: [number, number, number]) => void;
  onPlaceAnchorAtCamera?: () => void;
  onCameraUpdate?: (pos: [number, number, number], fwd: [number, number, number]) => void;
  onTrackingUpdate?: (state: number, reason: number) => void;
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
  const onPlaceAnchorAtPosition = viroProps.onPlaceAnchorAtPosition;
  const onPlaceAnchorAtCamera = viroProps.onPlaceAnchorAtCamera;
  const onCameraUpdate = viroProps.onCameraUpdate;
  const onTrackingUpdate = viroProps.onTrackingUpdate;

  return (
    <ViroARScene
      anchorDetectionTypes={['PlanesHorizontal']}
      onTrackingUpdated={(state: any, reason: any) => {
        onTrackingUpdate?.(Number(state), Number(reason));
      }}
      onCameraTransformUpdate={(event: any) => {
        const cam = event.cameraTransform || event;
        const pos: [number, number, number] = cam.position || [0, 0, 0];
        const fwd: [number, number, number] = cam.forward || [0, 0, -1];
        if (onCameraUpdate) {
          onCameraUpdate(pos, fwd);
        }
      }}
      onClick={(position) => {
        if (Array.isArray(position) && position.length >= 3) {
          onPlaceAnchorAtPosition?.([position[0], position[1], position[2]]);
        } else if (onPlaceAnchorAtCamera) {
          onPlaceAnchorAtCamera();
        }
      }}>
      {/* Iluminação ambiente */}
      <ViroAmbientLight color="#FFFFFF" intensity={1000} />
      <ViroSpotLight
        innerAngle={5}
        outerAngle={90}
        direction={[0, -1, -0.2]}
        position={[0, 3, 1]}
        color="#FFFFFF"
      />

      {/* Renderização das âncoras ativas com posição física 3D (ARCore ou banco) */}
      {anchors
        .map((anchor) => ({
          ...anchor,
          renderPos: (anchor.arPosition || anchor.position) as [number, number, number] | undefined,
        }))
        .filter(
          (anchor): anchor is typeof anchor & { renderPos: [number, number, number] } =>
            Array.isArray(anchor.renderPos) && anchor.renderPos.length === 3,
        )
        .map((anchor, index) => {
          const materialName =
            index % 3 === 0
              ? 'blueAnchor'
              : index % 3 === 1
                ? 'emeraldAnchor'
                : 'amberAnchor';

          const renderPos = anchor.renderPos;
          const labelText = `☁️ ${anchor.name}${anchor.description ? `\n${anchor.description}` : ''}`;

          return (
            <ViroNode
              key={anchor.id || `anchor-${index}`}
              position={renderPos}>
              {/* Cubo 3D representando a âncora */}
              <ViroBox
                scale={[0.22, 0.22, 0.22]}
                materials={[materialName]}
                onClick={() => onSelectAnchor?.(anchor)}
              />

              {/* Haste inferior de sustentação visual */}
              <ViroBox
                position={[0, -0.15, 0]}
                scale={[0.02, 0.15, 0.02]}
                materials={['pinStem']}
              />

              {/* Rótulo de texto flutuante estabilizado no eixo Y para evitar inclinações */}
              <ViroText
                text={labelText}
                scale={[0.15, 0.15, 0.15]}
                position={[0, 0.25, 0]}
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
  },
});
