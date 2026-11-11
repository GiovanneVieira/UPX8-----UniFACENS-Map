import React, { FC, useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { useCloudAnchors, isRealCloudAnchorId } from "./hooks/use-cloud-anchors";
import { usePointHosting } from "./hooks/use-point-hosting";
import { useARWorldAlignment } from "./hooks/use-ar-world-alignment";
import { useARZoom } from "./hooks/use-ar-zoom";
import { ARStatusHud, ARTrackingBanner } from "./hud/ar-status-hud";
import { ARCompassRadiusBar } from "./hud/ar-compass-radius-bar";
import { ARTopHudStack } from "./hud/ar-top-hud-stack";
import { ARZoomSelector } from "./hud/ar-zoom-selector";
import { ARReticle } from "./hud/ar-reticle";
import { NavInstructionHud } from "./hud/nav-instruction-hud";
import { PlaceAnchorModal, PlaceAnchorPill } from "./modals/place-anchor-modal";
import { AnchorListModal } from "./modals/anchor-list-modal";
import { ARAnchorToast, ANCHOR_TOAST_TTL_MS, type AnchorToastData } from "./hud/ar-anchor-toast";
import { ARDiagnosticsModal, type ARDiagnosticsContext } from "./modals/ar-diagnostics-modal";
import { AnchorDetailSheet } from "./modals/anchor-detail-sheet";
import { useARNavigation } from "@/features/ar/hooks/use-ar-navigation";
import { useCategoriesQuery } from "@/features/categories/queries/use-categories-query";

// Constante estática da cena inicial para nunca recriar a instância nativa do ViroARSceneNavigator
const INITIAL_AR_SCENE = { scene: ViroARAnchorScene as any };

/** Acurácia máxima da pose para CRIAR âncoras nativas (economia de quota). */
const NATIVE_ANCHOR_MAX_POSE_ACCURACY_M = 20;

/**
 * Background ≥10s → RESET COMPLETO da sessão AR ao voltar (Frente B,
 * 2026-11-11). O ARCore pode RE-BASAR a origem do mundo no resume (§12.8):
 * as cloud anchors resolvidas viram posições ESTÁTICAS de sessão e todas
 * deslocam de uma vez — re-resolve individual não devolve um mundo
 * coerente. O reset (remount do navigator + estado zerado) re-estabelece
 * tudo do zero; os ghosts (~15-20s) cobrem a janela. Voltas <10s seguem
 * no fluxo leve de invalidação por tracking.
 */
const SESSION_RESET_AFTER_BG_MS = 10_000;

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
  const categoriesQuery = useCategoriesQuery();
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
  /** Frente C: quando a degradação começou + cooldown da última invalidação. */
  const trackingDegradedSinceRef = useRef<number | null>(null);
  const lastInvalidateRef = useRef(0);
  const cloudInvalidateRef = useRef<(() => void) | null>(null);

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
    // Ordena candidatos por proximidade (pin perto = SIFT fecha antes).
    geoPoseRef: geospatial.poseRef,
  });
  // Frente C: handleTrackingUpdate (useCallback []) lê via ref.
  cloudInvalidateRef.current = cloudAnchors.invalidateEntries;

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
    // Pins cloud pendentes: invisíveis na cortesia, estimativa ghost depois
    // (isGhost — não selecionável; resolve substitui com transição suave).
    pendingIds: cloudAnchors.pendingIds,
    ghostIds: cloudAnchors.ghostIds,
  });

  // ── Navegação ────────────────────────────────────────────────────────────
  const [detailSheetVisible, setDetailSheetVisible] = useState(false);
  /** Lista de pontos carregados ("Ir para" — rota AR). */
  const [listVisible, setListVisible] = useState(false);
  /** Toast de ponto encontrado (cloud resolve / primeiro projetado). */
  const [anchorToast, setAnchorToast] = useState<AnchorToastData | null>(null);

  /** Fechamento do toast — ESTÁVEL (lição 2026-11-11: arrow inline nas deps
   *  do efeito do toast reiniciava o timer a cada render de 1Hz da projeção
   *  → o toast nunca expirava sozinho). */
  const dismissAnchorToast = useCallback(() => setAnchorToast(null), []);

  // Dispara toast quando cloud anchors RESOLVEM: diff dos ids de entries
  // (antes: find() no array — anunciava o primeiro pin com entry, não o que
  // acabou de resolver). Múltiplos no mesmo tick → o mais próximo da câmera.
  const prevResolvedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const entries = cloudAnchors.entries;
    const newIds: string[] = [];
    for (const id of entries.keys()) {
      if (!prevResolvedIdsRef.current.has(id)) newIds.push(id);
    }
    prevResolvedIdsRef.current = new Set(entries.keys());
    if (newIds.length === 0) return;

    const cam = cameraPosRef.current;
    const candidates = (anchorsQuery.data ?? []).filter((a) => newIds.includes(a.id));
    if (candidates.length === 0) return;

    let best = candidates[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const pin of candidates) {
      const entry = entries.get(pin.id);
      if (!entry) continue;
      const dist = Math.hypot(
        entry.position[0] - cam[0],
        entry.position[1] - cam[1],
        entry.position[2] - cam[2],
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = pin;
      }
    }

    setAnchorToast({
      name: best.name,
      distanceM: Number.isFinite(bestDist) ? Number(bestDist.toFixed(0)) : undefined,
      isCloud: isRealCloudAnchorId(best.cloudAnchorId),
      expiresAt: Date.now() + ANCHOR_TOAST_TTL_MS,
    });
  }, [cloudAnchors.entries, anchorsQuery.data]);
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
  /**
   * Altura do bloco PERSISTENTE da pilha (status + filtros — sempre
   * presentes), medida via onLayout: âncora ESTÁVEL para os flutuantes
   * (badge de zoom, botão lista). ⚠️ Lição de device 2026-11-11: ancorar
   * na altura TOTAL da pilha fazia os flutuantes pularem a cada estado
   * efêmero (toast de 3.5s, banner de tracking, navegação, fetch).
   */
  const [stableHudHeight, setStableHudHeight] = useState(180);
  /** Modal de diagnóstico do mapeamento (pill de status clicável). */
  const [diagVisible, setDiagVisible] = useState(false);
  /** Key do navigator — bump = remount completo (reset de sessão AR). */
  const [arSessionKey, setArSessionKey] = useState(0);

  // ── Background hit-test: REMOVIDO (lição de device 2026-11-10, RedBox
  // "performARHitTest on a null ViroViewARCore" + SIGSEGVs 15:13/15:20) ──
  // O interval de 800ms mantinha um hit-test em flight quase permanente;
  // ao trocar de tab, o detach NATIVO antecede o blur JS e o UIBlock da
  // chamada executava com a view destruída (NPE/SIGSEGV). Era redundância:
  // a retícula reflete o TRACKING (sem chamada nativa).
  const [modalVisible, setModalVisible] = useState(false);
  const [anchorName, setAnchorName] = useState("");
  const [anchorDescription, setAnchorDescription] = useState("");
  const [anchorCategoryId, setAnchorCategoryId] = useState<string | null>(null);

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
    // Ghosts (pendentes ≥ cortesia, não localizados): estimativa honesta —
    // projetados com selo ±Xm; o resolve substitui com transição suave.
    if (cloudAnchors.ghostIds.size > 0) {
      return cloudAnchors.entries.size > 0
        ? `${cloudAnchors.entries.size} ponto(s) · ${cloudAnchors.ghostIds.size} aproximado(s) — aponte a câmera`
        : `${cloudAnchors.ghostIds.size} ponto(s) aproximado(s) — aponte a câmera`;
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
    cloudAnchors.ghostIds,
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
      trackingDegradedSinceRef.current = Date.now();
    } else if (state === 3 && trackingStateRef.current !== 3) {
      console.log("[ARTrack] tracking estável (3) — mundo rígido novamente");
      // Frente C: degradação REAL (≥5s — oscilação rápida de remount é
      // ruído, §12.12) + cooldown → o ARCore pode ter RE-BASADO a origem
      // do mundo (background/resume, §12.8): re-resolve as cloud anchors
      // no frame atual; a projeção desliza (jamais salta).
      const degradedAt = trackingDegradedSinceRef.current;
      const now = Date.now();
      if (
        degradedAt !== null &&
        now - degradedAt >= 5_000 &&
        now - lastInvalidateRef.current >= 30_000 &&
        cloudInvalidateRef.current
      ) {
        lastInvalidateRef.current = now;
        cloudInvalidateRef.current();
      }
      trackingDegradedSinceRef.current = null;
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
      // Ghost = estimativa não confirmada — selecionar abriria detalhe
      // enganoso; o resolve o tornará selecionável ao cravar.
      if (!a.arPosition || a.isGhost) continue;
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

  // ── Refresh REAL: invalida cache + cancela pendentes + retry + recalibra ──
  const handleRefresh = useCallback(async () => {
    // Feedback imediato
    setMutationStatus('Atualizando…');

    // 1. Cancela resolves pendentes (SDK: ErrorCancelled — limpa o nativo)
    try {
      navigatorRef.current?.cancelCloudAnchorOperations?.();
    } catch {
      // best-effort
    }

    // 2. Zera backoff de retry (tudo elegível imediatamente)
    cloudAnchors.retryFailed();
    nativeAnchors.retryFailed();

    // 3. Invalida cache do TanStack (força refetch do servidor)
    await queryClient.invalidateQueries({ queryKey: anchorKeys.lists() });

    // 4. Recalibra Δ + re-projeta estimativas
    projection.clearFrozen();
    alignment.realign();
    setReprojectNonce((n) => n + 1);

    setMutationStatus(null);
    console.log('[AR Refresh] invalidado + retry zerado + Δ recalibrado');
  }, [queryClient, projection, nativeAnchors, cloudAnchors, alignment]);

  // ── RESET DE SESSÃO AR pós-background longo (Frente B, 2026-11-11) ──────
  // Callbacks estáveis (useCallback nos hooks) — o reset não recria por render.
  const cloudInvalidate = cloudAnchors.invalidateEntries;
  const nativeResetAll = nativeAnchors.resetAll;
  const cloudDiagnosticsSnapshot = cloudAnchors.diagnosticsSnapshot;
  const pointHostingCancel = pointHosting.cancel;
  const alignmentRealign = alignment.realign;
  const projectionClearFrozen = projection.clearFrozen;

  const resetARSession = useCallback(() => {
    console.log('[ARSession] RESET — background longo: mundo pode ter re-basado; recomeçando do zero');
    // Cancela ops do provider ANTES de destruir a view (best-effort).
    try {
      navigatorRef.current?.cancelCloudAnchorOperations?.();
    } catch {
      // best-effort
    }
    // Estado de sessão zerado: entries/provisórias/pendências (cloud),
    // âncoras nativas, hosting em curso, Δ (recalibra no mundo novo),
    // estimativas congeladas.
    cloudInvalidate();
    nativeResetAll();
    pointHostingCancel();
    alignmentRealign();
    projectionClearFrozen();
    setReprojectNonce((n) => n + 1);
    // Remount do navigator POR ÚLTIMO: a view antiga (com as âncoras
    // nativas dela) é destruída e a nova nasce limpa — mundo coerente do
    // zero; ghosts re-nascem (~15-20s) e os resolves re-estabelecem.
    setArSessionKey((k) => k + 1);
  }, [
    cloudInvalidate,
    nativeResetAll,
    pointHostingCancel,
    alignmentRealign,
    projectionClearFrozen,
  ]);

  const backgroundAtRef = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // ?? mantém a 1ª marca (inactive transitório do iOS não conta).
        backgroundAtRef.current ??= Date.now();
      } else if (state === 'active' && backgroundAtRef.current !== null) {
        const awayFor = Date.now() - backgroundAtRef.current;
        backgroundAtRef.current = null;
        if (awayFor >= SESSION_RESET_AFTER_BG_MS) {
          resetARSession();
        } else {
          console.log(`[ARSession] background curto (${(awayFor / 1000).toFixed(1)}s) — sem reset`);
        }
      }
    });
    return () => sub.remove();
  }, [resetARSession]);

  // ── Getters do modal de diagnóstico (Frente D) — PULL sob demanda ──────
  const getDiagnosticsSnapshot = useCallback(
    () => cloudDiagnosticsSnapshot(anchorsQuery.data ?? []),
    [cloudDiagnosticsSnapshot, anchorsQuery.data],
  );

  const getDiagnosticsContext = useCallback((): ARDiagnosticsContext => {
    const pose = geospatial.pose;
    const pinVisuals = new Map<
      string,
      { distanceM?: number; estimated?: boolean; estimateAccuracyM?: number; isGhost?: boolean }
    >();
    for (const a of projection.anchors) {
      pinVisuals.set(a.id, {
        distanceM: a.distanceMeters,
        estimated: a.estimated,
        estimateAccuracyM: a.estimateAccuracyM,
        isGhost: a.isGhost,
      });
    }
    return {
      trackingState,
      deltaStatus: alignment.status,
      deltaValue: alignment.delta,
      provider:
        process.env.EXPO_PUBLIC_AR_PROVIDER === 'reactvision' ? 'reactvision' : 'arcore',
      poseAccM: pose?.horizontalAccuracy ?? null,
      poseFresh: geospatial.isFresh,
      totalPins: anchorsQuery.data?.length ?? 0,
      pinVisuals,
    };
  }, [
    trackingState,
    alignment.status,
    alignment.delta,
    geospatial.pose,
    geospatial.isFresh,
    projection.anchors,
    anchorsQuery.data,
  ]);

  // ── AUTO-REFRESH LEVE (Frente B, 2026-11-11): enquanto houver pins
  //    pendentes, a cada 30s re-tenta resolves esgotados + refetch do
  //    banco. SEM realign do Δ e SEM clearFrozen — esses ficam no refresh
  //    MANUAL (§11.5: recalibrar Δ sozinho giraria o mundo). Quota ARCore:
  //    resolve 300/min por projeto — folga. Para sozinho quando nada está
  //    pendente. */
  const pendingCount = cloudAnchors.pendingIds.size;
  const cloudRetryFailed = cloudAnchors.retryFailed;
  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = setInterval(() => {
      if (!focused || trackingStateRef.current < 2) return;
      cloudRetryFailed();
      void queryClient.invalidateQueries({ queryKey: anchorKeys.lists() });
      console.log('[ARCloud] auto-refresh 30s — re-tentativas + refetch');
    }, 30_000);
    return () => clearInterval(timer);
  }, [pendingCount, focused, cloudRetryFailed, queryClient]);

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
        categoryId: anchorCategoryId ?? undefined,
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
      setAnchorCategoryId(null);
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
              // Reset de sessão (Frente B): key bump = remount completo do
              // nativo — mundo novo coerente pós-background longo.
              key={arSessionKey}
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

      {/* ══ PILHA DO TOPO (ARTopHudStack) — status → banner de tracking →
          pílula de hosting → filtros (carousel) → navegação → toast, em
          FLUXO vertical: quando um elemento aparece, tudo abaixo desce.
          Sobreposição impossível por construção (lição 2026-11-11: o banner
          de tracking renderizava ATRÁS da barra de filtros — absolute +
          números mágicos espalhados por 6 componentes). */}
      <ARTopHudStack>
        {/* Bloco PERSISTENTE (status + filtros) — altura estável medida por
            onLayout: os flutuantes ancoram AQUI e nunca pulam. */}
        <View
          style={styles.stableHudBlock}
          onLayout={(e) => setStableHudHeight(e.nativeEvent.layout.height)}>
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
            onOpenDiagnostics={() => setDiagVisible(true)}
          />

          <ARCompassRadiusBar
            heading={geo.userTrueHeading}
            radiusFilter={radiusFilter}
            onRadiusChange={setRadiusFilter}
          />
        </View>

        {/* Efêmeros abaixo — entram/saem SEM mover os flutuantes. */}
        <ARTrackingBanner trackingState={trackingState} />

        {/* Pílula das fases de hosting — linha própria na pilha (antes:
            absolute top insets+58 colidia com os filtros). Toques seguem
            atravessando (fora do Modal — lição 2026-11-10). */}
        {modalVisible && hostingPhaseActive ? (
          <PlaceAnchorPill
            hosting={pointHosting.state}
            guideProgress={guideProgress}
            onClose={() => {
              setModalVisible(false);
              pointHosting.cancel();
            }}
          />
        ) : null}

        {/* HUD de Navegação AR — linhas da pilha (sem absolute/zIndex). */}
        {arRoute.arrived ? (
          <View style={styles.navHud} pointerEvents="none">
            <View style={[styles.navHudPill, styles.arrivedPill]}>
              <Ionicons name="flag" size={16} color="#34D399" />
              <Text style={styles.navHudText}>Você chegou 🎉</Text>
            </View>
          </View>
        ) : arRoute.active ? (
          <View style={styles.navHud} pointerEvents="box-none">
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
                  accessibilityLabel="Encerrar navegação">
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
          <View style={styles.navHud} pointerEvents="none">
            <View style={styles.navHudPill}>
              <ActivityIndicator size="small" color="#34D399" />
              <Text style={styles.navHudText}>Calculando rota...</Text>
            </View>
          </View>
        ) : arRoute.error ? (
          <View style={styles.navHud} pointerEvents="none">
            <View
              style={[
                styles.navHudPill,
                { backgroundColor: "rgba(69, 26, 3, 0.92)", borderColor: "#B45309" },
              ]}>
              <Ionicons name="warning" size={16} color="#FDBA74" />
              <Text style={[styles.navHudText, { color: "#FED7AA" }]}>
                {arRoute.error}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Toast de ponto encontrado (cloud resolve) — última linha. */}
        <ARAnchorToast toast={anchorToast} onDismiss={dismissAnchorToast} />
      </ARTopHudStack>

      {/* ══ FLUTUANTES abaixo da pilha — âncora dinâmica (onLayout), sem
          número mágico: badge de zoom + retícula + seletor + botão lista. */}
      {zoomLevel > 1.05 ? (
        <View style={[styles.zoomBadge, { top: stableHudHeight + 8 }]} pointerEvents="none">
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
        style={[styles.listBtn, { top: stableHudHeight + 8 }]}
        accessibilityRole="button"
        accessibilityLabel="Listar pontos carregados">
        <Ionicons name="list" size={20} color="#67E8F9" />
        {projection.anchors.length > 0 ? (
          <View style={styles.listBtnBadge}>
            <Text style={styles.listBtnBadgeText}>{projection.anchors.length}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

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

      <PlaceAnchorModal
        visible={modalVisible && !hostingPhaseActive}
        isSaving={isSaving}
        hosting={pointHosting.state}
        onRetry={pointHosting.begin}
        anchorName={anchorName}
        onAnchorNameChange={setAnchorName}
        anchorDescription={anchorDescription}
        onAnchorDescriptionChange={setAnchorDescription}
        categories={categoriesQuery.data ?? []}
        selectedCategoryId={anchorCategoryId}
        onSelectCategory={setAnchorCategoryId}
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

      {/* ══ DIAGNÓSTICO DO MAPEAMENTO (Frente D) — pill de status clicável.
          Dados por PULL (getters) + refresh 1s no próprio modal. */}
      <ARDiagnosticsModal
        visible={diagVisible}
        onClose={() => setDiagVisible(false)}
        getSnapshot={getDiagnosticsSnapshot}
        getContext={getDiagnosticsContext}
      />
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
  /** Bloco persistente da pilha (status + filtros) — altura estável. */
  stableHudBlock: {
    gap: 8,
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
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
  /** Linha da pilha do topo (ARTopHudStack) — sem absolute/números mágicos. */
  navHud: {
    alignItems: "center",
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
