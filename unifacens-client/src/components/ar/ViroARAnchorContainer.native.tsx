import React, { FC, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import * as Location from 'expo-location';
import {
  type Anchor,
  calculateRelativeARPosition,
  calculateDistance,
  magneticToTrueHeading,
  CircularLowPassFilter,
  SOROCABA_MAGNETIC_DECLINATION,
} from 'shared';
import { ViroARAnchorScene } from './ViroARAnchorScene';
import { fetchAnchors, createAnchor, deleteAnchor } from '@/services/api';

const HIT_TEST_PRIORITY = [
  'DepthPoint',
  'ExistingPlaneUsingExtent',
  'ExistingPlane',
  'EstimatedHorizontalPlane',
  'FeaturePoint',
];

const ZOOM_LEVELS = [1.0, 2.0, 3.0, 5.0];

// Constante estática da cena inicial para nunca recriar a instância nativa do ViroARSceneNavigator
const INITIAL_AR_SCENE = { scene: ViroARAnchorScene as any };

interface CampusLandmark {
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  altitude: number;
}

const CAMPUS_CALIBRATION_POINTS: CampusLandmark[] = [
  {
    name: 'Ponto Central (Origem Facens)',
    description: 'Praça central do campus Facens',
    latitude: -23.4699,
    longitude: -47.4297,
    altitude: 605,
  },
  {
    name: 'Bloco A (Engenharias)',
    description: 'Entrada principal do Bloco A',
    latitude: -23.47035,
    longitude: -47.4294,
    altitude: 606,
  },
  {
    name: 'Bloco B (Laboratórios)',
    description: 'Entrada dos laboratórios e oficinas',
    latitude: -23.4695,
    longitude: -47.42995,
    altitude: 605,
  },
  {
    name: 'Biblioteca Universitária',
    description: 'Entrada da biblioteca e centro de estudos',
    latitude: -23.4701,
    longitude: -47.4302,
    altitude: 605,
  },
];

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

export const ViroARAnchorContainer: FC = () => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const navigatorRef = useRef<any>(null);
  const arSceneRef = useRef<any>(null);

  // Lista de âncoras brutas obtidas da API
  const rawAnchorsRef = useRef<Anchor[]>([]);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filtro de Raio (0: Todos, 100: <100m, 50: <50m)
  const [radiusFilter, setRadiusFilter] = useState<number>(0);

  // Calibração Zero-Marker (Pinpoint em Marco Conhecido do Campus)
  const [calibratedLandmark, setCalibratedLandmark] = useState<CampusLandmark | null>(null);
  const calibratedLandmarkRef = useRef<CampusLandmark | null>(null);
  const [calibrationModalVisible, setCalibrationModalVisible] = useState(false);

  // Coordenadas do Usuário (GPS + Altitude)
  const userCoordsRef = useRef<{
    latitude: number;
    longitude: number;
    altitude: number;
    accuracy: number;
  }>({
    latitude: -23.4699,
    longitude: -47.4297,
    altitude: 605,
    accuracy: 10,
  });
  const [userCoords, setUserCoords] = useState(userCoordsRef.current);

  // Bússola e Filtro Passa-Baixa Circular (Alpha = 0.15)
  const compassFilterRef = useRef<CircularLowPassFilter>(new CircularLowPassFilter(0.15));
  const userTrueHeadingRef = useRef<number>(0);
  const [userTrueHeading, setUserTrueHeading] = useState<number>(0);

  // Cache de posições travadas na sessão atual (pontos criados pelo usuário que NUNCA devem ser recalculados)
  const sessionLockedPositionsRef = useRef<Map<string, [number, number, number]>>(new Map());

  // Orientação e coordenadas de referência para a projeção espacial (imutável durante a sessão a menos que recalibrado)
  const referenceHeadingRef = useRef<number | null>(null);
  const lastProjectedCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Modal de Criação de Ponto
  const [modalVisible, setModalVisible] = useState(false);
  const [anchorName, setAnchorName] = useState('');
  const [anchorDescription, setAnchorDescription] = useState('');
  const [pendingCoords, setPendingCoords] = useState<[number, number, number]>([0, 0, -2.0]);
  const [pendingDistance, setPendingDistance] = useState<number>(2.0);
  const [_planesCount, setPlanesCount] = useState<number>(0);

  // Linha de visada para micro-ajuste de profundidade no modal
  const rayOriginRef = useRef<[number, number, number]>([0, 0, 0]);
  const rayDirectionRef = useRef<[number, number, number]>([0, 0, -1]);

  // Zoom da Câmera AR (1.0x a 5.0x) com Pinch-to-Zoom e botões rápidos
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const zoomLevelRef = useRef<number>(1.0);
  zoomLevelRef.current = zoomLevel;

  // Valor animado nativo permanente para evitar qualquer destruição/recriação do GLSurfaceView
  const zoomAnim = useRef(new Animated.Value(1.0)).current;
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialPinchZoomRef = useRef<number>(1.0);
  const lastPinchStateUpdateRef = useRef<number>(0);

  // Aplicação de zoom suave através do RenderNode nativo do Android
  const applyZoom = useCallback(
    (targetZoom: number, animate = true) => {
      const clamped = Math.min(5.0, Math.max(1.0, Number(targetZoom.toFixed(1))));
      zoomLevelRef.current = clamped;
      setZoomLevel(clamped);

      if (animate) {
        Animated.timing(zoomAnim, {
          toValue: clamped,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      } else {
        zoomAnim.setValue(clamped);
      }
    },
    [zoomAnim],
  );

  // Estado de Rastreamento SLAM (1: Indisponível, 2: Mapeando, 3: Estável)
  const [trackingState, setTrackingState] = useState<number>(2);
  const [cloudStatus, setCloudStatus] = useState<string>('Iniciando AR...');

  // Pose instantânea da câmera no espaço AR
  const cameraPosRef = useRef<[number, number, number]>([0, 0, 0]);
  const cameraFwdRef = useRef<[number, number, number]>([0, 0, -1]);

  // Motor Geodésico: Projeção de WGS84 para Frustum AR (executado apenas na calibração ou startup)
  const updateProjectedAnchors = useCallback(
    (
      sourceAnchors: Anchor[],
      coords: { latitude: number; longitude: number; altitude: number },
      heading: number,
      calibrated: CampusLandmark | null,
    ) => {
      const activeLat = calibrated ? calibrated.latitude : coords.latitude;
      const activeLon = calibrated ? calibrated.longitude : coords.longitude;
      const activeAlt = calibrated ? calibrated.altitude : coords.altitude;

      const projected: Anchor[] = sourceAnchors.map((anchor) => {
        // 1. Se a âncora foi criada ou travada nesta sessão, preserva a pose SLAM exata (100% rígida no espaço)
        if (sessionLockedPositionsRef.current.has(anchor.id)) {
          const lockedPos = sessionLockedPositionsRef.current.get(anchor.id)!;
          return {
            ...anchor,
            arPosition: lockedPos,
            distanceMeters: anchor.distanceMeters ?? Math.hypot(lockedPos[0], lockedPos[1], lockedPos[2]),
          };
        }

        // 2. Projeta âncoras conhecidas em relação à origem ativa
        if (
          typeof anchor.latitude === 'number' &&
          Number.isFinite(anchor.latitude) &&
          typeof anchor.longitude === 'number' &&
          Number.isFinite(anchor.longitude)
        ) {
          const targetAlt =
            typeof anchor.altitude === 'number' && Number.isFinite(anchor.altitude)
              ? anchor.altitude
              : activeAlt;

          const distanceMeters = calculateDistance(
            activeLat,
            activeLon,
            anchor.latitude,
            anchor.longitude,
          );

          // Se for o próprio marco de calibração, posiciona logo à frente na altura dos olhos
          if (
            calibrated &&
            Math.abs(anchor.latitude - calibrated.latitude) < 0.00002 &&
            Math.abs(anchor.longitude - calibrated.longitude) < 0.00002
          ) {
            return {
              ...anchor,
              distanceMeters: 0,
              arPosition: [0, 0, -1.2] as [number, number, number],
            };
          }

          const arPos = calculateRelativeARPosition(
            activeLat,
            activeLon,
            activeAlt,
            heading,
            anchor.latitude,
            anchor.longitude,
            targetAlt,
          );

          return {
            ...anchor,
            distanceMeters,
            arPosition: arPos,
          };
        }

        return anchor;
      });

      setAnchors(projected);
    },
    [],
  );

  // Gesto nativo de pinça (Pinch-to-Zoom)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,
        onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            initialPinchDistanceRef.current = Math.hypot(dx, dy);
            initialPinchZoomRef.current = zoomLevelRef.current;
          }
        },
        onPanResponderMove: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const currentDistance = Math.hypot(dx, dy);
            if (!initialPinchDistanceRef.current || initialPinchDistanceRef.current < 10) {
              initialPinchDistanceRef.current = currentDistance;
              initialPinchZoomRef.current = zoomLevelRef.current;
              return;
            }
            const scaleFactor = currentDistance / initialPinchDistanceRef.current;
            const calculated = initialPinchZoomRef.current * scaleFactor;
            const clamped = Math.min(5.0, Math.max(1.0, Number(calculated.toFixed(2))));

            zoomAnim.setValue(clamped);
            zoomLevelRef.current = clamped;

            const now = Date.now();
            if (now - lastPinchStateUpdateRef.current > 120) {
              lastPinchStateUpdateRef.current = now;
              setZoomLevel(Number(clamped.toFixed(1)));
            }
          }
        },
        onPanResponderRelease: () => {
          initialPinchDistanceRef.current = null;
          setZoomLevel(Number(zoomLevelRef.current.toFixed(1)));
        },
        onPanResponderTerminate: () => {
          initialPinchDistanceRef.current = null;
          setZoomLevel(Number(zoomLevelRef.current.toFixed(1)));
        },
      }),
    [zoomAnim],
  );

  // Subscrições contínuas a GPS e Bússola com compensação de declinação (-21.3°)
  useEffect(() => {
    let isMounted = true;
    let posSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[ViroARAnchorContainer] Permissão de localização não concedida');
          return;
        }

        // 1. Posição inicial rápida
        const initialLoc = await Location.getLastKnownPositionAsync({});
        if (initialLoc && isMounted) {
          userCoordsRef.current = {
            latitude: initialLoc.coords.latitude,
            longitude: initialLoc.coords.longitude,
            altitude: initialLoc.coords.altitude ?? 605,
            accuracy: initialLoc.coords.accuracy ?? 10,
          };
          setUserCoords(userCoordsRef.current);
        }

        // 2. Rastreamento de posição GPS (apenas atualiza estado; não recalcula se estiver em modo SLAM / calibrado)
        posSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 2000,
          },
          (loc) => {
            if (!isMounted) return;
            const newCoords = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              altitude: loc.coords.altitude ?? 605,
              accuracy: loc.coords.accuracy ?? 10,
            };
            userCoordsRef.current = newCoords;
            setUserCoords(newCoords);

            // Se NÃO estiver calibrado (modo GPS outdoor), só re-projeta se o deslocamento for relevante (> 15m)
            if (!calibratedLandmarkRef.current) {
              if (!lastProjectedCoordsRef.current) {
                lastProjectedCoordsRef.current = newCoords;
              } else {
                const movedDist = calculateDistance(
                  lastProjectedCoordsRef.current.latitude,
                  lastProjectedCoordsRef.current.longitude,
                  newCoords.latitude,
                  newCoords.longitude,
                );
                if (movedDist > 15) {
                  lastProjectedCoordsRef.current = newCoords;
                  updateProjectedAnchors(
                    rawAnchorsRef.current,
                    newCoords,
                    referenceHeadingRef.current ?? userTrueHeadingRef.current,
                    null,
                  );
                }
              }
            }
          },
        );

        // 3. Rastreamento contínuo de bússola para orientação do HUD (NÃO move os nós 3D em tempo real!)
        headingSub = await Location.watchHeadingAsync((headingData) => {
          if (!isMounted) return;
          const rawMag =
            typeof headingData.magHeading === 'number' &&
            Number.isFinite(headingData.magHeading) &&
            headingData.magHeading >= 0
              ? headingData.magHeading
              : (headingData.trueHeading ?? 0);

          const filteredMag = compassFilterRef.current.update(rawMag);
          const trueHeading = magneticToTrueHeading(filteredMag, SOROCABA_MAGNETIC_DECLINATION);
          userTrueHeadingRef.current = trueHeading;
          setUserTrueHeading(Math.round(trueHeading));

          // Inicializa a orientação de referência inicial se ainda não definida
          if (referenceHeadingRef.current === null && trueHeading !== 0) {
            referenceHeadingRef.current = trueHeading;
            updateProjectedAnchors(
              rawAnchorsRef.current,
              userCoordsRef.current,
              trueHeading,
              calibratedLandmarkRef.current,
            );
          }
        });
      } catch (sensorErr) {
        console.warn('[ViroARAnchorContainer] Erro nos sensores:', sensorErr);
      }
    })();

    return () => {
      isMounted = false;
      posSub?.remove();
      headingSub?.remove();
    };
  }, [updateProjectedAnchors]);

  // Carregamento de Âncoras da API
  const loadAnchors = useCallback(async () => {
    try {
      setIsFetching(true);
      setCloudStatus('Carregando pontos...');
      const list = await fetchAnchors();

      rawAnchorsRef.current = list;
      const headingToUse = referenceHeadingRef.current ?? userTrueHeadingRef.current;
      updateProjectedAnchors(
        list,
        userCoordsRef.current,
        headingToUse,
        calibratedLandmarkRef.current,
      );

      setCloudStatus(`${list.length} ponto(s)`);
      setIsFetching(false);
    } catch (err: any) {
      console.warn('Erro ao carregar âncoras:', err);
      setCloudStatus('Erro de conexão');
      setIsFetching(false);
    }
  }, [updateProjectedAnchors]);

  useEffect(() => {
    loadAnchors();
  }, [loadAnchors]);

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

  // Abertura do modal de criação de ponto com Hit-Test ou projeção de retículo
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
        console.warn('[CloudAnchor] Hit test aviso:', hitErr);
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

  // Micro-ajuste fino de profundidade do retículo
  const handleAdjustDistance = useCallback((delta: number) => {
    setPendingDistance((prevDist) => {
      const newDist = Number(Math.max(0.3, Math.min(30.0, prevDist + delta)).toFixed(2));
      const origin = rayOriginRef.current;
      const dir = rayDirectionRef.current;

      const newCoords: [number, number, number] = [
        Number((origin[0] + dir[0] * newDist).toFixed(2)),
        Number((origin[1] + dir[1] * newDist).toFixed(2)),
        Number((origin[2] + dir[2] * newDist).toFixed(2)),
      ];

      setPendingCoords(newCoords);
      return newDist;
    });
  }, []);

  // Criação de ponto geodésico persistente baseado na posição e visada
  const handleCreate = async () => {
    if (!anchorName.trim()) {
      Alert.alert('Aviso', 'Informe o nome do ponto.');
      return;
    }

    try {
      setIsSaving(true);
      setCloudStatus('Gravando ponto...');

      const activeLat = calibratedLandmark
        ? calibratedLandmark.latitude
        : userCoordsRef.current.latitude;
      const activeLon = calibratedLandmark
        ? calibratedLandmark.longitude
        : userCoordsRef.current.longitude;
      const activeAlt = calibratedLandmark
        ? calibratedLandmark.altitude
        : userCoordsRef.current.altitude;

      // Deslocamento métrico a partir da distância da mira e do azimute da câmera
      const dist = pendingDistance;
      const bearingRad = (userTrueHeadingRef.current * Math.PI) / 180;
      const deltaNorth = dist * Math.cos(bearingRad);
      const deltaEast = dist * Math.sin(bearingRad);

      const latOffset = deltaNorth / 111320;
      const lonOffset = deltaEast / (111320 * Math.cos((activeLat * Math.PI) / 180));

      const targetLat = Number((activeLat + latOffset).toFixed(7));
      const targetLon = Number((activeLon + lonOffset).toFixed(7));
      const targetAlt = Number((activeAlt + (pendingCoords[1] || 0)).toFixed(1));

      const cloudAnchorId = `coord-${Date.now()}`;

      const targetArPosition: [number, number, number] = [
        pendingCoords[0],
        pendingCoords[1],
        pendingCoords[2],
      ];

      const saved = await createAnchor({
        name: anchorName.trim(),
        cloudAnchorId,
        description: anchorDescription.trim() || undefined,
        position: targetArPosition,
        latitude: targetLat,
        longitude: targetLon,
        altitude: targetAlt,
        heading: userTrueHeadingRef.current,
      });

      // 1. Trava rigidamente a posição na sessão atual (ARCore SLAM fixa no espaço 3D real sem deriva)
      sessionLockedPositionsRef.current.set(saved.id, targetArPosition);

      // 2. Atualiza a lista bruta
      const updatedRawList = [saved, ...rawAnchorsRef.current];
      rawAnchorsRef.current = updatedRawList;

      // 3. Adiciona imediatamente à cena com a posição SLAM exata onde o usuário mirou
      setAnchors((prev) => [
        {
          ...saved,
          arPosition: targetArPosition,
          distanceMeters: pendingDistance,
        },
        ...prev,
      ]);

      setCloudStatus(`${updatedRawList.length} ponto(s)`);
      setAnchorName('');
      setAnchorDescription('');
      setModalVisible(false);

      Alert.alert(
        'Ponto Registrado!',
        `Nome: ${saved.name}\nCoordenadas: [${targetLat}, ${targetLon}]\nDistância: ${pendingDistance.toFixed(1)}m\n\nO ponto foi registrado geograficamente e está projetado no espaço AR.`,
      );
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err.message);
      setCloudStatus('Falha na gravação');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAnchor = useCallback((anchor: Anchor) => {
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
              await deleteAnchor(anchor.id);
              sessionLockedPositionsRef.current.delete(anchor.id);
              const remaining = rawAnchorsRef.current.filter((a) => a.id !== anchor.id);
              rawAnchorsRef.current = remaining;
              updateProjectedAnchors(
                remaining,
                userCoordsRef.current,
                userTrueHeadingRef.current,
                calibratedLandmarkRef.current,
              );
              Alert.alert('Sucesso', 'Ponto excluído.');
            } catch (err: any) {
              Alert.alert('Erro ao excluir', err.message);
            } finally {
              setIsSaving(false);
            }
          },
        },
      ],
    );
  }, [updateProjectedAnchors]);

  // Aplica filtro de raio nas âncoras passadas à cena AR
  const visibleAnchors = useMemo(() => {
    return anchors.filter((a) => {
      if (!isUsablePoint(a.arPosition)) return false;
      if (radiusFilter > 0 && typeof a.distanceMeters === 'number') {
        return a.distanceMeters <= radiusFilter;
      }
      return true;
    });
  }, [anchors, radiusFilter]);

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

  const trackingDotColor =
    trackingState === 3 ? '#34D399' : trackingState === 2 ? '#FBBF24' : '#EF4444';

  return (
    <View style={styles.rootContainer} {...panResponder.panHandlers}>
      {/* Viewport AR com suporte a Zoom Visual Contínuo via Animated.View */}
      <View style={styles.arViewportClip}>
        <Animated.View
          style={[
            styles.arZoomWrapper,
            { transform: [{ scale: zoomAnim }] },
          ]}>
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

      {/* Indicador de Zoom Ativo */}
      {zoomLevel > 1.05 ? (
        <View
          style={[styles.zoomBadge, { top: Math.max(insets.top + 98, 138) }]}
          pointerEvents="none">
          <Text style={styles.zoomBadgeText}>🔍 Zoom: {zoomLevel.toFixed(1)}x</Text>
        </View>
      ) : null}

      {/* Retículo / Mira Central em Realidade Aumentada */}
      <View style={styles.reticleOverlay} pointerEvents="none">
        {zoomLevel > 1.05 ? (
          <View style={styles.telescopicContainer}>
            <View style={styles.telescopicTag}>
              <Text style={styles.telescopicTagText}>
                🎯 {zoomLevel.toFixed(1)}x MIRA DE PRECISÃO
              </Text>
            </View>

            <View style={styles.telescopicOuterRing}>
              <View style={styles.telescopicMiddleRing}>
                <View style={styles.telescopicInnerRing}>
                  <View style={styles.telescopicCenterDot} />
                </View>
              </View>
              <View style={styles.crosshairHorizontal} />
              <View style={styles.crosshairVertical} />
            </View>
          </View>
        ) : (
          <View style={styles.defaultReticleRing}>
            <View style={styles.defaultReticleDot} />
          </View>
        )}
      </View>

      {/* Seletor de Zoom Flutuante (1x, 2x, 3x, 5x) na Lateral Direita */}
      <View style={styles.zoomSelectorBar} pointerEvents="box-none">
        {ZOOM_LEVELS.map((level) => {
          const isActive = Math.abs(zoomLevel - level) < 0.2;
          return (
            <TouchableOpacity
              key={`zoom-btn-${level}`}
              onPress={() => applyZoom(level, true)}
              activeOpacity={0.75}
              style={[styles.zoomButton, isActive ? styles.zoomButtonActive : null]}>
              <Text style={[styles.zoomButtonText, isActive ? styles.zoomButtonTextActive : null]}>
                {level}x
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* HUD Superior Flutuante */}
      <View
        style={[styles.topHudBar, { top: Math.max(insets.top + 8, 48) }]}
        pointerEvents="box-none">
        <View style={styles.hudPillsRow}>
          <View style={[styles.hudPill, styles.hudPillBlue]}>
            <View style={[styles.statusDot, { backgroundColor: trackingDotColor }]} />
            <Text style={styles.hudPillTextWhite}>{cloudStatus}</Text>
          </View>

          <TouchableOpacity
            onPress={() => setCalibrationModalVisible(true)}
            activeOpacity={0.8}
            style={[
              styles.hudPill,
              calibratedLandmark ? styles.hudPillEmerald : styles.hudPillCyan,
            ]}>
            <Text
              style={
                calibratedLandmark ? styles.hudPillTextEmerald : styles.hudPillTextCyan
              }>
              {calibratedLandmark
                ? `📍 ${calibratedLandmark.name.split(' ')[0]}`
                : `📡 GPS ±${Math.round(userCoords.accuracy)}m`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hudActionsRow}>
          <TouchableOpacity
            onPress={() => setCalibrationModalVisible(true)}
            activeOpacity={0.75}
            style={styles.hudIconBtn}>
            <Text style={styles.hudIconBtnText}>📍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={loadAnchors}
            disabled={isFetching}
            activeOpacity={0.75}
            style={styles.hudIconBtn}>
            {isFetching ? (
              <ActivityIndicator size="small" color="#60A5FA" />
            ) : (
              <Text style={styles.hudIconBtnText}>🔄</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Sub-Barra com Bússola e Filtro de Raio */}
      <View
        style={[styles.subHudBar, { top: Math.max(insets.top + 52, 92) }]}
        pointerEvents="box-none">
        <View style={styles.compassBadge}>
          <Text style={styles.compassBadgeText}>🧭 {userTrueHeading}° N</Text>
        </View>

        <View style={styles.radiusSelector}>
          {[
            { label: 'Todos', value: 0 },
            { label: '< 100m', value: 100 },
            { label: '< 50m', value: 50 },
          ].map((item) => {
            const isActive = radiusFilter === item.value;
            return (
              <TouchableOpacity
                key={`radius-${item.value}`}
                onPress={() => setRadiusFilter(item.value)}
                style={[
                  styles.radiusOptionBtn,
                  isActive ? styles.radiusOptionBtnActive : null,
                ]}>
                <Text
                  style={[
                    styles.radiusOptionText,
                    isActive ? styles.radiusOptionTextActive : null,
                  ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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

      {/* Modal de Calibração Zero-Marker (Entrada / Localização no Campus) */}
      <Modal
        visible={calibrationModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCalibrationModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calibrationSheet}>
            <Text style={styles.modalTitle}>📍 Calibração de Localização</Text>
            <Text style={styles.modalSubtitle}>
              Selecione sua entrada ou marco de referência para zerar desvios de GPS. O SLAM manterá a precisão máxima.
            </Text>

            {calibratedLandmark ? (
              <View style={styles.activeCalibrationBox}>
                <Text style={styles.activeCalibrationTitle}>
                  ✅ Calibrado em: {calibratedLandmark.name}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setCalibratedLandmark(null);
                    calibratedLandmarkRef.current = null;
                    referenceHeadingRef.current = userTrueHeadingRef.current;
                    lastProjectedCoordsRef.current = userCoordsRef.current;
                    updateProjectedAnchors(
                      rawAnchorsRef.current,
                      userCoordsRef.current,
                      userTrueHeadingRef.current,
                      null,
                    );
                    setCalibrationModalVisible(false);
                    Alert.alert('GPS Restaurado', 'O aplicativo voltou a usar o sinal GPS em tempo real.');
                  }}
                  style={styles.resetCalibrationBtn}>
                  <Text style={styles.resetCalibrationBtnText}>Restaurar Sinal GPS</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <ScrollView style={styles.landmarksList} showsVerticalScrollIndicator={false}>
              {CAMPUS_CALIBRATION_POINTS.map((landmark) => {
                const distToUser = calculateDistance(
                  userCoords.latitude,
                  userCoords.longitude,
                  landmark.latitude,
                  landmark.longitude,
                );

                return (
                  <TouchableOpacity
                    key={landmark.name}
                    onPress={() => {
                      setCalibratedLandmark(landmark);
                      calibratedLandmarkRef.current = landmark;
                      referenceHeadingRef.current = userTrueHeadingRef.current;
                      updateProjectedAnchors(
                        rawAnchorsRef.current,
                        userCoordsRef.current,
                        userTrueHeadingRef.current,
                        landmark,
                      );
                      setCalibrationModalVisible(false);
                      Alert.alert(
                        'Calibração Concluída!',
                        `Origem AR alinhada com ${landmark.name}.\nTodos os pontos agora estão fixos e ancorados rigidamente no espaço físico.`,
                      );
                    }}
                    style={styles.landmarkCard}
                    activeOpacity={0.75}>
                    <View style={styles.landmarkCardHeader}>
                      <Text style={styles.landmarkCardTitle}>{landmark.name}</Text>
                      <Text style={styles.landmarkCardDist}>~{Math.round(distToUser)} m</Text>
                    </View>
                    <Text style={styles.landmarkCardDesc}>{landmark.description}</Text>
                    <Text style={styles.landmarkCardCoords}>
                      GPS: [{landmark.latitude.toFixed(5)}, {landmark.longitude.toFixed(5)}]
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setCalibrationModalVisible(false)}
              style={styles.closeCalibrationBtn}>
              <Text style={styles.closeCalibrationBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal de Cadastro de Ponto com Micro-Ajuste de Profundidade */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !isSaving && setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}>
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Marcar Ponto no Espaço</Text>
              <Text style={styles.modalSubtitle}>
                O ponto será registrado nas coordenadas geográficas apontadas pela mira.
              </Text>

              {/* Informações de Localização e Azimute */}
              <View style={styles.geoInfoBox}>
                <Text style={styles.geoInfoRow}>
                  📍 Origem:{' '}
                  {calibratedLandmark
                    ? calibratedLandmark.name.split(' ')[0]
                    : `GPS (±${Math.round(userCoords.accuracy)}m)`}
                </Text>
                <Text style={styles.geoInfoRow}>
                  🧭 Bússola: {userTrueHeading}° (Norte Verdadeiro)
                </Text>
              </View>

              {/* Micro-ajuste de Distância e Profundidade do Alvo */}
              <View style={styles.distanceAdjustPanel}>
                <View style={styles.distanceHeaderRow}>
                  <Text style={styles.distanceLabel}>Distância da Mira:</Text>
                  <Text style={styles.distanceValue}>{pendingDistance.toFixed(2)} m</Text>
                </View>
                <View style={styles.distanceButtonsRow}>
                  <TouchableOpacity
                    onPress={() => handleAdjustDistance(-0.5)}
                    disabled={isSaving}
                    style={styles.distanceStepButton}>
                    <Text style={styles.distanceStepTextNeg}>-0.5m</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAdjustDistance(-0.1)}
                    disabled={isSaving}
                    style={styles.distanceStepButton}>
                    <Text style={styles.distanceStepTextNeg}>-10cm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAdjustDistance(0.1)}
                    disabled={isSaving}
                    style={styles.distanceStepButton}>
                    <Text style={styles.distanceStepTextPos}>+10cm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAdjustDistance(0.5)}
                    disabled={isSaving}
                    style={styles.distanceStepButton}>
                    <Text style={styles.distanceStepTextPos}>+0.5m</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.inputLabel}>Nome do Local *</Text>
              <TextInput
                value={anchorName}
                onChangeText={setAnchorName}
                placeholder="Ex: Bloco C, Entrada Biblioteca, Sala 102"
                placeholderTextColor="#64748B"
                style={styles.textInput}
                autoFocus
              />

              <Text style={styles.inputLabel}>Descrição (opcional)</Text>
              <TextInput
                value={anchorDescription}
                onChangeText={setAnchorDescription}
                placeholder="Ex: Prédio de TI e Computação"
                placeholderTextColor="#64748B"
                style={[styles.textInput, styles.textInputLast]}
              />

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  disabled={isSaving}
                  style={styles.cancelButton}>
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreate}
                  disabled={isSaving}
                  style={styles.saveButton}>
                  {isSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                  <Text style={styles.saveButtonText}>
                    {isSaving ? 'Salvando...' : 'Salvar Ponto'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
  reticleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
    elevation: 25,
  },
  telescopicContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  telescopicTag: {
    backgroundColor: 'rgba(37, 99, 235, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#60A5FA',
    marginBottom: 8,
  },
  telescopicTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  telescopicOuterRing: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  telescopicMiddleRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(34, 211, 238, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  telescopicInnerRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(103, 232, 249, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  telescopicCenterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22D3EE',
  },
  crosshairHorizontal: {
    position: 'absolute',
    width: 96,
    height: 1.5,
    backgroundColor: 'rgba(34, 211, 238, 0.7)',
  },
  crosshairVertical: {
    position: 'absolute',
    width: 1.5,
    height: 96,
    backgroundColor: 'rgba(34, 211, 238, 0.7)',
  },
  defaultReticleRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultReticleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38BDF8',
  },
  zoomSelectorBar: {
    position: 'absolute',
    right: 14,
    top: '32%',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.7)',
    gap: 8,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  zoomButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  zoomButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#60A5FA',
  },
  zoomButtonText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomButtonTextActive: {
    color: '#FFFFFF',
  },
  topHudBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
    elevation: 20,
  },
  hudPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  hudActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  hudPillBlue: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: '#1E3A8A',
  },
  hudPillCyan: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: '#0E7490',
  },
  hudPillEmerald: {
    backgroundColor: 'rgba(6, 78, 59, 0.85)',
    borderColor: '#059669',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  hudPillTextWhite: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  hudPillTextCyan: {
    color: '#67E8F9',
    fontSize: 12,
    fontWeight: '600',
  },
  hudPillTextEmerald: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  hudIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudIconBtnText: {
    fontSize: 16,
  },
  subHudBar: {
    position: 'absolute',
    top: 94,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
    elevation: 20,
  },
  compassBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  compassBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  radiusSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 2,
    gap: 4,
  },
  radiusOptionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  radiusOptionBtnActive: {
    backgroundColor: '#2563EB',
  },
  radiusOptionText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  radiusOptionTextActive: {
    color: '#FFFFFF',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  calibrationSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 22,
    maxHeight: '80%',
  },
  activeCalibrationBox: {
    backgroundColor: 'rgba(6, 78, 59, 0.45)',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeCalibrationTitle: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  resetCalibrationBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resetCalibrationBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  landmarksList: {
    marginBottom: 16,
  },
  landmarkCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  landmarkCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  landmarkCardTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  landmarkCardDist: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  landmarkCardDesc: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  landmarkCardCoords: {
    color: '#64748B',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  closeCalibrationBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  closeCalibrationBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 25,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
    lineHeight: 17,
  },
  geoInfoBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  geoInfoRow: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  distanceAdjustPanel: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  distanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  distanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  distanceValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#38BDF8',
  },
  distanceButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  distanceStepButton: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  distanceStepTextNeg: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
  },
  distanceStepTextPos: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
    marginBottom: 12,
  },
  textInputLast: {
    marginBottom: 18,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cancelButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1.5,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#60A5FA',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ViroARAnchorContainer;
