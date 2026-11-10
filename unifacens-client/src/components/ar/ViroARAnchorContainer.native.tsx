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
import { type Anchor, isUsablePoint } from "shared";
import {
  useAnchorsQuery,
  useCreateAnchorMutation,
  useDeleteAnchorMutation,
  anchorKeys,
} from "@/features/anchors/queries/use-anchors-query";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ViroARAnchorScene } from "./ViroARAnchorScene";
import { useARGeolocation } from "./hooks/use-ar-geolocation";
import { useARProjection } from "./hooks/use-ar-projection";
import { useGeospatialPose, isPoseFresh } from "./hooks/use-geospatial-pose";
import { useNativeAnchors } from "./hooks/use-native-anchors";
import { useCloudAnchors } from "./hooks/use-cloud-anchors";
import { usePointHosting } from "./hooks/use-point-hosting";
import { useARWorldAlignment } from "./hooks/use-ar-world-alignment";
import { useARZoom } from "./hooks/use-ar-zoom";
import { ARStatusHud } from "./hud/ar-status-hud";
import { ARCompassRadiusBar } from "./hud/ar-compass-radius-bar";
import { ARZoomSelector } from "./hud/ar-zoom-selector";
import { ARReticle } from "./hud/ar-reticle";
import { NavInstructionHud } from "./hud/nav-instruction-hud";
import { PlaceAnchorModal, PlaceAnchorPill } from "./modals/place-anchor-modal";
import { AnchorListModal } from "./modals/anchor-list-modal";
import { AnchorDetailSheet } from "./modals/anchor-detail-sheet";
import { useARNavigation } from "@/features/ar/hooks/use-ar-navigation";

// Constante estática da cena inicial para nunca recriar a instância nativa do ViroARSceneNavigator
const INITIAL_AR_SCENE = { scene: ViroARAnchorScene as any };

/** Acurácia máxima da pose para CRIAR âncoras nativas (economia de quota). */
const NATIVE_ANCHOR_MAX_POSE_ACCURACY_M = 20;

/** Facade mínima do ref da cena Viro utilizada para hit-tests. */
interface ViroSceneHitTestRef {
  performARHitTestWithPoint?: (x: number, y: number) => Promise<unknown>;
}

export const ViroARAnchorContainer: FC<{ focused?: boolean }> = ({ focused = true }) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  void screenWidth; void screenHeight; // dims ainda reservadas p/ layouts futuros
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
    focused,
    trackingHealthy: trackingState >= 2,
  });

  // ── Âncoras de NUVEM VISUAIS — precisão centimétrica perto do pin ────────
  const cloudAnchors = useCloudAnchors({
    serverAnchors: anchorsQuery.data,
    trackingState,
    focused,
  });

  // ── Hosting por PONTO (guia oficial Cloud Anchors, lição definitiva
  //    2026-11-10: dados da plataforma — finishScan: GPS null + 5% resolve;
  //    hostCloudAnchor: GPS ✓ + 54%). Tap na retícula → hit-test pontual →
  //    createAnchoredNode NO PONTO → guia 8s → hostCloudAnchor(30d). ──────
  const pointHosting = usePointHosting({
    focused,
    trackingActive: trackingState >= 2,
    screenWidth,
    screenHeight,
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
    // Pins cloud pendentes NUNCA caem no fallback GPS (E5 — estado honesto).
    noFallbackIds: cloudAnchors.pendingIds,
  });

  // ── Navegação ────────────────────────────────────────────────────────────
  const [detailSheetVisible, setDetailSheetVisible] = useState(false);
  /** Lista de pontos carregados ("Ir para" — rota AR). */
  const [listVisible, setListVisible] = useState(false);
  const [detailAnchor, setDetailAnchor] = useState<Anchor | null>(null);
  const {
    route: arRoute,
    startNavigation,
    stopNavigation,
    updateProgress,
  } = useARNavigation({
    geoPoseRef: geospatial.poseRef,
    cameraPosRef,
    nativeEntries: mergedNativeEntries,
  });

  // ── Estado de UI local ────────────────────────────────────────────────────
  const [radiusFilter, setRadiusFilter] = useState<number>(0);
  const [planeCount, setPlaneCount] = useState<number>(0);

  // ── Background hit-test: REMOVIDO (lição de device 2026-11-10, RedBox
  // "performARHitTest on a null ViroViewARCore" + SIGSEGVs 15:13/15:20) ──
  // O interval de 800ms mantinha um hit-test em flight quase permanente;
  // ao trocar de tab, o detach NATIVO antecede o blur JS e o UIBlock da
  // chamada executava com a view destruída (NPE/SIGSEGV). Era redundância:
  // a retícula reflete o TRACKING (sem chamada nativa).
  const [modalVisible, setModalVisible] = useState(false);
  const [anchorName, setAnchorName] = useState("");
  const [anchorDescription, setAnchorDescription] = useState("");

  // ── Status do HUD (pipeline oficial: scan → hosted; resolve → progresso
  //    real; pendentes = estado honesto "aproxime-se") ──────────────────────
  const cloudStatusDerived = useMemo(() => {
    if (anchorsQuery.isPending) return "Carregando pontos...";
    if (anchorsQuery.isError) return "Erro de conexão";
    const total = anchorsQuery.data?.length ?? 0;
    if (total === 0) return "0 ponto(s)";
    // Hosting por ponto em curso: fases do fluxo (tap → guia → hosting).
    if (pointHosting.state.phase === 'placing') return "Mire e toque para posicionar";
    if (pointHosting.state.phase === 'guiding') return "Mova ao redor do ponto…";
    if (pointHosting.state.phase === 'hosting') return "Hospedando âncora…";
    // Resolve em curso: progresso/mensagem oficiais (getCloudAnchorStatus).
    // A MESSAGE é o guia (doc VPS): "waiting on a second match" = continuar
    // olhando o ponto. Após 25s, dica escalonada (física da relocalização:
    // "olhar" = o CELULAR ver o ambiente p/ se localizar, não o pin depender
    // do olhar).
    if (cloudAnchors.resolveHud?.active) {
      const pct = Math.round((cloudAnchors.resolveHud.progress ?? 0) * 100);
      const raw = cloudAnchors.resolveHud.message ?? '';
      const elapsed = Date.now() - (cloudAnchors.resolveHud.startedAt ?? Date.now());
      const hint =
        elapsed > 25_000
          ? 'aponte a câmera para onde escaneou'
          : raw.includes('second match')
            ? 'olhe o ponto'
            : raw.includes('downloading')
              ? 'baixando mapa'
              : raw.includes('searching')
                ? 'procurando'
                : raw
                  ? raw.slice(0, 26)
                  : '';
      return `Localizando âncora ${pct > 0 ? `${pct}%` : '…'}${hint ? ` — ${hint}` : ''}`;
    }
    // Pendentes (não localizados): estado honesto — NUNCA fallback GPS.
    if (cloudAnchors.pendingIds.size > 0) {
      return cloudAnchors.entries.size > 0
        ? `${cloudAnchors.entries.size} ponto(s) · ${cloudAnchors.pendingIds.size} p/ aproximar`
        : `${cloudAnchors.pendingIds.size} âncora(s) — aproxime-se do ponto`;
    }
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
    cloudAnchors.entries,
    cloudAnchors.resolveHud,
    cloudAnchors.pendingIds,
    pointHosting.state,
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

  // Tap da retícula ROTEADO: durante o posicionamento ('placing') o toque
  // POSICIONA a âncora do pin (consume o tap); fora disso, abre o detalhe.
  const handleRoutedTap = useCallback(() => {
    if (pointHosting.state.phase === 'placing') {
      void pointHosting.handleTap();
      return;
    }
    handleTapByReticle();
  }, [pointHosting, handleTapByReticle]);

  const { zoomLevel, applyZoom, pinchGesture, arZoomAnimatedStyle } = useARZoom(
    { onTap: handleRoutedTap },
  );

  // ── "Marcar Ponto" — âncora NO PONTO tocado ──────────────────────────────
  const handleOpenPlaceModal = useCallback(() => {
    pointHosting.cancel();
    setModalVisible(true);
    console.log("[ARHost] modal de criação aberto — etapa POSICIONAR");
  }, [pointHosting]);

  // ── Refresh REAL: refetch + retry de falhas + re-projeção + recalibra Δ ──
  const handleNavigatorReady = useCallback(
    (nav: any) => {
      nativeAnchors.handleNavigatorReady(nav);
      cloudAnchors.handleNavigatorReady(nav);
      pointHosting.handleNavigatorReady(nav);
    },
    [nativeAnchors, cloudAnchors, pointHosting],
  );

  const handleRegisterSceneRef = useCallback(
    (scene: any) => {
      arSceneRef.current = scene;
      pointHosting.handleSceneReady(scene);
    },
    [pointHosting],
  );

  // ── Refresh REAL: refetch + retry de falhas + re-projeção + recalibra Δ ──
  const handleRefresh = useCallback(() => {
    void anchorsQuery.refetch();
    projection.clearFrozen();
    nativeAnchors.retryFailed();
    cloudAnchors.retryFailed();
    alignment.realign();
    setReprojectNonce((n) => n + 1);
  }, [anchorsQuery, projection, nativeAnchors, cloudAnchors, alignment]);

  // ── handleCreate: grava o pin com a âncora do SCAN oficial (offset ZERO
  //    por construção — sem mira, sem gates de GPS; lat/lng best-effort só
  //    para mapa 2D/proximity, o resolve visual é a fonte de verdade). ────
  const handleCreate = async () => {
    if (pointHosting.state.phase !== 'hosted') {
      Alert.alert("Aviso", "Posicione e hospede a âncora antes de salvar.");
      return;
    }
    if (!anchorName.trim()) {
      Alert.alert("Aviso", "Informe o nome do ponto.");
      return;
    }

    try {
      setIsSaving(true);
      setMutationStatus("Gravando ponto...");

      // lat/lng best-effort (pose média → pose crua → GPS do expo).
      const pose = geospatial.poseRef.current;
      const avgPose = pose ? (geospatial.averagedPose() ?? pose) : null;
      const targetLat = avgPose
        ? Number(avgPose.latitude.toFixed(7))
        : Number(geo.userCoords.latitude.toFixed(7));
      const targetLon = avgPose
        ? Number(avgPose.longitude.toFixed(7))
        : Number(geo.userCoords.longitude.toFixed(7));
      const targetAlt = avgPose
        ? Number(avgPose.altitude.toFixed(2))
        : Number((geo.userCoords.altitude ?? 0).toFixed(2));


      // cloudAnchorId REAL do hosting por PONTO (hostCloudAnchor) + provisória
      // EXATA: a posição do PONTO tocado (hit) — o pin nasce onde o usuário
      // tocou, não onde a câmera estava.
      const hosted = pointHosting.state as {
        phase: 'hosted';
        cloudAnchorId: string;
        position: [number, number, number];
      };
      const saved = await createAnchorMutation.mutateAsync({
        name: anchorName.trim(),
        cloudAnchorId: hosted.cloudAnchorId,
        description: anchorDescription.trim() || undefined,
        latitude: targetLat,
        longitude: targetLon,
        altitude: Number(targetAlt.toFixed(2)),
        heading: avgPose ? Number(avgPose.heading.toFixed(1)) : 0,
      });

      queryClient.setQueryData<Anchor[]>(anchorKeys.lists(), (old) =>
        old ? [saved, ...old] : [saved],
      );

      cloudAnchors.setProvisionalEntry({
        pinId: saved.id,
        nativeAnchorId: hosted.cloudAnchorId,
        position: hosted.position,
      });
      console.log(
        `[ARHost] pin "${saved.name}" visível AGORA NO PONTO — pos=[${hosted.position.map((v) => v.toFixed(2)).join(', ')}]`,
      );

      setMutationStatus(null);
      setAnchorName("");
      setAnchorDescription("");
      setModalVisible(false);
      pointHosting.cancel();

      // O loop de resolve confirma na mesma sessão (features em memória) e
      // substitui a provisória pela posição definitiva (transição suave).
      Alert.alert(
        "✓ Ponto Salvo",
        `"${saved.name}" foi salvo com ancoragem visual NO ponto (precisão centimétrica).\n\nAo voltar a este local apontando a câmera para o ponto, ele aparecerá na posição exata.`,
      );
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
      // false no INSTANTE do blur (antes do keep-alive de unmount): a cena
      // congela o poll geospatial — UIBlock interop residual executa com a
      // cena viva (anti-SIGSEGV, §12.12).
      focused,
      /** Tracking ≥ 2 (sessão viva) — gates de chamada nativa (§12.12). */
      trackingActive: trackingState >= 2,
      routeChevrons: arRoute.active && !arRoute.arrived ? arRoute.chevrons : [],
      onGeospatialStatus: nativeAnchors.handleGeospatialStatus,
      onGeospatialPose: geospatial.handlePose,
      onNavigatorReady: handleNavigatorReady,
      onSelectAnchor: handleTapByReticle,
      onCameraUpdate: handleCameraUpdate,
      onTrackingUpdate: handleTrackingUpdate,
      onRegisterSceneRef: handleRegisterSceneRef,
      onPlanesUpdated: handlePlanesUpdated,
    }),
    [
      visibleAnchors,
      trackingState,
      focused,
      arRoute.active,
      arRoute.arrived,
      arRoute.chevrons,
      nativeAnchors.handleGeospatialStatus,
      handleNavigatorReady,
      geospatial.handlePose,
      handleTapByReticle,
      handleCameraUpdate,
      handleTrackingUpdate,
      handleRegisterSceneRef,
      handlePlanesUpdated,
    ],
  );

  // ── Pílula das fases ativas (FORA do Modal — lição 2026-11-10: janela
  //    modal do Android engole toques; a pílula precisa deixar o tap
  //    atravessar até a câmera) + progresso da guia 8s ────────────────────
  const hostingPhaseActive =
    pointHosting.state.phase === 'placing' ||
    pointHosting.state.phase === 'guiding' ||
    pointHosting.state.phase === 'hosting';
  const [guideProgress, setGuideProgress] = useState(0);
  useEffect(() => {
    if (pointHosting.state.phase !== 'guiding') {
      setGuideProgress(0);
      return;
    }
    const startedAt = pointHosting.state.startedAt;
    const timer = setInterval(() => {
      setGuideProgress(Math.min(1, (Date.now() - startedAt) / 10000));
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointHosting.state.phase, pointHosting.state.phase === 'guiding' ? pointHosting.state.startedAt : 0]);

  return (
    <View style={styles.rootContainer}>
      <GestureDetector gesture={pinchGesture}>
        <View style={styles.arViewportClip}>
          <Animated.View style={[styles.arZoomWrapper, arZoomAnimatedStyle]}>
            <ViroARSceneNavigator
              ref={navigatorRef}
              // A/B de providers (épica precisão, 2026-11-10): o provider é
              // ÚNICO e troca Cloud + Geospatial JUNTOS (§15.1 AGENTS.MD).
              // "arcore" (default) ⇄ "reactvision" via EXPO_PUBLIC_AR_PROVIDER
              // no .env + Metro --clear — credenciais dos DOIS já no manifesto.
              provider={process.env.EXPO_PUBLIC_AR_PROVIDER === 'reactvision' ? 'reactvision' : 'arcore'}
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

      <ARReticle zoomLevel={zoomLevel} trackingState={trackingState} />

      <ARZoomSelector
        zoomLevel={zoomLevel}
        onZoomChange={(level) => applyZoom(level, true)}
      />

      {/* Botão Lista de Pontos — abre o modal com "Ir para" (rota AR). */}
      <TouchableOpacity
        onPress={() => setListVisible(true)}
        activeOpacity={0.8}
        style={[styles.listBtn, { top: Math.max(insets.top + 108, 148) }]}
        accessibilityRole="button"
        accessibilityLabel="Listar pontos carregados">
        <Ionicons name="list" size={20} color="#67E8F9" />
        {projection.anchors.length > 0 ? (
          <View style={styles.listBtnBadge}>
            <Text style={styles.listBtnBadgeText}>{projection.anchors.length}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

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
        visible={modalVisible && !hostingPhaseActive}
        isSaving={isSaving}
        hosting={pointHosting.state}
        onRetry={pointHosting.begin}
        anchorName={anchorName}
        onAnchorNameChange={setAnchorName}
        anchorDescription={anchorDescription}
        onAnchorDescriptionChange={setAnchorDescription}
        onCreate={handleCreate}
        onClose={() => {
          setModalVisible(false);
          pointHosting.cancel();
        }}
      />

      {/* Lista de pontos carregados + "Ir para" (rota AR Live View). */}
      <AnchorListModal
        visible={listVisible}
        anchors={projection.anchors}
        onClose={() => setListVisible(false)}
        onNavigate={(anchor) => {
          void startNavigation(anchor);
        }}
      />

      {/* Pílula das fases ativas — overlay DENTRO da árvore (não Modal):
          toques atravessam até a câmera; insets reais do container. */}
      {modalVisible && hostingPhaseActive ? (
        <View
          style={[styles.hostingPillWrapper, { top: insets.top + 58 }]}
          pointerEvents="box-none">
          <PlaceAnchorPill
            hosting={pointHosting.state}
            guideProgress={guideProgress}
            onClose={() => {
              setModalVisible(false);
              pointHosting.cancel();
            }}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  /** Botão flutuante "Lista de Pontos" — canto direito, abaixo do HUD. */
  listBtn: {
    position: 'absolute',
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: '#164E63',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 30,
  },
  listBtnBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0891B2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  listBtnBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  /** Wrapper da pílula de hosting — deixa toques passarem (box-none no JSX). */
  hostingPillWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 60,
    elevation: 60,
  },
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
  // ══ MODO PREVIEW: REMOVIDO (lição 2026-11-10 — o fluxo oficial de scan não
  //    usa mira/preview; styles órfãos limpos na Fase 4 do fix cloud) ═════
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
