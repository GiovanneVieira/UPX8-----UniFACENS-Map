import React, { FC, useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ViroARSceneNavigator } from "@reactvision/react-viro";
import { useQueryClient } from "@tanstack/react-query";
import { arXZToEnu, enuToGeodetic, type Anchor, isUsablePoint } from "shared";
import {
  useAnchorsQuery,
  useCreateAnchorMutation,
  useDeleteAnchorMutation,
  anchorKeys,
} from "@/features/anchors/queries/use-anchors-query";
import { patchAnchor } from "@/services/api";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ViroARAnchorScene } from "./ViroARAnchorScene";
import { useARGeolocation } from "./hooks/use-ar-geolocation";
import { useARProjection } from "./hooks/use-ar-projection";
import { useGeospatialPose, isPoseFresh } from "./hooks/use-geospatial-pose";
import { useNativeAnchors } from "./hooks/use-native-anchors";
import { useCloudAnchors, SCAN_GUIDE_MS } from "./hooks/use-cloud-anchors";
import { useARWorldAlignment } from "./hooks/use-ar-world-alignment";
import { useARZoom } from "./hooks/use-ar-zoom";
import { ARStatusHud } from "./hud/ar-status-hud";
import { ARCompassRadiusBar } from "./hud/ar-compass-radius-bar";
import { ARZoomSelector } from "./hud/ar-zoom-selector";
import { ARReticle } from "./hud/ar-reticle";
import { NavInstructionHud } from "./hud/nav-instruction-hud";
import { PlaceAnchorModal } from "./modals/place-anchor-modal";
import { AnchorDetailSheet } from "./modals/anchor-detail-sheet";
import { useARNavigation } from "@/features/ar/hooks/use-ar-navigation";

const HIT_TEST_PRIORITY = [
  "DepthPoint",
  "ExistingPlaneUsingExtent",
  "ExistingPlane",
  "EstimatedHorizontalPlane",
  "FeaturePoint",
];

/**
 * Tipos de hit que suportam criação de ÂNCORA no Android (createAnchoredNode).
 * DepthPoint e EstimatedHorizontalPlane FALHAM com ANCHOR_CREATION_FAILED
 * (erro de device, 2026-11-09) — posicionam a mira mas não hospedam âncora.
 */
const ANCHORABLE_HIT_TYPES = new Set([
  "ExistingPlaneUsingExtent",
  "ExistingPlane",
  "FeaturePoint",
]);

// Constante estática da cena inicial para nunca recriar a instância nativa do ViroARSceneNavigator
const INITIAL_AR_SCENE = { scene: ViroARAnchorScene as any };

/** P3 — Gate de precisão horizontal na criação de pins (média do buffer). */
const CREATE_MAX_ACCURACY_M = 4;
/** Gate vertical: bloqueia criação com acurácia vertical pior que isso (m). */
const CREATE_MAX_VERTICAL_ACCURACY_M = 25;
/** Gate de heading: sem heading confiável o Δ (e o pin) nasce rotacionado. */
const CREATE_MAX_HEADING_ACCURACY_DEG = 15;
/** Gate de estabilidade: spread posicional máximo do buffer (m). */
const CREATE_MAX_POS_SPREAD_M = 2.5;
/** Gate de estabilidade: spread de heading máximo do buffer (°). */
const CREATE_MAX_HEADING_SPREAD_DEG = 10;
/** Acurácia máxima da pose para CRIAR âncoras nativas (economia de quota). */
const NATIVE_ANCHOR_MAX_POSE_ACCURACY_M = 20;
/** Range de distância da mira (m) — custom input do modal. */
const MIN_PLACE_DISTANCE_M = 0.3;
const MAX_PLACE_DISTANCE_M = 50;

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
  const [mutationStatus, setMutationStatus] = useState<string | null>(null);
  const { isAdmin } = useAuth();

  // ── Motores de domínio (hooks dedicados) ─────────────────────────────────
  const cameraPosRef = useRef<[number, number, number]>([0, 0, 0]);
  const cameraFwdRef = useRef<[number, number, number]>([0, 0, -1]);
  /** Yaw da câmera no mundo AR em GRAUS (rotation[1] do onCameraTransformUpdate). */
  const cameraYawRef = useRef<number>(0);
  const trackingStateRef = useRef<number>(2);
  const [trackingState, setTrackingState] = useState<number>(2);

  const geo = useARGeolocation();
  const geospatial = useGeospatialPose();

  // ── Motor de alinhamento mundial: Δ (azimute do mundo AR ↔ Norte) ────────
  // Estimado 1× por sessão a partir da pose geospatial + forward da câmera
  // (com guarda de horizontalidade — rotation[1] garbla sob câmera inclinada),
  // congelado em seguida. Jamais fusão contínua (lição §11.5 do AGENTS.MD).
  const alignment = useARWorldAlignment(geospatial.pose, cameraFwdRef);

  // ── SISTEMA PRIMÁRIO: âncoras NATIVAS ARCore (Terra-ancoradas) ──────────
  // Gate de pose: só criar âncoras nativas (requests à ARCore API) quando a
  // pose está fresca e razoável — resolver âncora com GPS ruim é request fútil
  // (pendura até o timeout e falha). Economiza o quota da ARCore API.
  const nativeAnchorGateReady = useMemo(() => {
    const pose = geospatial.pose;
    return (
      geospatial.isFresh &&
      pose !== null &&
      Number.isFinite(pose.horizontalAccuracy) &&
      pose.horizontalAccuracy <= NATIVE_ANCHOR_MAX_POSE_ACCURACY_M
    );
  }, [geospatial.pose, geospatial.isFresh]);

  const nativeAnchors = useNativeAnchors({
    serverAnchors: anchorsQuery.data,
    poseReady: nativeAnchorGateReady,
  });

  // ── Âncoras de NUVEM VISUAIS — precisão centimétrica perto do pin ────────
  const cloudAnchors = useCloudAnchors({
    serverAnchors: anchorsQuery.data,
    geoPoseRef: geospatial.poseRef,
    trackingState,
  });

  /** Entradas unificadas: visual (nuvem) tem prioridade sobre geospatial. */
  const mergedNativeEntries = useMemo(() => {
    const merged = new Map(nativeAnchors.entries);
    for (const [id, entry] of cloudAnchors.entries) {
      merged.set(id, entry);
    }
    return merged;
  }, [nativeAnchors.entries, cloudAnchors.entries]);

  const [reprojectNonce, setReprojectNonce] = useState(0);

  const projection = useARProjection({
    serverAnchors: anchorsQuery.data,
    nativeEntries: mergedNativeEntries,
    geoPoseRef: geospatial.poseRef,
    cameraPosRef,
    delta: alignment.delta,
    poseTick: geospatial.pose,
    reprojectNonce,
  });

  // ── Navegação ────────────────────────────────────────────────────────────
  const [detailSheetVisible, setDetailSheetVisible] = useState(false);
  const [detailAnchor, setDetailAnchor] = useState<Anchor | null>(null);
  const {
    route: arRoute,
    startNavigation,
    stopNavigation,
    updateProgress,
  } = useARNavigation({
    geoPoseRef: geospatial.poseRef,
    cameraPosRef,
  });

  // ── Estado de UI local ────────────────────────────────────────────────────
  const [radiusFilter, setRadiusFilter] = useState<number>(0);
  const [planeCount, setPlaneCount] = useState<number>(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [anchorName, setAnchorName] = useState("");
  const [anchorDescription, setAnchorDescription] = useState("");
  const [pendingCoords, setPendingCoords] = useState<[number, number, number]>([0, 0, -2.0]);
  const [pendingDistance, setPendingDistance] = useState<number>(2.0);
  const rayOriginRef = useRef<[number, number, number]>([0, 0, 0]);
  const rayDirectionRef = useRef<[number, number, number]>([0, 0, -1]);

  // ── Status do HUD ─────────────────────────────────────────────────────────
  // Fases da ancoragem visual (cloud) no HUD
  useEffect(() => {
    const phase = cloudAnchors.hosting.phase;
    if (phase === 'hosting') setMutationStatus('Hospedando âncora visual…');
    else if (phase === 'calibrating') setMutationStatus('Calibrando âncora visual…');
    else if (phase === 'done') setMutationStatus(null);
    else if (phase === 'failed') {
      setMutationStatus('Ancoragem visual indisponível — usando GPS');
      const t = setTimeout(() => setMutationStatus(null), 4000);
      return () => clearTimeout(t);
    }
  }, [cloudAnchors.hosting.phase]);

  const cloudStatusDerived = useMemo(() => {
    if (anchorsQuery.isPending) return "Carregando pontos...";
    if (anchorsQuery.isError) return "Erro de conexão";
    const total = anchorsQuery.data?.length ?? 0;
    if (total === 0) return "0 ponto(s)";
    // Localização visual em andamento (SIFT ~30s — apontar a câmera ajuda)
    if (cloudAnchors.resolving) return "Localizando âncora visual…";
    // Mundo AR ainda não alinhado com o Norte → projeção aguardando Δ
    if (alignment.status === "aligning") return "Alinhando AR…";
    // Pins do servidor existem mas nenhum projetado → calibrando
    if (projection.anchors.length === 0) {
      const pose = geospatial.pose;
      const acc = pose?.horizontalAccuracy;
      if (acc !== undefined && acc !== null) {
        return `Calibrando AR… ±${acc.toFixed(0)}m`;
      }
      return "Calibrando AR…";
    }
    return `${projection.anchors.length} ponto(s)`;
  }, [
    anchorsQuery.isPending,
    anchorsQuery.isError,
    anchorsQuery.data,
    projection.anchors.length,
    geospatial.pose,
    alignment.status,
    cloudAnchors.resolving,
  ]);
  const cloudStatus = mutationStatus ?? cloudStatusDerived;

  // ── Callbacks da cena Viro ────────────────────────────────────────────────
  const lastNavTickRef = useRef<number>(0);

  const handleCameraUpdate = useCallback(
    (pos: [number, number, number], fwd: [number, number, number], yawDeg: number) => {
      cameraPosRef.current = pos;
      cameraFwdRef.current = fwd;
      cameraYawRef.current = yawDeg;

      const now = Date.now();
      if (now - lastNavTickRef.current >= 1000) {
        lastNavTickRef.current = now;
        const pose = geospatial.poseRef.current;
        if (pose && isPoseFresh(pose)) {
          updateProgress(pose.latitude, pose.longitude);
        }
      }
    },
    [geospatial.poseRef, updateProgress],
  );

  const handleTrackingUpdate = useCallback((state: number) => {
    if (state !== 3 && trackingStateRef.current === 3) {
      console.warn(`[ARTrack] tracking degradou (3 → ${state}) — mundo não-rígido, conteúdo AR será ocultado`);
    } else if (state === 3 && trackingStateRef.current !== 3) {
      console.log("[ARTrack] tracking estável (3) — mundo rígido novamente");
    }
    trackingStateRef.current = state;
    setTrackingState(state);
  }, []);

  const handleRegisterSceneRef = useCallback((scene: any) => {
    arSceneRef.current = scene;
  }, []);

  const handlePlanesUpdated = useCallback(
    (count: number, _planes: any[]) => {
      setPlaneCount(count);
    },
    [],
  );

  // ── Seleção por retícula ──────────────────────────────────────────────────
  const handleTapByReticle = useCallback(() => {
    const camPos = cameraPosRef.current;
    const camFwd = cameraFwdRef.current;
    const fwdLen = Math.hypot(camFwd[0], camFwd[1], camFwd[2]) || 1;
    const fwd: [number, number, number] = [
      camFwd[0] / fwdLen,
      camFwd[1] / fwdLen,
      camFwd[2] / fwdLen,
    ];

    let bestAnchor: Anchor | null = null;
    let bestDot = 0.97;

    for (const a of projection.anchors) {
      if (!a.arPosition) continue;
      const dx = a.arPosition[0] - camPos[0];
      const dy = a.arPosition[1] - camPos[1];
      const dz = a.arPosition[2] - camPos[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      const dot = (dx * fwd[0] + dy * fwd[1] + dz * fwd[2]) / len;
      if (dot > bestDot) {
        bestDot = dot;
        bestAnchor = a;
      }
    }

    if (bestAnchor) {
      setDetailAnchor(bestAnchor);
      setDetailSheetVisible(true);
    }
  }, [projection.anchors]);

  const { zoomLevel, applyZoom, pinchGesture, arZoomAnimatedStyle } = useARZoom(
    { onTap: handleTapByReticle },
  );

  // ── "Marcar Ponto" ────────────────────────────────────────────────────────
  const handlePlaneTapped = useCallback(
    (_anchorId: string, position: [number, number, number]) => {
      setPendingCoords([
        Number(position[0].toFixed(2)),
        Number(position[1].toFixed(2)),
        Number(position[2].toFixed(2)),
      ]);
      const camPos = cameraPosRef.current || [0, 0, 0];
      const dx = position[0] - camPos[0];
      const dy = position[1] - camPos[1];
      const dz = position[2] - camPos[2];
      const dist = Math.hypot(dx, dy, dz);
      setPendingDistance(Number(Math.max(0.3, Math.min(30.0, dist)).toFixed(2)));
      rayOriginRef.current = camPos;
      const fwdLen = dist || 1;
      rayDirectionRef.current = [dx / fwdLen, dy / fwdLen, dz / fwdLen];
      setModalVisible(true);
    },
    [],
  );

  const handleOpenPlaceModal = useCallback(async () => {
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;
    let targetCoords: [number, number, number] | null = null;
    let bestHit: unknown = null;

    // ── Hit-test com RETRY (3x com 600ms) + fallback RAIO ───────────────
    // O ARCore precisa de tempo para detectar planos: um único disparo no
    // centro da tela falha se o plano ainda não se formou naquele pixel.
    // O raio frontal pega feature points mesmo sem plano detectado.
    let bestAnchorableHit: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (arSceneRef.current?.performARHitTestWithPoint) {
          const hits = await arSceneRef.current.performARHitTestWithPoint(centerX, centerY);
          if (Array.isArray(hits) && hits.length > 0) {
            // Diagnóstico: quais tipos o ARCore está devolvendo?
            console.log(`[ARCloud] hits (tentativa ${attempt}): ${hits.map((h: any) => h.type).join(', ')}`);
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
                bestHit = match;
                // Guarda o primeiro hit ANCHORABLE (para createAnchoredNode)
                if (ANCHORABLE_HIT_TYPES.has(match.type)) {
                  bestAnchorableHit = match;
                }
                break;
              }
            }
            // Se o melhor hit não é anchorable, procura um anchorable na lista
            if (bestHit && !bestAnchorableHit) {
              const anchorable = hits.find(
                (h: any) => ANCHORABLE_HIT_TYPES.has(h.type) && isUsablePoint(h.transform?.position),
              );
              if (anchorable) bestAnchorableHit = anchorable;
            }
            if (bestHit) break;
          }
        }
        // Fallback: posição 3D à frente da câmera pega feature points
        // (performARHitTestWithRay espera formato de array não documentado
        // — ViroRay = any — e lança exceção de tipo; REMOVIDO por bug de
        // device 2026-11-09. Position-based é mais confiável.)
        if (attempt === 3 && !bestAnchorableHit && arSceneRef.current?.performARHitTestWithPosition) {
          const fwd = cameraFwdRef.current;
          const cam = cameraPosRef.current;
          const ahead: [number, number, number] = [
            cam[0] + fwd[0] * 3,
            cam[1] + fwd[1] * 3,
            cam[2] + fwd[2] * 3,
          ];
          try {
            const posHits = await arSceneRef.current.performARHitTestWithPosition(ahead);
            if (Array.isArray(posHits) && posHits.length > 0) {
              console.log(`[ARCloud] hits via posição 3D: ${posHits.map((h: any) => h.type).join(', ')}`);
              const anchorable = posHits.find(
                (h: any) => ANCHORABLE_HIT_TYPES.has(h.type) && isUsablePoint(h.transform?.position),
              );
              if (anchorable) {
                if (!bestHit) {
                  targetCoords = [
                    anchorable.transform.position[0],
                    anchorable.transform.position[1],
                    anchorable.transform.position[2],
                  ];
                  bestHit = anchorable;
                }
                bestAnchorableHit = anchorable;
              }
            }
          } catch (posErr) {
            console.warn('[ARCloud] performARHitTestWithPosition falhou:', posErr);
          }
        }
        if (!bestHit && attempt < 3) {
          await new Promise((r) => setTimeout(r, 600));
        }
      } catch (hitErr) {
        console.warn(`[AR] Hit test aviso (tentativa ${attempt}):`, hitErr);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 600));
      }
    }

    // Âncora LOCAL para a ancoragem visual (Cloud Anchor): criada AGORA
    // porque o resultado do hit expira em 30s — a âncora não expira. Será
    // hospedada após o save (hostCloudAnchor, caminho ARCore nativo).
    // Usa bestAnchorableHit (ExistingPlane/FeaturePoint) — DepthPoint e
    // EstimatedHorizontalPlane FALHAM com ANCHOR_CREATION_FAILED no Android.
    // Retry ×2: a interop Fabric pode rejeitar a 1ª chamada no settle do
    // mount (mesmo padrão do setGeospatialModeEnabled — §12.4).
    if (bestAnchorableHit && arSceneRef.current?.createAnchoredNode) {
      let anchorId: string | null = null;
      for (let attempt = 1; attempt <= 2 && !anchorId; attempt++) {
        try {
          const nodeRef = await arSceneRef.current.createAnchoredNode(bestAnchorableHit);
          anchorId = (nodeRef as { anchorId?: string } | null)?.anchorId ?? null;
          if (!anchorId) {
            console.warn(`[ARCloud] createAnchoredNode sem anchorId (tentativa ${attempt})`);
          } else {
            console.log(`[ARCloud] âncora local criada: ${anchorId.slice(0, 16)}…`);
          }
        } catch (anchorErr) {
          console.warn(`[ARCloud] createAnchoredNode falhou (tentativa ${attempt}):`, anchorErr);
        }
      }
      cloudAnchors.setPendingLocalAnchor(anchorId);
    } else if (bestHit && !bestAnchorableHit) {
      console.warn(
        "[ARCloud] hit não-anchorable (DepthPoint/Estimated) — GPS-only para este pin",
      );
      cloudAnchors.setPendingLocalAnchor(null);
    } else if (!bestHit) {
      console.warn("[ARCloud] hit-test sem resultado utilizável — pin será GPS-only se salvo assim");
      cloudAnchors.setPendingLocalAnchor(null);
    } else {
      console.warn("[ARCloud] createAnchoredNode indisponível no ref da cena");
      cloudAnchors.setPendingLocalAnchor(null);
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

  const handleAdjustDistance = useCallback(
    (delta: number) => {
      const newDist = Number(
        Math.max(MIN_PLACE_DISTANCE_M, Math.min(MAX_PLACE_DISTANCE_M, pendingDistance + delta)).toFixed(2),
      );
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

  /** Define distância ABSOLUTA da mira (input customizado do modal). */
  const handleSetDistance = useCallback(
    (value: number) => {
      const clamped = Number(
        Math.max(MIN_PLACE_DISTANCE_M, Math.min(MAX_PLACE_DISTANCE_M, value)).toFixed(2),
      );
      const origin = rayOriginRef.current;
      const dir = rayDirectionRef.current;
      setPendingDistance(clamped);
      setPendingCoords([
        Number((origin[0] + dir[0] * clamped).toFixed(2)),
        Number((origin[1] + dir[1] * clamped).toFixed(2)),
        Number((origin[2] + dir[2] * clamped).toFixed(2)),
      ]);
    },
    [],
  );

  // ── Refresh REAL: refetch + retry de falhas + re-projeção + recalibra Δ ──
  const handleNavigatorReady = useCallback(
    (nav: any) => {
      nativeAnchors.handleNavigatorReady(nav);
      cloudAnchors.handleNavigatorReady(nav);
    },
    [nativeAnchors, cloudAnchors],
  );

  // ── Refresh REAL: refetch + retry de falhas + re-projeção + recalibra Δ ──
  const handleRefresh = useCallback(() => {
    void anchorsQuery.refetch();
    projection.clearFrozen();
    nativeAnchors.retryFailed();
    alignment.realign();
    setReprojectNonce((n) => n + 1);
  }, [anchorsQuery, projection, nativeAnchors, alignment]);

  // ── handleCreate: conversão tap→lat/lng/alt via Δ + POSE MÉDIA ───────────
  const handleCreate = async () => {
    if (!anchorName.trim()) {
      Alert.alert("Aviso", "Informe o nome do ponto.");
      return;
    }

    try {
      setIsSaving(true);
      setMutationStatus("Gravando ponto...");

      const pose = geospatial.poseRef.current;
      if (!pose || !isPoseFresh(pose)) {
        setMutationStatus(null);
        Alert.alert(
          "Aguarde o GPS",
          "A pose geospatial ainda não está pronta. Aponte para o ambiente e aguarde alguns segundos.",
        );
        return;
      }

      // O offset do tap vive no FRAME AR da sessão — a rotação para ENU
      // precisa do Δ (azimute do mundo AR), não do heading cru da câmera.
      const delta = alignment.deltaRef.current;
      if (delta === null) {
        setMutationStatus(null);
        Alert.alert(
          "Aguarde o alinhamento AR",
          "O mundo AR ainda está sendo alinhado com o Norte verdadeiro. Aponte a câmera para o horizonte e aguarde alguns segundos.",
        );
        return;
      }

      // Pose MÉDIA só para GATES (ruído ÷√N suaviza spikes transitórios).
      const avgPose = geospatial.averagedPose() ?? pose;

      // Gate de precisão horizontal (média do buffer — suaviza spikes)
      if (avgPose.horizontalAccuracy > CREATE_MAX_ACCURACY_M) {
        setMutationStatus(null);
        Alert.alert(
          "Precisão insuficiente",
          `A precisão atual é de ±${avgPose.horizontalAccuracy.toFixed(1)}m (máximo: ±${CREATE_MAX_ACCURACY_M}m).`,
        );
        return;
      }

      // Gate de heading — sem heading confiável, o Δ nasce rotacionado e o
      // pin grava coordenadas erradas (padrão do sample oficial: 10°/10m).
      if (avgPose.headingAccuracy > CREATE_MAX_HEADING_ACCURACY_DEG) {
        setMutationStatus(null);
        Alert.alert(
          "Orientação imprecisa",
          `A precisão da bússola geospatial é de ±${avgPose.headingAccuracy.toFixed(0)}° (máximo: ±${CREATE_MAX_HEADING_ACCURACY_DEG}°). Aponte para o horizonte e mova o celular lentamente em 8 para calibrar.`,
        );
        return;
      }

      // Gate vertical (bloqueia só se muito ruim — GPS vertical é notoriamente ruidoso)
      if (avgPose.verticalAccuracy > CREATE_MAX_VERTICAL_ACCURACY_M) {
        setMutationStatus(null);
        Alert.alert(
          "Precisão vertical insuficiente",
          `A acurácia vertical é de ±${avgPose.verticalAccuracy.toFixed(0)}m (máximo: ±${CREATE_MAX_VERTICAL_ACCURACY_M}m). Aguarde o sinal estabilizar.`,
        );
        return;
      }

      // Gate de ESTABILIDADE: buffer espalhado = pose ainda convergindo —
      // criar agora grava coordenadas erradas E invalida o uso da média.
      // Estável (spread baixo) = ruído independente → média segura (÷√N).
      const stability = geospatial.stability();
      if (
        stability.sampleCount < 4 ||
        stability.posSpreadM > CREATE_MAX_POS_SPREAD_M ||
        stability.headingSpreadDeg > CREATE_MAX_HEADING_SPREAD_DEG
      ) {
        setMutationStatus(null);
        Alert.alert(
          "Sinal instável",
          `A posição ainda está se estabilizando (dispersão de ${stability.posSpreadM.toFixed(1)}m). Fique parado, aponte para o horizonte e aguarde alguns segundos antes de salvar.`,
        );
        return;
      }

      // Conversão tap SLAM → WGS84:
      // 1. offset no frame AR → ENU (rotação involutiva por Δ)
      // 2. ENU → graus com raios de curvatura WGS84 (inversa exata da projeção)
      // 3. componente vertical do tap ENTRA na altitude (altura de criação)
      //
      // Origem ENU = pose MÉDIA do buffer — SEGURA porque o gate de
      // estabilidade acima garante que as amostras não estão derivando
      // (ruído independente em torno do valor verdadeiro). CamPos é
      // instantâneo e pareado com o Δ congelado da sessão.
      const camPos = cameraPosRef.current;
      const offset: [number, number, number] = [
        pendingCoords[0] - camPos[0],
        pendingCoords[1] - camPos[1],
        pendingCoords[2] - camPos[2],
      ];
      const { east, north } = arXZToEnu(offset[0], offset[2], delta);
      const up = offset[1];
      const { latitude, longitude, altitude: targetAlt } = enuToGeodetic(
        avgPose.latitude,
        avgPose.longitude,
        avgPose.altitude,
        east,
        north,
        up,
      );
      const targetLat = Number(latitude.toFixed(7));
      const targetLon = Number(longitude.toFixed(7));

      const cloudAnchorId = `coord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const saved = await createAnchorMutation.mutateAsync({
        name: anchorName.trim(),
        cloudAnchorId,
        description: anchorDescription.trim() || undefined,
        latitude: targetLat,
        longitude: targetLon,
        altitude: Number(targetAlt.toFixed(2)),
        heading: Number(avgPose.heading.toFixed(1)),
      });

      // Exibição imediata: posição SLAM local até a âncora nativa resolver
      // (a projeção interpola suavemente quando a nativa resolver)
      nativeAnchors.addLocal(saved.id, pendingCoords);
      queryClient.setQueryData<Anchor[]>(anchorKeys.lists(), (old) =>
        old ? [saved, ...old] : [saved],
      );

      setMutationStatus(null);
      setAnchorName("");
      setAnchorDescription("");
      setModalVisible(false);

      // ── ANCORAGEM VISUAL (Cloud Anchor ARCore) — escaneio guiado ───────
      // O hostCloudAnchor empacota os features visuais que a câmera capturou
      // ao redor da âncora — escanear o entorno ANTES melhora o resolve no
      // retorno (precisão centimétrica, independe de GPS/heading).
      if (cloudAnchors.hasPendingLocalAnchor()) {
        cloudAnchors.beginScanGuide();
        setMutationStatus(
          "Escaneie: aponte para o PONTO e para o entorno dele, movendo o celular devagar em várias direções (~15s)",
        );
        const pinId = saved.id;
        const pinPos: [number, number, number] = [...pendingCoords];
        setTimeout(() => {
          setMutationStatus("Hospedando âncora visual…");
          void cloudAnchors.hostPendingAnchor(pinId, pinPos, async ({ cloudAnchorId, frameOffset }) => {
            try {
              const updated = await patchAnchor(pinId, { cloudAnchorId, frameOffset });
              queryClient.setQueryData<Anchor[]>(anchorKeys.lists(), (old) =>
                old ? old.map((a) => (a.id === pinId ? updated : a)) : old,
              );
            } catch (patchErr) {
              console.warn("[ARCloud] PATCH do cloudAnchorId falhou:", patchErr);
            }
          });
        }, SCAN_GUIDE_MS);
      } else {
        setMutationStatus(
          "Nenhuma superfície detectada no ponto — mirando chão/parede com textura, o pin ganha ancoragem visual",
        );
        setTimeout(() => setMutationStatus(null), 5000);
      }
    } catch (err: unknown) {
      Alert.alert(
        "Erro ao Salvar",
        err instanceof Error ? err.message : "Não foi possível salvar o ponto.",
      );
      setMutationStatus("Falha na gravação");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Filtro de visibilidade ────────────────────────────────────────────────
  const visibleAnchors = useMemo(() => {
    return projection.anchors.filter((a) => {
      if (!isUsablePoint(a.arPosition)) return false;
      if (radiusFilter > 0 && typeof a.distanceMeters === "number") {
        return a.distanceMeters <= radiusFilter;
      }
      return true;
    });
  }, [projection.anchors, radiusFilter]);

  // ── viroAppProps ─────────────────────────────────────────────────────────
  const viroAppProps = useMemo(
    () => ({
      anchors: visibleAnchors,
      trackingHealthy: trackingState === 3,
      routeChevrons: arRoute.active && !arRoute.arrived ? arRoute.chevrons : [],
      onGeospatialStatus: nativeAnchors.handleGeospatialStatus,
      onGeospatialPose: geospatial.handlePose,
      onNavigatorReady: handleNavigatorReady,
      onSelectAnchor: handleTapByReticle,
      onPlaneTapped: handlePlaneTapped,
      onCameraUpdate: handleCameraUpdate,
      onTrackingUpdate: handleTrackingUpdate,
      onRegisterSceneRef: handleRegisterSceneRef,
      onPlanesUpdated: handlePlanesUpdated,
    }),
    [
      visibleAnchors,
      trackingState,
      arRoute.active,
      arRoute.arrived,
      arRoute.chevrons,
      nativeAnchors.handleGeospatialStatus,
      handleNavigatorReady,
      geospatial.handlePose,
      handleTapByReticle,
      handlePlaneTapped,
      handleCameraUpdate,
      handleTrackingUpdate,
      handleRegisterSceneRef,
      handlePlanesUpdated,
    ],
  );

  const originLabel = geospatial.isFresh
    ? `VPS ±${Math.round(geospatial.pose?.horizontalAccuracy ?? 0)}m`
    : `GPS ±${Math.round(geo.userCoords.accuracy)}m`;

  return (
    <View style={styles.rootContainer}>
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

      {zoomLevel > 1.05 ? (
        <View
          style={[
            styles.zoomBadge,
            {
              top: Math.max(insets.top + 98, 138),
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="search" size={12} color="#FFFFFF" />
          <Text style={styles.zoomBadgeText}>
            Zoom: {zoomLevel.toFixed(1)}x
          </Text>
        </View>
      ) : null}

      <ARReticle zoomLevel={zoomLevel} />

      <ARZoomSelector
        zoomLevel={zoomLevel}
        onZoomChange={(level) => applyZoom(level, true)}
      />

      {/* Refresh REAL: refetch + re-enfileira âncoras falhas + limpa projeções
          congeladas + recalibração EXPLÍCITA do Δ (única forma de re-alinhar). */}
      <ARStatusHud
        cloudStatus={cloudStatus}
        trackingState={trackingState}
        isFetching={anchorsQuery.isFetching}
        calibratedLabel={null}
        gpsAccuracyMeters={geo.userCoords.accuracy}
        vpsAccuracyMeters={
          geospatial.isFresh ? (geospatial.pose?.horizontalAccuracy ?? null) : null
        }
        onOpenCalibration={() => {}}
        onRefresh={handleRefresh}
      />

      <ARCompassRadiusBar
        heading={geo.userTrueHeading}
        radiusFilter={radiusFilter}
        onRadiusChange={setRadiusFilter}
      />

      {isAdmin ? (
        <View
          style={[
            styles.bottomBar,
            { bottom: Math.max(insets.bottom + 16, 28) },
          ]}
          pointerEvents="box-none"
        >
          {/* Indicador de superfície: o hit-test precisa de plano/feature
              detectado — sem isto, "Marcar Ponto" abre sem hit (GPS-only). */}
          {planeCount === 0 ? (
            <View style={styles.planeHint}>
              <Text style={styles.planeHintText}>
                Aponte para o chão para detectar superfícies…
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={handleOpenPlaceModal}
            activeOpacity={0.85}
            disabled={planeCount === 0}
            style={[
              styles.placeAnchorButton,
              planeCount === 0 ? styles.placeAnchorButtonDisabled : {},
              {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              },
            ]}
          >
            <Ionicons name="location-outline" size={18} color="#FFFFFF" />
            <Text style={styles.placeAnchorButtonText}>
              {planeCount === 0 ? "Aguardando superfície…" : "Marcar Ponto no Espaço"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Bottom sheet de detalhes do ponto AR */}
      <AnchorDetailSheet
        visible={detailSheetVisible}
        anchor={detailAnchor}
        distanceMeters={detailAnchor?.distanceMeters ?? undefined}
        onClose={() => setDetailSheetVisible(false)}
        onNavigate={(anchor) => {
          setDetailSheetVisible(false);
          void startNavigation(anchor);
        }}
        onDelete={
          isAdmin
            ? (anchor) => {
                setDetailSheetVisible(false);
                Alert.alert(
                  "Excluir ponto",
                  `Confirmar exclusão de "${anchor.name}"?`,
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Excluir",
                      style: "destructive",
                      onPress: () => {
                        void (async () => {
                          try {
                            setIsSaving(true);
                            await deleteAnchorMutation.mutateAsync(anchor.id);
                            nativeAnchors.removeLocal(anchor.id);
                            cloudAnchors.removeLocal(anchor.id);
                          } catch {
                            Alert.alert("Erro", "Não foi possível excluir o ponto.");
                          } finally {
                            setIsSaving(false);
                          }
                        })();
                      },
                    },
                  ],
                );
              }
            : undefined
        }
      />

      {/* HUD de Navegação AR */}
      {arRoute.arrived ? (
        <View
          style={[styles.navHud, { top: Math.max(insets.top + 148, 188) }]}
          pointerEvents="none"
        >
          <View style={[styles.navHudPill, styles.arrivedPill]}>
            <Ionicons name="flag" size={16} color="#34D399" />
            <Text style={styles.navHudText}>Você chegou 🎉</Text>
          </View>
        </View>
      ) : arRoute.active ? (
        <View
          style={[styles.navHud, { top: Math.max(insets.top + 148, 188) }]}
          pointerEvents="box-none"
        >
          <View style={styles.navHudStack}>
            <View style={styles.navHudPill}>
              <Ionicons
                name={arRoute.isRerouting ? "refresh" : "navigate"}
                size={16}
                color={arRoute.isRerouting ? "#FCD34D" : "#34D399"}
              />
              <Text style={styles.navHudText}>
                {arRoute.isRerouting
                  ? "Recalculando..."
                  : `${arRoute.targetName} · ${arRoute.distanceRemaining} m`}
              </Text>
              <TouchableOpacity
                onPress={stopNavigation}
                style={styles.navHudStopBtn}
                accessibilityRole="button"
                accessibilityLabel="Encerrar navegação"
              >
                <Ionicons name="close-circle" size={20} color="#FDA4AF" />
              </TouchableOpacity>
            </View>
            <NavInstructionHud
              instruction={arRoute.instruction}
              metersToTurn={arRoute.metersToTurn}
              headingToPathDeg={arRoute.headingToPathDeg}
              userHeadingDeg={geo.userTrueHeading}
            />
          </View>
        </View>
      ) : arRoute.isLoading ? (
        <View
          style={[styles.navHud, { top: Math.max(insets.top + 148, 188) }]}
          pointerEvents="none"
        >
          <View style={styles.navHudPill}>
            <ActivityIndicator size="small" color="#34D399" />
            <Text style={styles.navHudText}>Calculando rota...</Text>
          </View>
        </View>
      ) : arRoute.error ? (
        <View
          style={[styles.navHud, { top: Math.max(insets.top + 148, 188) }]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.navHudPill,
              { backgroundColor: "rgba(69, 26, 3, 0.92)", borderColor: "#B45309" },
            ]}
          >
            <Ionicons name="warning" size={16} color="#FDBA74" />
            <Text style={[styles.navHudText, { color: "#FED7AA" }]}>
              {arRoute.error}
            </Text>
          </View>
        </View>
      ) : null}

      <PlaceAnchorModal
        visible={modalVisible}
        isSaving={isSaving}
        originLabel={originLabel}
        heading={geo.userTrueHeading}
        accuracyMeters={
          geospatial.isFresh ? (geospatial.pose?.horizontalAccuracy ?? null) : null
        }
        maxAccuracyMeters={CREATE_MAX_ACCURACY_M}
        pendingDistance={pendingDistance}
        onAdjustDistance={handleAdjustDistance}
        onSetDistance={handleSetDistance}
        minDistanceMeters={MIN_PLACE_DISTANCE_M}
        maxDistanceMeters={MAX_PLACE_DISTANCE_M}
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
    backgroundColor: "#000000",
  },
  arViewportClip: {
    flex: 1,
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  arZoomWrapper: {
    flex: 1,
  },
  arNavigator: {
    flex: 1,
  },
  zoomBadge: {
    position: "absolute",
    top: 138,
    alignSelf: "center",
    backgroundColor: "rgba(37, 99, 235, 0.92)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.6)",
    zIndex: 20,
    elevation: 32,
  },
  zoomBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  bottomBar: {
    position: "absolute",
    bottom: 28,
    left: 20,
    right: 20,
    zIndex: 20,
    elevation: 20,
  },
  placeAnchorButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#60A5FA",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  placeAnchorButtonDisabled: {
    backgroundColor: "#1E3A5F",
    borderColor: "#475569",
    shadowOpacity: 0,
    elevation: 0,
  },
  planeHint: {
    backgroundColor: "rgba(69, 26, 3, 0.85)",
    borderWidth: 1,
    borderColor: "#B45309",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: "center",
  },
  planeHintText: {
    color: "#FED7AA",
    fontSize: 12,
    fontWeight: "600",
  },
  placeAnchorButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  navHud: {
    position: "absolute",
    top: 188,
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 30,
    elevation: 30,
  },
  navHudStack: {
    alignItems: "center",
    gap: 8,
  },
  arrivedPill: {
    backgroundColor: "rgba(6, 78, 59, 0.95)",
    borderColor: "#34D399",
  },
  navHudPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(6, 78, 59, 0.9)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#059669",
  },
  navHudText: {
    color: "#D1FAE5",
    fontSize: 14,
    fontWeight: "700",
  },
  navHudStopBtn: {
    marginLeft: 4,
  },
});

export default ViroARAnchorContainer;
