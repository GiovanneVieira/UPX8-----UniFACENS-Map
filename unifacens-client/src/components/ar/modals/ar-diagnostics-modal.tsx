import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CloudAnchorDiagnostic } from '../hooks/use-cloud-anchors';

/** Contexto de sessão exibido na página de resumo (pull do container). */
export interface ARDiagnosticsContext {
  /** 1: Indisponível, 2: Limitado, 3: Estável */
  trackingState: number;
  /** 'aligning' | 'locked' — motor Δ do mundo. */
  deltaStatus: string;
  /** Δ em graus (null = alinhando). */
  deltaValue: number | null;
  /** Provider ativo ('reactvision' | 'arcore'). */
  provider: string;
  /** Acurácia horizontal da pose (m) — null = sem pose. */
  poseAccM: number | null;
  /** Pose fresca (< 10s)? */
  poseFresh: boolean;
  /** Total de pins no servidor. */
  totalPins: number;
  /** Visual por pin: distância/estimativa (da projeção). */
  pinVisuals: Map<
    string,
    { distanceM?: number; estimated?: boolean; estimateAccuracyM?: number; isGhost?: boolean }
  >;
}

interface ARDiagnosticsModalProps {
  visible: boolean;
  onClose: () => void;
  /** Snapshot por pin (pull — lê refs do pipeline cloud). */
  getSnapshot: () => CloudAnchorDiagnostic[];
  /** Contexto de sessão (pull). */
  getContext: () => ARDiagnosticsContext;
}

/** Classifica o cloud anchor ID por provider (§15.12 — IDs não são
 *  intercambiáveis; ua- = Google/ARCore, UUID = ReactVision). */
function classifyCloudId(id: string): string {
  if (id.startsWith('ua-')) return 'Google (ARCore)';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return 'ReactVision';
  }
  return 'Sintético (seed)';
}

const STATE_META: Record<
  CloudAnchorDiagnostic['state'],
  { label: string; color: string; bg: string }
> = {
  resolved: { label: 'Cravada', color: '#34D399', bg: 'rgba(6, 78, 59, 0.5)' },
  provisional: { label: 'Provisória', color: '#67E8F9', bg: 'rgba(8, 47, 73, 0.5)' },
  ghost: { label: 'Ghost (estimativa)', color: '#7DD3FC', bg: 'rgba(8, 47, 73, 0.5)' },
  grace: { label: 'Cortesia', color: '#FCD34D', bg: 'rgba(69, 26, 3, 0.5)' },
  waiting: { label: 'Aguardando', color: '#94A3B8', bg: 'rgba(30, 41, 59, 0.5)' },
};

const TRACKING_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: 'Indisponível', color: '#FCA5A5' },
  2: { label: 'Limitado (IMU)', color: '#FCD34D' },
  3: { label: 'Estável', color: '#34D399' },
};

function formatAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s atrás`;
  return `${Math.floor(s / 60)}min atrás`;
}

/**
 * Painel de diagnóstico do mapeamento de pontos AR (Frente D, 2026-11-11):
 * página de RESUMO (contadores + sessão) + uma página por pin cloud
 * (estado, tentativas, countdown de re-tentativa, provider do ID, última
 * mensagem de resolve). Dados por PULL (getters) com refresh de 1s enquanto
 * aberto — sem re-renders extras na cena.
 */
export const ARDiagnosticsModal: React.FC<ARDiagnosticsModalProps> = ({
  visible,
  onClose,
  getSnapshot,
  getContext,
}) => {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [, setTick] = useState(0);

  // Reset da página ao abrir + refresh 1s enquanto aberto (countdowns vivos).
  useEffect(() => {
    if (!visible) return;
    setPage(0);
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  const snapshot = getSnapshot();
  const ctx = getContext();
  const now = Date.now();
  const pageCount = 1 + snapshot.length;
  const safePage = Math.min(page, Math.max(0, pageCount - 1));

  const counts = snapshot.reduce(
    (acc, d) => {
      acc[d.state] = (acc[d.state] ?? 0) + 1;
      return acc;
    },
    {} as Record<CloudAnchorDiagnostic['state'], number>,
  );
  const noCloud = Math.max(0, ctx.totalPins - snapshot.length);

  const tracking = TRACKING_LABEL[ctx.trackingState] ?? TRACKING_LABEL[2];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel="Fechar diagnóstico">
        <View
          style={[styles.card, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}
          onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>Diagnóstico do Mapeamento</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Fechar">
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {safePage === 0 ? (
            /* ══ PÁGINA 0 — RESUMO ══ */
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.statGrid}>
                <View style={[styles.statCard, { borderColor: '#065F46' }]}>
                  <Text style={[styles.statValue, { color: '#34D399' }]}>
                    {counts.resolved ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>Cravadas</Text>
                </View>
                <View style={[styles.statCard, { borderColor: '#155E75' }]}>
                  <Text style={[styles.statValue, { color: '#7DD3FC' }]}>
                    {counts.ghost ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>Ghosts</Text>
                </View>
                <View style={[styles.statCard, { borderColor: '#7C2D12' }]}>
                  <Text style={[styles.statValue, { color: '#FCD34D' }]}>
                    {(counts.grace ?? 0) + (counts.waiting ?? 0) + (counts.provisional ?? 0)}
                  </Text>
                  <Text style={styles.statLabel}>Em transição</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: '#E2E8F0' }]}>
                    {ctx.totalPins}
                  </Text>
                  <Text style={styles.statLabel}>Total{noCloud > 0 ? ` (${noCloud} s/ cloud)` : ''}</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Sessão</Text>
              <View style={styles.sessionBox}>
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionKey}>Tracking</Text>
                  <Text style={[styles.sessionValue, { color: tracking.color }]}>
                    {tracking.label}
                  </Text>
                </View>
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionKey}>Alinhamento Δ</Text>
                  <Text style={styles.sessionValue}>
                    {ctx.deltaStatus === 'locked'
                      ? `Travado ${ctx.deltaValue !== null ? `${Math.round(ctx.deltaValue)}°` : ''}`
                      : 'Alinhando…'}
                  </Text>
                </View>
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionKey}>Provider</Text>
                  <Text style={styles.sessionValue}>{ctx.provider}</Text>
                </View>
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionKey}>Pose</Text>
                  <Text
                    style={[
                      styles.sessionValue,
                      ctx.poseAccM === null
                        ? { color: '#FCD34D' }
                        : !ctx.poseFresh
                          ? { color: '#FCA5A5' }
                          : { color: '#34D399' },
                    ]}>
                    {ctx.poseAccM === null
                      ? 'sem pose'
                      : `±${Math.round(ctx.poseAccM)}m${ctx.poseFresh ? '' : ' (stale)'}`}
                  </Text>
                </View>
              </View>
            </ScrollView>
          ) : (
            /* ══ PÁGINAS 1..N — PIN POR PIN ══ */
            (() => {
              const d = snapshot[safePage - 1];
              if (!d) return null;
              const meta = STATE_META[d.state];
              const visual = ctx.pinVisuals.get(d.pinId);
              return (
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled">
                  <View style={styles.pinHeader}>
                    <Text style={styles.pinName} numberOfLines={1}>
                      {d.name}
                    </Text>
                    <View style={[styles.stateChip, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                      <Text style={[styles.stateChipText, { color: meta.color }]}>
                        {meta.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailBox}>
                    {typeof visual?.distanceM === 'number' ? (
                      <View style={styles.sessionRow}>
                        <Text style={styles.sessionKey}>Distância</Text>
                        <Text style={styles.sessionValue}>
                          {`${Math.round(visual.distanceM)} m${
                            visual.estimated && typeof visual.estimateAccuracyM === 'number'
                              ? ` ±${Math.round(visual.estimateAccuracyM)}m`
                              : ''
                          }`}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.sessionRow}>
                      <Text style={styles.sessionKey}>Tentativas de resolve</Text>
                      <Text style={styles.sessionValue}>{d.attempts}</Text>
                    </View>
                    {d.state !== 'resolved' ? (
                      <View style={styles.sessionRow}>
                        <Text style={styles.sessionKey}>Próxima re-tentativa</Text>
                        <Text style={styles.sessionValue}>
                          {d.inProgress
                            ? 'em curso no nativo…'
                            : d.retryInMs <= 0
                              ? 'elegível agora'
                              : `${Math.round(d.retryInMs / 1000)}s`}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.sessionRow}>
                      <Text style={styles.sessionKey}>Provider do ID</Text>
                      <Text style={styles.sessionValue}>{classifyCloudId(d.cloudAnchorId)}</Text>
                    </View>
                    <View style={styles.sessionRow}>
                      <Text style={styles.sessionKey}>Cloud ID</Text>
                      <Text style={styles.monoText} numberOfLines={1} ellipsizeMode="middle">
                        {d.cloudAnchorId}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.sectionTitle}>Último resolve</Text>
                  <View style={styles.detailBox}>
                    <Text style={styles.messageText}>
                      {d.lastMessage
                        ? d.lastMessage.message
                        : 'nenhuma tentativa nesta sessão'}
                    </Text>
                    {d.lastMessage ? (
                      <Text style={styles.messageAgo}>{formatAgo(d.lastMessage.at, now)}</Text>
                    ) : null}
                  </View>
                </ScrollView>
              );
            })()
          )}

          {/* ══ PAGINAÇÃO ‹ [x/y] › ══ */}
          {pageCount > 1 ? (
            <View style={styles.pagerRow}>
              <TouchableOpacity
                onPress={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                style={[styles.pagerBtn, safePage === 0 ? styles.pagerBtnDisabled : null]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Página anterior">
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={safePage === 0 ? '#334155' : '#67E8F9'}
                />
              </TouchableOpacity>
              <Text style={styles.pagerLabel}>
                {safePage === 0 ? 'Visão geral' : `Ponto ${safePage}/${snapshot.length}`}
              </Text>
              <TouchableOpacity
                onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage === pageCount - 1}
                style={[
                  styles.pagerBtn,
                  safePage === pageCount - 1 ? styles.pagerBtnDisabled : null,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Próxima página">
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={safePage === pageCount - 1 ? '#334155' : '#67E8F9'}
                />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// Regra de ouro §6: componente de tela AR usa ESTRITAMENTE StyleSheet.create.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#0B1220',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '78%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: '#F1F5F9',
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
  },
  sectionTitle: {
    color: '#CBD5E1',
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  sessionBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sessionKey: {
    color: '#94A3B8',
    fontSize: 12.5,
  },
  sessionValue: {
    color: '#E2E8F0',
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  pinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  pinName: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  stateChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stateChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    marginBottom: 14,
  },
  monoText: {
    color: '#67E8F9',
    fontSize: 11,
    fontFamily: 'monospace',
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: 220,
  },
  messageText: {
    color: '#E2E8F0',
    fontSize: 12.5,
  },
  messageAgo: {
    color: '#64748B',
    fontSize: 11,
  },
  pagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  pagerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: '#164E63',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnDisabled: {
    borderColor: '#1E293B',
  },
  pagerLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 110,
    textAlign: 'center',
  },
});
