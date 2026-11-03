import React, { FC, useState, useRef, useCallback, useMemo } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { useQueryClient } from '@tanstack/react-query';
import { type Anchor, isUsablePoint } from 'shared';
import {
  useAnchorsQuery,
  useCreateAnchorMutation,
  useDeleteAnchorMutation,
  anchorKeys,
} from '@/features/anchors/queries/use-anchors-query';
import type { CampusLandmark } from '@/constants/campus-landmarks';
import { ViroARAnchorScene } from './ViroARAnchorScene';
import { useARGeolocation } from './hooks/use-ar-geolocation';
import { useARProjection } from './hooks/use-ar-projection';
import { useARZoom } from './hooks/use-ar-zoom';
import { ARStatusHud } from './hud/ar-status-hud';
import { ARCompassRadiusBar } from './hud/ar-compass-radius-bar';
import { ARZoomSelector } from './hud/ar-zoom-selector';
import { ARReticle } from './hud/ar-reticle';
import { CalibrationModal } from './modals/calibration-modal';
import { PlaceAnchorModal } from './modals/place-anchor-modal';

const HIT_TEST_PRIORITY = [
  'DepthPoint',
  'ExistingPlaneUsingExtent',
  'ExistingPlane',
  'EstimatedHorizontalPlane',
  'FeaturePoint',
];

// Constante estática da cena inicial para nunca recriar a instância nativa do ViroARSceneNavigator
const INITIAL_AR_SCENE = { scene: ViroARAnchorScene as any };

/** Facade mínima do ref da cena Viro utilizada para hit-tests. */
interface ViroSceneHitTestRef {
  performARHitTestWithPoint?: (x: number, y: number) => Promise<unknown>;
}

export const ViroARAnchorContainer: FC = () => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const navigatorRef = useRef<any>(null);
  const arSceneRef = useRef<ViroSceneHitTestRef | any>(null);

  // ── Server State (TanStack Query v5 — AGENTS.MD §8) ─────────────────────
  const queryClient = useQueryClient();
  const anchorsQuery = useAnchorsQuery();
  const createAnchorMutation = useCreateAnchorMutation();
  const deleteAnchorMutation = useDeleteAnchorMutation();
  const [isSaving, setIsSaving] = useState(false);
  // Override de status do HUD durante mutações (null = status derivado do query)
  const [mutationStatus, setMutationStatus] = useState<string | null>(null);

  // ── Motores de domínio (hooks dedicados) ─────────────────────────────────
  const geo = useARGeolocation();
  const projection = useARProjection({ serverAnchors: anchorsQuery.data, geo });
  const { zoomLevel, applyZoom, pinchGesture, arZoomAnimatedStyle } = useARZoom();

  // ── Estado de UI local ────────────────────────────────────────────────────
  const [radiusFilter, setRadiusFilter] = useState<number>(0);
  const [calibrationModalVisible, setCalibrationModalVisible] = useState(false);

  // Modal de criação de ponto
  const [modalVisible, setModalVisible] = useState(false);
  const [anchorName, setAnchorName] = useState('');
  const [anchorDescription, setAnchorDescription] = useState('');
  const [pendingCoords, setPendingCoords] = useState<[number, number, number]>([0, 0, -2.0]);
  const [pendingDistance, setPendingDistance] = useState<number>(2.0);

  // Pose instantânea da câmera no espaço AR
  const cameraPosRef = useRef<[number, number, number]>([0, 0, 0]);
  const cameraFwdRef = useRef<[number, number, number]>([0, 0, -1]);

  // Linha de visada para micro-ajuste de profundidade no modal
  const rayOriginRef = useRef<[number, number, number]>([0, 0, 0]);
  const rayDirectionRef = useRef<[number, number, number]>([0, 0, -1]);

  // Estado de Rastreamento SLAM (1: Indisponível, 2: Mapeando, 3: Estável)
  const [trackingState, setTrackingState] = useState<number>(2);
  const [_planesCount, setPlanesCount] = useState<number>(0);

  // Status do HUD derivado do estado do query — sem estado espelho (§7/§8)
  const cloudStatusDerived = useMemo(() => {
    if (anchorsQuery.isPending) return 'Carregando pontos...';
    if (anchorsQuery.isError) return 'Erro de conexão';
    return `${anchorsQuery.data?.length ?? 0} ponto(s)`;
  }, [anchorsQuery.isPending, anchorsQuery.isError, anchorsQuery.data]);
  const cloudStatus = mutationStatus ?? cloudStatusDerived;

  // ── Callbacks da cena Viro ────────────────────────────────────────────────
  const handleCameraUpdate = useCallback(
    (pos: [number, number, number], fwd: [number, number, number]) => {
      cameraPosRef.current = pos;
      cameraFwdRef.current = fwd;
    },
    [],
  );

  const handleTrackingUpdate = useCallback((state: number) => {
    setTrackingState(state);
  }, []);

  const handleRegisterSceneRef = useCallback((scene: any) => {
    arSceneRef.current = scene;
  }, []);

  const handlePlanesUpdated = useCallback((count: number) => {
    setPlanesCount(count);
  }, []);

  const handlePlaneTapped = useCallback(
    (_anchorId: string, position: [number, number, number]) => {
      const target: [number, number, number] = [
        Number(position[0].toFixed(2)),
        Number(position[1].toFixed(2)),
        Number(position[2].toFixed(2)),
      ];
      setPendingCoords(target);

      const camPos = cameraPosRef.current || [0, 0, 0];
      const dx = target[0] - camPos[0];
      const dy = target[1] - camPos[1];
      const dz = target[2] - camPos[2];
      const dist = Math.hypot(dx, dy, dz);
      const finalDist = Number(Math.max(0.3, Math.min(30.0, dist)).toFixed(2));
      setPendingDistance(finalDist);

      rayOriginRef.current = camPos;
      const fwdLen = dist || 1;
      rayDirectionRef.current = [dx / fwdLen, dy / fwdLen, dz / fwdLen];

      setModalVisible(true);
    },
    [],
  );

  // Abertura do modal de criação com Hit-Test no centro da tela ou projeção do retículo
  const handleOpenPlaceModal = useCallback(async () => {
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;
    let targetCoords: [number, number, number] | null = null;

    if (arSceneRef.current?.performARHitTestWithPoint) {
      try {
        const hits = await arSceneRef.current.performARHitTestWithPoint(centerX, centerY);
        if (Array.isArray(hits) && hits.length > 0) {
          for (const type of HIT_TEST_PRIORITY) {
            const match = hits.find(
              (h: any) => h.type === type && isUsablePoint(h.transform?.position),
            );
            if (match) {
              targetCoords = [
                match.transform.position[0],
                match.transform.position[1],
                match.transform.position[2],
              ];
              break;
            }
          }
        }
      } catch (hitErr) {
        console.warn('[AR] Hit test aviso:', hitErr);
      }
    }

    const camPos = cameraPosRef.current || [0, 0, 0];
    const camFwd = cameraFwdRef.current || [0, 0, -1];
    const fwdLen = Math.hypot(camFwd[0], camFwd[1], camFwd[2]) || 1;
    const normFwd: [number, number, number] = [
      camFwd[0] / fwdLen,
      camFwd[1] / fwdLen,
      camFwd[2] / fwdLen,
    ];

    let distance: number;
    if (isUsablePoint(targetCoords)) {
      distance = Math.hypot(
        targetCoords[0] - camPos[0],
        targetCoords[1] - camPos[1],
        targetCoords[2] - camPos[2],
      );
      distance = Number(Math.max(0.4, Math.min(25.0, distance)).toFixed(2));
    } else {
      distance = 2.0;
      targetCoords = [
        camPos[0] + normFwd[0] * distance,
        camPos[1] + normFwd[1] * distance,
        camPos[2] + normFwd[2] * distance,
      ];
    }

    rayOriginRef.current = camPos;
    rayDirectionRef.current = normFwd;
    setPendingDistance(distance);
    setPendingCoords([
      Number(targetCoords[0].toFixed(2)),
      Number(targetCoords[1].toFixed(2)),
      Number(targetCoords[2].toFixed(2)),
    ]);
    setModalVisible(true);
  }, [screenWidth, screenHeight]);

  // Micro-ajuste de profundidade: setters independentes e updaters puros (§7/A4)
  const handleAdjustDistance = useCallback(
    (delta: number) => {
      const newDist = Number(Math.max(0.3, Math.min(30.0, pendingDistance + delta)).toFixed(2));
      const origin = rayOriginRef.current;
      const dir = rayDirectionRef.current;

      setPendingDistance(newDist);
      setPendingCoords([
        Number((origin[0] + dir[0] * newDist).toFixed(2)),
        Number((origin[1] + dir[1] * newDist).toFixed(2)),
        Number((origin[2] + dir[2] * newDist).toFixed(2)),
      ]);
    },
    [pendingDistance],
  );

  // Criação de ponto geodésico persistente (offset métrico a partir da mira)
  const handleCreate = async () => {
    if (!anchorName.trim()) {
      Alert.alert('Aviso', 'Informe o nome do ponto.');
      return;
    }

    try {
      setIsSaving(true);
      setMutationStatus('Gravando ponto...');

      const calibrated = projection.calibratedLandmark;
      const activeLat = calibrated ? calibrated.latitude : geo.userCoordsRef.current.latitude;
      const activeLon = calibrated ? calibrated.longitude : geo.userCoordsRef.current.longitude;
      const activeAlt = calibrated ? calibrated.altitude : geo.userCoordsRef.current.altitude;

      const dist = pendingDistance;
      const bearingRad = (geo.userTrueHeadingRef.current * Math.PI) / 180;
      const deltaNorth = dist * Math.cos(bearingRad);
      const deltaEast = dist * Math.sin(bearingRad);

      const latOffset = deltaNorth / 111320;
      const lonOffset = deltaEast / (111320 * Math.cos((activeLat * Math.PI) / 180));

      const targetLat = Number((activeLat + latOffset).toFixed(7));
      const targetLon = Number((activeLon + lonOffset).toFixed(7));
      const targetAlt = Number((activeAlt + (pendingCoords[1] || 0)).toFixed(1));

      const cloudAnchorId = `coord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const targetArPosition: [number, number, number] = [
        pendingCoords[0],
        pendingCoords[1],
        pendingCoords[2],
      ];

      const saved = await createAnchorMutation.mutateAsync({
        name: anchorName.trim(),
        cloudAnchorId,
        description: anchorDescription.trim() || undefined,
        position: targetArPosition,
        latitude: targetLat,
        longitude: targetLon,
        altitude: targetAlt,
        heading: geo.userTrueHeadingRef.current,
      });

      // Trava a pose SLAM exata na sessão + cache otimista + lista bruta local
      projection.lockPosition(saved.id, targetArPosition);
      queryClient.setQueryData<Anchor[]>(anchorKeys.lists(), (old) =>
        old ? [saved, ...old] : [saved],
      );
      projection.prependAnchor(saved);

      setMutationStatus(null);
      setAnchorName('');
      setAnchorDescription('');
      setModalVisible(false);

      Alert.alert(
        'Ponto Registrado!',
        `Nome: ${saved.name}\nCoordenadas: [${targetLat}, ${targetLon}]\nDistância: ${pendingDistance.toFixed(1)}m\n\nO ponto foi registrado geograficamente e está projetado no espaço AR.`,
      );
    } catch (err: any) {
      console.warn('[AR] Erro ao salvar âncora:', err);
      Alert.alert(
        'Erro ao Salvar',
        err instanceof Error ? err.message : 'Não foi possível salvar o ponto.',
      );
      setMutationStatus('Falha na gravação');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAnchor = useCallback(
    (anchor: Anchor) => {
      const arPos = anchor.arPosition || anchor.position || [0, 0, 0];
      const descInfo = anchor.description ? `\nDescrição: ${anchor.description}` : '';
      const distInfo =
        typeof anchor.distanceMeters === 'number'
          ? `\nDistância Real: ${Math.round(anchor.distanceMeters)} m`
          : '';
      const geoInfo =
        anchor.latitude != null && anchor.longitude != null
          ? `\nGPS: [${anchor.latitude.toFixed(6)}, ${anchor.longitude.toFixed(6)}]`
          : '';

      Alert.alert(
        anchor.name,
        `ID: ${anchor.cloudAnchorId}${descInfo}${distInfo}${geoInfo}\nPosição AR: [${arPos[0].toFixed(2)}, ${arPos[1].toFixed(2)}, ${arPos[2].toFixed(2)}]m`,
        [
          { text: 'Fechar', style: 'cancel' },
          {
            text: 'Excluir Ponto',
            style: 'destructive',
            onPress: async () => {
              try {
                setIsSaving(true);
                await deleteAnchorMutation.mutateAsync(anchor.id);
                projection.removeAnchorLocal(anchor.id);
                Alert.alert('Sucesso', 'Ponto excluído.');
              } catch (err: any) {
                console.warn('[AR] Erro ao excluir âncora:', err);
                Alert.alert(
                  'Erro ao excluir',
                  err instanceof Error ? err.message : 'Não foi possível excluir o ponto.',
                );
              } finally {
                setIsSaving(false);
              }
            },
          },
        ],
      );
    },
    [createAnchorMutation, deleteAnchorMutation, projection],
  );

  // Filtro de raio aplicado às âncoras passadas à cena AR
  const visibleAnchors = useMemo(() => {
    return projection.anchors.filter((a) => {
      if (!isUsablePoint(a.arPosition)) return false;
      if (radiusFilter > 0 && typeof a.distanceMeters === 'number') {
        return a.distanceMeters <= radiusFilter;
      }
      return true;
    });
  }, [projection.anchors, radiusFilter]);

  const viroAppProps = useMemo(
    () => ({
      anchors: visibleAnchors,
      onSelectAnchor: handleSelectAnchor,
      onPlaneTapped: handlePlaneTapped,
      onCameraUpdate: handleCameraUpdate,
      onTrackingUpdate: handleTrackingUpdate,
      onRegisterSceneRef: handleRegisterSceneRef,
      onPlanesUpdated: handlePlanesUpdated,
    }),
    [
      visibleAnchors,
      handleSelectAnchor,
      handlePlaneTapped,
      handleCameraUpdate,
      handleTrackingUpdate,
      handleRegisterSceneRef,
      handlePlanesUpdated,
    ],
  );

  const calibratedLabel = projection.calibratedLandmark
    ? `📍 ${projection.calibratedLandmark.name.split(' ')[0]}`
    : null;

  const originLabel = projection.calibratedLandmark
    ? projection.calibratedLandmark.name.split(' ')[0]
    : `GPS (±${Math.round(geo.userCoords.accuracy)}m)`;

  return (
    <View style={styles.rootContainer}>
      {/* Viewport AR com Zoom Visual Contínuo processado 100% na UI thread nativa.
          O GestureDetector cobre apenas o viewport: toques simples seguem para o
          Viro (onPlaneTapped/onSelectAnchor) e apenas 2 dedos ativam o zoom. */}
      <GestureDetector gesture={pinchGesture}>
        <View style={styles.arViewportClip}>
          <Animated.View style={[styles.arZoomWrapper, arZoomAnimatedStyle]}>
            <ViroARSceneNavigator
              ref={navigatorRef}
              provider="arcore"
              autofocus={true}
              initialScene={INITIAL_AR_SCENE}
              viroAppProps={viroAppProps}
              style={styles.arNavigator}
            />
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Indicador de Zoom Ativo */}
      {zoomLevel > 1.05 ? (
        <View style={[styles.zoomBadge, { top: Math.max(insets.top + 98, 138) }]} pointerEvents="none">
          <Text style={styles.zoomBadgeText}>🔍 Zoom: {zoomLevel.toFixed(1)}x</Text>
        </View>
      ) : null}

      <ARReticle zoomLevel={zoomLevel} />

      <ARZoomSelector zoomLevel={zoomLevel} onZoomChange={(level) => applyZoom(level, true)} />

      <ARStatusHud
        cloudStatus={cloudStatus}
        trackingState={trackingState}
        isFetching={anchorsQuery.isFetching}
        calibratedLabel={calibratedLabel}
        gpsAccuracyMeters={geo.userCoords.accuracy}
        onOpenCalibration={() => setCalibrationModalVisible(true)}
        onRefresh={() => anchorsQuery.refetch()}
      />

      <ARCompassRadiusBar
        heading={geo.userTrueHeading}
        radiusFilter={radiusFilter}
        onRadiusChange={setRadiusFilter}
      />

      {/* Barra Inferior com o Botão Principal */}
      <View
        style={[styles.bottomBar, { bottom: Math.max(insets.bottom + 16, 28) }]}
        pointerEvents="box-none">
        <TouchableOpacity
          onPress={handleOpenPlaceModal}
          activeOpacity={0.85}
          style={styles.placeAnchorButton}>
          <Text style={styles.placeAnchorButtonText}>📍 Marcar Ponto no Espaço</Text>
        </TouchableOpacity>
      </View>

      <CalibrationModal
        visible={calibrationModalVisible}
        calibratedLandmark={projection.calibratedLandmark}
        userCoords={geo.userCoords}
        onSelect={(landmark: CampusLandmark) => {
          projection.calibrate(landmark);
          setCalibrationModalVisible(false);
        }}
        onReset={() => {
          projection.calibrate(null);
          setCalibrationModalVisible(false);
        }}
        onClose={() => setCalibrationModalVisible(false)}
      />

      <PlaceAnchorModal
        visible={modalVisible}
        isSaving={isSaving}
        originLabel={originLabel}
        heading={geo.userTrueHeading}
        pendingDistance={pendingDistance}
        onAdjustDistance={handleAdjustDistance}
        anchorName={anchorName}
        onAnchorNameChange={setAnchorName}
        anchorDescription={anchorDescription}
        onAnchorDescriptionChange={setAnchorDescription}
        onCreate={handleCreate}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  arViewportClip: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  arZoomWrapper: {
    flex: 1,
  },
  arNavigator: {
    flex: 1,
  },
  zoomBadge: {
    position: 'absolute',
    top: 138,
    alignSelf: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.6)',
    zIndex: 20,
    elevation: 32,
  },
  zoomBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 28,
    left: 20,
    right: 20,
    zIndex: 20,
    elevation: 20,
  },
  placeAnchorButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#60A5FA',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  placeAnchorButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ViroARAnchorContainer;
