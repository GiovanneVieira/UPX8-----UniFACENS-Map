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
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { type Anchor, type CategoryModel, isUsablePoint } from "shared";
import {
  useAnchorsQuery,
  useCreateAnchorMutation,
  useDeleteAnchorMutation,
  usePatchAnchorMutation,
  anchorKeys,
} from "@/features/anchors/queries/use-anchors-query";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ViroARAnchorScene } from "./ViroARAnchorScene";
import { useARGeolocation } from "./hooks/use-ar-geolocation";
import { useARPermissions } from "./hooks/use-ar-permissions";
import { useARProjection } from "./hooks/use-ar-projection";
import { useGeospatialPose, isPoseFresh } from "./hooks/use-geospatial-pose";
import { useNativeAnchors } from "./hooks/use-native-anchors";
import { useCloudAnchors, isRealCloudAnchorId } from "./hooks/use-cloud-anchors";
import { usePointHosting, GUIDE_MS } from "./hooks/use-point-hosting";
import { useGeospatialHosting } from "./hooks/use-geospatial-hosting";
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
import { EditAnchorModal } from "./modals/edit-anchor-modal";
import { ARAnchorToast, ANCHOR_TOAST_TTL_MS, type AnchorToastData } from "./hud/ar-anchor-toast";
import { ARDiagnosticsModal, type ARDiagnosticsContext } from "./modals/ar-diagnostics-modal";
import { AnchorDetailSheet } from "./modals/anchor-detail-sheet";
import { useARNavigation } from "@/features/ar/hooks/use-ar-navigation";
import { useCategoriesQuery } from "@/features/categories/queries/use-categories-query";
import { adminApi } from "@/features/admin/services/admin-api";
import { uploadAnchorImages } from "@/services/api";
import type { PendingPhoto } from "./modals/anchor-image-queue";

// Constante estática da cena inicial para nunca recriar a instância nativa do ViroARSceneNavigator
const INITIAL_AR_SCENE = { scene: ViroARAnchorScene as any };

/**
 * Provider AR ativo — hostGeospatialAnchor/resolve são exclusivos do RV.
 * ⚠️ O fallback para "arcore" é SILENCIOSO por padrão: cloud anchor hosting
 * pelo ARCore devolve "Not Authorized" (A/B 2026-11-10). A env
 * EXPO_PUBLIC_AR_PROVIDER vive no .env.client (Metro do CONTAINER — nunca
 * apenas no unifacens-client/.env, lição 2026-11-18 do bundle sem credenciais).
 */
const AR_PROVIDER =
  process.env.EXPO_PUBLIC_AR_PROVIDER === "reactvision" ? "reactvision" : "arcore";

if (process.env.EXPO_PUBLIC_AR_PROVIDER !== "reactvision") {
  console.warn(
    `[ARProvider] EXPO_PUBLIC_AR_PROVIDER="${process.env.EXPO_PUBLIC_AR_PROVIDER ?? ""}" — ` +
      'usando fallback "arcore" (cloud anchor hosting DEVOLVE "Not Authorized" neste provider). ' +
      'Confira o .env.client do compose e recarregue o app (env é inline constant do bundle).',
  );
}

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
  const patchAnchorMutation = usePatchAnchorMutation();
  const [isSaving, setIsSaving] = useState(false);
  const [mutationStatus, setMutationStatus] = useState<string | null>(null);
  const { isAdmin } = useAuth();

  /** Biblioteca de modelos 3D para o carousel (F3) — só carrega para admin. */
  const modelsQuery = useQuery({
    queryKey: ['admin', 'models', 'ar-carousel'],
    queryFn: ({ signal }) => adminApi.models.list(signal),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  // ── Motores de domínio (hooks dedicados) ─────────────────────────────────
  const cameraPosRef = useRef<[number, number, number]>([0, 0, 0]);
  /**
   * SALTO de GPS (refix indoor, lição 2026-11-16): invalida estimativas
   * congeladas (a monotonicidade delas assume GPS sem saltos — a nativa
   * resolve no frame pós-salto e o pin "desaparece" deslizando 76-125m).
   * Ref de indireção: a projeção ainda não existe na criação do hook.
   */
  const handlePoseJumpRef = useRef<(jumpM: number) => void>(() => {});
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
  // Diálogos de câmera + deslocamento ao ENTRAR na tab AR (a localização o
  // geo hook pede acima; o Viro/ARCore não pede câmera por conta própria).
  useARPermissions();
  const geospatial = useGeospatialPose({
    onPoseJump: (jumpM) => handlePoseJumpRef.current(jumpM),
  });

  // ── Motor de alinhamento mundial: Δ (azimute do mundo AR ↔ Norte) ────────
  // Estimado 1× por sessão a partir da pose geospatial + forward da câmera
  // (com guarda de horizontalidade — rotation[1] garbla sob câmera inclinada),
  // congelado em seguida. Jamais fusão contínua (lição §11.5 do AGENTS.MD).
  const alignment = useARWorldAlignment(geospatial.pose, cameraFwdRef);

  // ── Earth-state do SDK (Frente A, 2026-11-16): a máquina de prontidão
  //    oficial (VPS_LITE.md) — transição Localizing→Enabled travada em ~15m
  //    INTERNA. Substitui o gate caseiro ≤20m da era arcore, que congelava
  //    a fila geospatial sempre que o GPS ficava ruim (enquanto a cloud,
  //    visual, seguia rodando — o sintoma "fetch às vezes não acontece").
  const [earthState, setEarthState] = useState<'Stopped' | 'Localizing' | 'Enabled' | 'Paused'>('Stopped');
  /** Localização aproximada concedida → Localizing eterno (HUD acionável). */
  const [locationReduced, setLocationReduced] = useState(false);
  /** VPS disponível na área (checkVPSAvailability 1×/sessão; null = não consultado). */
  const [vpsAvailable, setVpsAvailable] = useState<boolean | null>(null);
  const vpsCheckedRef = useRef(false);
  /**
   * Navigator completo (arSceneNavigator do callback onNavigatorReady) — tem
   * TODOS os métodos geospatial. O `navigatorRef` (React ref do componente)
   * NÃO expõe checkVPSAvailability na janela do primeiro mount (bug de device
   * 2026-11-16: o VPS check nunca rodou porque o ref do componente não tinha
   * o método — zero logs [ARGeo] VPS).
   */
  const sceneNavRef = useRef<any>(null);

  const handleEarthState = useCallback((state: 'Stopped' | 'Localizing' | 'Enabled' | 'Paused') => {
    setEarthState(state);
  }, []);
  const handleLocationReduced = useCallback((reduced: boolean) => {
    setLocationReduced(reduced);
  }, []);

  // checkVPSAvailability 1× após a primeira pose válida (badge de expectativa:
  // VPS ~1–5m vs GPS-only ±10–30m — pesquisa de precisão 2026-11-16).
  // ⚠️ Usa o navigator do CALLBACK (sceneNavRef), não o React ref — este não
  // expõe os métodos geospatial na janela do mount (bug corrigido 2026-11-16).
  useEffect(() => {
    const pose = geospatial.pose;
    if (vpsCheckedRef.current || !pose || !focused) return;
    const nav = sceneNavRef.current;
    if (!nav || typeof nav.checkVPSAvailability !== 'function') return;
    vpsCheckedRef.current = true;
    void (async () => {
      try {
        const result = (await nav.checkVPSAvailability(
          pose.latitude,
          pose.longitude,
        )) as { availability?: string };
        const available = result?.availability === 'Available';
        console.log(`[ARGeo] VPS: ${result?.availability ?? 'Unknown'}`);
        setVpsAvailable(available);
      } catch (err) {
        console.warn('[ARGeo] VPS check falhou:', err);
        // best-effort: badge fica null (neutro)
      }
    })();
  }, [geospatial.pose, focused]);

  const nativeAnchors = useNativeAnchors({
    serverAnchors: anchorsQuery.data,
    // GATE NOVO: earth Enabled = o SDK diz que âncoras geospatial são
    // viáveis (threshold interno ~15m). Localizing = fila espera (normal,
    // segundos a ~1min); o gate antigo ≤20m morreu com a era arcore.
    poseReady: earthState === 'Enabled',
    focused,
    trackingHealthy: trackingState >= 2,
    // Pose atual (ref) — alimenta o gate de raio do resolve (≤5km).
    geoPoseRef: geospatial.poseRef,
    // Fila nativa REATIVADA no reactvision (revertendo o gate do 43f71b3 —
    // diagnóstico ERRADO: as posições em dezenas de km eram o FRAME DA
    // SESSÃO correto, eixos rotacionados pelo yaw do launch; as magnitudes
    // batiam com as distâncias reais dos pins, lição de device 2026-11-16
    // noite. O SDK ancora na TERRA (doc: "creates a local AR anchor at
    // that location") — não depende de onde o usuário está. O guard de
    // range agora é 1000km (anti-ECEF), não mais 1km.
    enabled: true,
  });

  // ── Hosting por PONTO (guia oficial Cloud Anchors, lição definitiva
  //    2026-11-10: dados da plataforma — finishScan: GPS null + 5% resolve;
  //    hostCloudAnchor: GPS ✓ + 54%). Tap na retícula → hit-test pontual →
  //    createAnchoredNode NO PONTO → guia 20s → hostCloudAnchor(30d). ──────
  const pointHosting = usePointHosting({
    focused,
    trackingActive: trackingState >= 2,
    screenWidth,
    screenHeight,
  });
  const hostingPhaseActive =
    pointHosting.state.phase === 'placing' ||
    pointHosting.state.phase === 'guiding' ||
    pointHosting.state.phase === 'hosting';

  // ── Hosting GEOESPACIAL em background (F2 — dupla ancoragem) ─────────────
  // Dispara na fase 'hosted' (cloud visual já concluiu — one-op-por-vez
  // §12.12) e persiste o UUID RV no pin: no POST quando resolve antes do
  // save, via PATCH quando resolve depois. Falha/skip NUNCA bloqueia o save.
  const geoSavedPinIdRef = useRef<string | null>(null);
  const geoHostStashRef = useRef<{ anchorId: string; accuracyM: number } | null>(null);
  const geoHosting = useGeospatialHosting({
    hosted: pointHosting.state.phase === 'hosted',
    provider: AR_PROVIDER,
    averagedPose: geospatial.averagedPose,
    // Gates de op nativa (§12.12) — o wait-loop só promove a host com ambos.
    focused,
    trackingHealthy: trackingState >= 2,
    onHosted: (anchorId, accuracyM) => {
      const pinId = geoSavedPinIdRef.current;
      if (pinId) {
        void patchAnchorMutation
          .mutateAsync({
            id: pinId,
            dto: { geospatialAnchorId: anchorId, geospatialAccuracyM: accuracyM },
          })
          .then(() => console.log(`[ARGeoHost] PATCH aplicado ao pin salvo ${pinId}`))
          .catch((err: unknown) =>
            console.warn('[ARGeoHost] falha no PATCH pós-save:', err),
          );
      } else {
        geoHostStashRef.current = { anchorId, accuracyM };
        console.log('[ARGeoHost] host concluído antes do save — incluído no POST');
      }
    },
  });

  // ── Âncoras de NUVEM VISUAIS — precisão centimétrica perto do pin ────────
  // ⚠️ hostingActive: durante a criação o loop de resolve PAUSA — o módulo
  //    nativo é one-op-por-vez (§12.12) e um resolve concorrente pendurava o
  //    hostCloudAnchor até o timeout de 90s (lição de device 2026-11-12).
  const cloudAnchors = useCloudAnchors({
    serverAnchors: anchorsQuery.data,
    trackingState,
    focused,
    // Ordena candidatos por proximidade (pin perto = SIFT fecha antes).
    geoPoseRef: geospatial.poseRef,
    // ⚠️ Inclui o hosting geoespacial em background (F2): mesma disciplina
    // one-op-por-vez do nativo.
    hostingActive: hostingPhaseActive || geoHosting.pending,
  });
  // Frente C: handleTrackingUpdate (useCallback []) lê via ref.
  cloudInvalidateRef.current = cloudAnchors.invalidateEntries;

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

  // Salto de GPS → estimativas congeladas invalidadas + re-projeção do zero
  // (a pose pós-salto é a nova verdade; alvos monótonos pré-salto são lixo).
  handlePoseJumpRef.current = (jumpM: number) => {
    console.log(
      `[ARProj] salto de GPS ${jumpM.toFixed(0)}m — limpando estimativas congeladas e re-projetando`,
    );
    projection.clearFrozen();
    setReprojectNonce((n) => n + 1);
  };

  // ── Navegação ────────────────────────────────────────────────────────────
  const [detailSheetVisible, setDetailSheetVisible] = useState(false);
  /** Lista de pontos carregados ("Ir para" — rota AR). */
  const [listVisible, setListVisible] = useState(false);
  /** Edição de ponto (F3, admin). */
  const [editVisible, setEditVisible] = useState(false);
  const [editAnchor, setEditAnchor] = useState<Anchor | null>(null);
  /**
   * PREVIEW VIVO da edição: modelo selecionado no carousel do EditAnchorModal
   * sobrepõe o do pin REAL na cena atrás do sheet (undefined = sem override —
   * modal fechado ou usuário não tocou; null = "Padrão da categoria").
   */
  const [editPreviewModelId, setEditPreviewModelId] = useState<string | null | undefined>(undefined);
  /**
   * PREVIEW VIVO do AJUSTE DE ALTITUDE: stepper do EditAnchorModal aplica o
   * offset ao pin REAL na hora (mesma mecânica do render — camadas imprecisas).
   */
  const [editPreviewAltOffset, setEditPreviewAltOffset] = useState<number | undefined>(undefined);
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
  /** Modelo 3D override do ponto (F3 — null = padrão da categoria). */
  const [anchorModelId, setAnchorModelId] = useState<string | null>(null);
  /** Fila de fotos pendentes do ponto (F3 — upload pós-salvar, na ordem). */
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);

  // ── Status do HUD (pipeline oficial: scan → hosted; resolve → progresso
  //    real; pendentes = estado honesto "aproxime-se") ──────────────────────
  const cloudStatusDerived = useMemo(() => {
    if (anchorsQuery.isPending) return "Carregando pontos...";
    if (anchorsQuery.isError) return "Erro de conexão";
    // Localização APPROXIMADA (Frente A): earth fica em Localizing PARA
    // SEMPRE — a doc (VPS_LITE.md) exige erro ACIONÁVEL, não hang silencioso.
    if (locationReduced) return "Ative Localização Precisa para este app";
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
    // Pins do servidor existem mas nenhum projetado → calibrando, com o
    // estado do EARTH do SDK (Localizing é NORMAL: segundos a ~1min frio).
    if (projection.anchors.length === 0) {
      const pose = geospatial.pose;
      const acc = pose?.horizontalAccuracy;
      if (earthState === 'Localizing') {
        return acc !== undefined && acc !== null
          ? `Localizando GPS ±${acc.toFixed(0)}m…`
          : 'Localizando GPS…';
      }
      if (earthState === 'Paused') return 'GPS pausado';
      if (acc !== undefined && acc !== null) {
        return `Calibrando AR… ±${acc.toFixed(0)}m`;
      }
      return "Calibrando AR…";
    }
    return `${projection.anchors.length} ponto(s)${vpsAvailable === false ? ' · GPS only' : vpsAvailable === true ? ' · VPS ✓' : ''}`;
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
    earthState,
    locationReduced,
    vpsAvailable,
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
    // Novo run de hosting geoespacial (F2): zera o bind pin↔UUID da run anterior.
    geoSavedPinIdRef.current = null;
    geoHostStashRef.current = null;
    // Novo run do formulário (F3): modelo override e fila de fotos zerados.
    setAnchorModelId(null);
    setPendingPhotos([]);
    setModalVisible(true);
    console.log("[ARHost] modal de criação aberto — etapa POSICIONAR");
  }, [pointHosting]);

  // ── Refresh REAL: refetch + retry de falhas + re-projeção + recalibra Δ ──
  const handleNavigatorReady = useCallback(
    (nav: any) => {
      // Guarda o navigator completo (com métodos geospatial) para o VPS check.
      sceneNavRef.current = nav;
      nativeAnchors.handleNavigatorReady(nav);
      cloudAnchors.handleNavigatorReady(nav);
      pointHosting.handleNavigatorReady(nav);
      geoHosting.handleNavigatorReady(nav);
    },
    [nativeAnchors, cloudAnchors, pointHosting, geoHosting],
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

  // ── Exclusão de ponto (admin) — confirm + mutation + limpeza local ──────
  const handleConfirmDeleteAnchor = useCallback(
    (anchor: Anchor) => {
      Alert.alert(
        'Excluir ponto',
        `Confirmar exclusão de "${anchor.name}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  setIsSaving(true);
                  await deleteAnchorMutation.mutateAsync(anchor.id);
                  nativeAnchors.removeLocal(anchor.id);
                  cloudAnchors.removeLocal(anchor.id);
                } catch {
                  Alert.alert('Erro', 'Não foi possível excluir o ponto.');
                } finally {
                  setIsSaving(false);
                }
              })();
            },
          },
        ],
      );
    },
    [deleteAnchorMutation, nativeAnchors, cloudAnchors],
  );

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
      provider: AR_PROVIDER,
      poseAccM: pose?.horizontalAccuracy ?? null,
      poseFresh: geospatial.isFresh,
      earthState,
      locationReduced,
      vpsAvailable,
      totalPins: anchorsQuery.data?.length ?? 0,
      geoHostedPins:
        anchorsQuery.data?.filter((a) => !!a.geospatialAnchorId).length ?? 0,
      geoHostStatus: geoHosting.state.status,
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
    geoHosting.state.status,
    earthState,
    locationReduced,
    vpsAvailable,
  ]);

  // ── AUTO-REFRESH LEVE (Frente B + quota v2, 2026-11-11): enquanto houver
  //    pins pendentes, a cada 30s re-passa o loop (NUDGE — sem zerar
  //    backoffs: quem falhou espera a janela ou uma mudança de contexto) +
  //    refetch do banco. SEM realign do Δ e SEM clearFrozen — esses ficam
  //    no refresh MANUAL (§11.5: recalibrar Δ sozinho giraria o mundo).
  //    Quota ARCore: resolve 300/min por projeto — folga. Para sozinho
  //    quando nada está pendente. */
  const pendingCount = cloudAnchors.pendingIds.size;
  const cloudNudge = cloudAnchors.nudge;
  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = setInterval(() => {
      if (!focused || trackingStateRef.current < 2) return;
      cloudNudge();
      void queryClient.invalidateQueries({ queryKey: anchorKeys.lists() });
      console.log('[ARCloud] auto-refresh 30s — re-passada (backoffs respeitados) + refetch');
    }, 30_000);
    return () => clearInterval(timer);
  }, [pendingCount, focused, cloudNudge, queryClient]);

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
      // Dupla ancoragem (F2): UUID geoespacial hospedado em background —
      // stash (host resolveu antes do save) ou estado atual do hook.
      const geoHostedNow =
        geoHosting.state.status === 'hosted' ? geoHosting.state : null;
      const geoStash = geoHostStashRef.current;
      const saved = await createAnchorMutation.mutateAsync({
        name: anchorName.trim(),
        cloudAnchorId: hosted.cloudAnchorId,
        description: anchorDescription.trim() || undefined,
        categoryId: anchorCategoryId ?? undefined,
        modelId: anchorModelId ?? undefined,
        latitude: targetLat,
        longitude: targetLon,
        altitude: Number(targetAlt.toFixed(2)),
        heading: avgPose ? Number(avgPose.heading.toFixed(1)) : 0,
        geospatialAnchorId: geoStash?.anchorId ?? geoHostedNow?.anchorId,
        geospatialAccuracyM: geoStash?.accuracyM ?? geoHostedNow?.accuracyM,
      });

      queryClient.setQueryData<Anchor[]>(anchorKeys.lists(), (old) =>
        old ? [saved, ...old] : [saved],
      );

      // F2: bind pin↔hosting geoespacial — se o host concluir DEPOIS do
      // save, o onHosted PATCHa este pin (stash já foi consumido no POST).
      geoSavedPinIdRef.current = saved.id;
      geoHostStashRef.current = null;

      cloudAnchors.setProvisionalEntry({
        pinId: saved.id,
        nativeAnchorId: hosted.cloudAnchorId,
        position: hosted.position,
      });
      console.log(
        `[ARHost] pin "${saved.name}" visível AGORA NO PONTO — pos=[${hosted.position.map((v) => v.toFixed(2)).join(', ')}]`,
      );

      // F3: upload da fila de fotos NA ORDEM (o ponto já existe). Falha é
      // não-bloqueante — o pin está salvo; o admin pode reenviar editando.
      if (pendingPhotos.length > 0) {
        try {
          setMutationStatus("Enviando fotos...");
          await uploadAnchorImages(saved.id, pendingPhotos);
          // ⚠️ O createAnchor JÁ invalidou a lista ANTES do upload rodar —
          // sem isto o cache do TanStack fica com o pin SEM imagens e o
          // sheet de detalhes não as exibe (lição de device 2026-11-18).
          await queryClient.invalidateQueries({ queryKey: anchorKeys.lists() });
        } catch (err) {
          console.warn('[ARHost] upload de fotos falhou:', err);
          Alert.alert(
            "Fotos",
            "O ponto foi salvo, mas algumas fotos não subiram. Abra a edição do ponto para tentar de novo.",
          );
        }
      }

      setMutationStatus(null);
      setAnchorName("");
      setAnchorDescription("");
      setAnchorCategoryId(null);
      setAnchorModelId(null);
      setPendingPhotos([]);
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
    const base = projection.anchors.filter((a) => {
      if (!isUsablePoint(a.arPosition)) return false;
      if (radiusFilter > 0 && typeof a.distanceMeters === "number") {
        return a.distanceMeters <= radiusFilter;
      }
      return true;
    });
    // PREVIEW VIVO da edição (2026-11-16): o modelo escolhido no carousel
    // substitui o do pin REAL na cena — o usuário vê o resultado no lugar
    // antes de salvar. Cancelar/fechar reverte (override não persiste).
    if (!editAnchor || editPreviewModelId === undefined) return base;
    return base.map((a) => {
      if (a.id !== editAnchor.id) return a;
      // Ajuste de altitude em preview (stepper) — aplica na hora.
      const altOffset =
        editPreviewAltOffset !== undefined ? editPreviewAltOffset : a.altitudeOffsetM ?? 0;
      const withAlt: Anchor =
        altOffset !== (a.altitudeOffsetM ?? 0)
          ? { ...a, altitudeOffsetM: altOffset }
          : a;
      if (editPreviewModelId === null) {
        // "Padrão da categoria": limpa o override do ponto (herda categoria).
        return { ...withAlt, modelId: null, model: null };
      }
      const found = modelsQuery.data?.items.find((m) => m.id === editPreviewModelId);
      if (!found) return withAlt;
      return {
        ...withAlt,
        modelId: found.id,
        model: { url: found.url, format: found.format, boundingBox: found.boundingBox },
      };
    });
  }, [projection.anchors, radiusFilter, editAnchor, editPreviewModelId, editPreviewAltOffset, modelsQuery.data]);

  // ── Preview vivo do ponto em criação (F3): modelo selecionado no carousel
  //    renderizado NO ponto tocado atrás do sheet (fallback = modelo da
  //    categoria → diamante âmbar quando nada vinculado). ───────────────────
  const hostedPreview =
    pointHosting.state.phase === 'hosted' ? pointHosting.state.position : null;
  /**
   * SHOWCASE de modelo (2026-11-16): botão "ver na câmera" do carousel —
   * posiciona o modelo 2.2m À FRENTE da câmera por 15s (precedência sobre
   * o preview de criação). O preview real: o próprio Viro3DObjectPin.
   */
  const [showcasePreview, setShowcasePreview] = useState<{
    position: [number, number, number];
    model: CategoryModel;
    until: number;
  } | null>(null);
  const handleModelShowcase = useCallback(
    (model: { url: string; format: string; boundingBox: CategoryModel['boundingBox'] }) => {
      const cam = cameraPosRef.current;
      const fwd = cameraFwdRef.current;
      const position: [number, number, number] = [
        cam[0] + fwd[0] * 2.2,
        cam[1] + fwd[1] * 2.2 - 0.35,
        cam[2] + fwd[2] * 2.2,
      ];
      setShowcasePreview({
        position,
        model: {
          url: model.url,
          format: model.format as CategoryModel['format'],
          boundingBox: model.boundingBox,
        },
        until: Date.now() + 15_000,
      });
      console.log('[ARHost] showcase de modelo à frente da câmera (15s)');
    },
    [],
  );
  const showcaseActive =
    showcasePreview !== null && Date.now() < showcasePreview.until
      ? showcasePreview
      : null;
  /** Expira o showcase no tempo certo (sem depender de re-render alheio). */
  useEffect(() => {
    if (!showcasePreview) return;
    const remaining = showcasePreview.until - Date.now();
    if (remaining <= 0) {
      setShowcasePreview(null);
      return;
    }
    const timer = setTimeout(() => setShowcasePreview(null), remaining);
    return () => clearTimeout(timer);
  }, [showcasePreview]);
  const selectedPreviewModel: CategoryModel | null = useMemo(() => {
    if (showcaseActive) return showcaseActive.model;
    const models = modelsQuery.data?.items ?? [];
    if (anchorModelId) {
      const found = models.find((m) => m.id === anchorModelId);
      if (found) {
        return { url: found.url, format: found.format, boundingBox: found.boundingBox };
      }
    }
    const category = (categoriesQuery.data ?? []).find((c) => c.id === anchorCategoryId);
    return category?.model ?? null;
  }, [showcaseActive, modelsQuery.data, anchorModelId, categoriesQuery.data, anchorCategoryId]);

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
      /** Provider real (diagnóstico — lição 2026-11-16 do log hardcoded). */
      provider: AR_PROVIDER,
      /**
       * Render dos planos detectados — APENAS no modo placing (feedback de
       * "onde o ARCore já enxerga superfície" antes do toque; o quad azul
       * permanente era o artefato §12.9 — na janela de posicionamento é
       * pedagógico e some com o tap).
       */
      showPlanes: pointHosting.state.phase === 'placing',
      // Preview do ponto em criação (F3) + SHOWCASE de modelo (2026-11-16,
      // botão "ver na câmera" do carousel — precedência por 15s).
      previewPosition: showcaseActive ? showcaseActive.position : hostedPreview,
      previewModel: showcaseActive
        ? showcaseActive.model
        : hostedPreview
          ? selectedPreviewModel
          : null,
      routeChevrons: arRoute.active && !arRoute.arrived ? arRoute.chevrons : [],
      onGeospatialStatus: nativeAnchors.handleGeospatialStatus,
      onGeospatialPose: geospatial.handlePose,
      onEarthState: handleEarthState,
      onLocationAccuracyReduced: handleLocationReduced,
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
      pointHosting.state.phase,
      hostedPreview,
      showcaseActive,
      selectedPreviewModel,
      arRoute.active,
      arRoute.arrived,
      arRoute.chevrons,
      nativeAnchors.handleGeospatialStatus,
      handleEarthState,
      handleLocationReduced,
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
  //    atravessar até a câmera) + progresso da guia 20s ────────────────────
  // (hostingPhaseActive derivado junto ao usePointHosting, lá em cima.)
  const [guideProgress, setGuideProgress] = useState(0);
  useEffect(() => {
    if (pointHosting.state.phase !== 'guiding') {
      setGuideProgress(0);
      return;
    }
    const startedAt = pointHosting.state.startedAt;
    const timer = setInterval(() => {
      setGuideProgress(Math.min(1, (Date.now() - startedAt) / GUIDE_MS));
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointHosting.state.phase, pointHosting.state.phase === 'guiding' ? pointHosting.state.startedAt : 0]);

  // ── Unmount: cancelar ops cloud pendentes ANTES da view nativa morrer ──
  // (§12.12): a race do crash na troca de aba é uma chamada nativa in-flight
  // (host/resolve/poll) aterrissando entre o detach e a destruição da view.
  // O cancel explícito das ops cloud (provider reactvision — §15.2) reduz a
  // janela: resolve/host pendurados não sobrevivem ao unmount.
  // O fix DEFINITIVO é upstream (viro 3.2.1: "AR scene hidden by a tab
  // switch no longer crashes on a queued call") — exige Expo 58/RN 0.88.
  useEffect(() => {
    return () => {
      try {
        sceneNavRef.current?.cancelCloudAnchorOperations?.();
      } catch {
        /* view já morta — melhor esforço */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              provider={AR_PROVIDER}
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
        onDelete={isAdmin ? handleConfirmDeleteAnchor : undefined}
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
        models={modelsQuery.data?.items ?? []}
        selectedModelId={anchorModelId}
        onSelectModel={setAnchorModelId}
        onModelShowcase={handleModelShowcase}
        photos={pendingPhotos}
        onPhotosChange={setPendingPhotos}
        gpsAccuracyM={isPoseFresh(geospatial.pose) ? geospatial.pose.horizontalAccuracy : null}
        geoHostStatus={geoHosting.state}
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
        isAdmin={isAdmin}
        onClose={() => setListVisible(false)}
        onNavigate={(anchor) => {
          void startNavigation(anchor);
        }}
        onDetails={(anchor) => {
          setDetailAnchor(anchor);
          setDetailSheetVisible(true);
        }}
        onEdit={
          isAdmin
            ? (anchor) => {
                setEditAnchor(anchor);
                setEditVisible(true);
              }
            : undefined
        }
        onDelete={isAdmin ? handleConfirmDeleteAnchor : undefined}
      />

      {/* Edição de ponto (F3, admin) — mesmo contrato do editor web. */}
      <EditAnchorModal
        visible={editVisible}
        anchor={editAnchor}
        categories={categoriesQuery.data ?? []}
        models={modelsQuery.data?.items ?? []}
        onModelPreview={setEditPreviewModelId}
        onAltitudePreview={setEditPreviewAltOffset}
        onModelShowcase={handleModelShowcase}
        onClose={() => {
          setEditVisible(false);
          setEditAnchor(null);
          setEditPreviewModelId(undefined);
          setEditPreviewAltOffset(undefined);
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
