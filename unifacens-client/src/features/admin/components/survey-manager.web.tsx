import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NavigationGraph, NavigationNetworkSummary } from 'shared';
import { useAnchorsQuery } from '@/features/anchors/queries/use-anchors-query';
import { AdminButton, AdminError } from './admin-ui';
import {
  fetchNavigationNetworks,
  fetchNavigationVersion,
  generateNavigationDraft,
  importNavigationVersion,
  publishNavigationVersion,
} from '@/features/navigation/services/navigation-api';
import { navigationKeys } from '@/features/navigation/queries/use-navigation-query';

const KIND_OPTIONS = [
  ['walkway', 'Calçada / caminho'],
  ['footbridge', 'Passarela'],
  ['ramp', 'Rampa'],
  ['stairs', 'Escada'],
  ['elevator', 'Elevador'],
  ['platform', 'Plataforma'],
] as const;

const SURFACE_OPTIONS = [
  ['', 'Desconhecido'],
  ['firm_regular', 'Firme e regular'],
  ['uneven', 'Irregular'],
  ['loose', 'Solto (terra/cascalho)'],
] as const;

const TRI_OPTIONS = [
  ['', 'Desconhecido'],
  ['true', 'Sim'],
  ['false', 'Não'],
] as const;

type EdgeDraft = NavigationGraph['edges'][number];

/** Campos de acessibilidade que o levantamento deve conferir por trecho. */
function missingAttributes(edge: EdgeDraft): string[] {
  const missing: string[] = [];
  if (edge.widthMeters == null) missing.push('largura');
  if (edge.stepCount == null) missing.push('degraus');
  if (edge.longitudinalSlopePercent == null) missing.push('inclinação');
  if (edge.hasHandrail == null) missing.push('corrimão');
  if (edge.hasTactilePaving == null) missing.push('piso tátil');
  if (edge.surface == null) missing.push('piso');
  return missing;
}

export function SurveyManager() {
  const queryClient = useQueryClient();
  const anchors = useAnchorsQuery();
  const networks = useQuery({
    queryKey: [...navigationKeys.networks(), 'admin'],
    queryFn: async () => {
      // Busca todas as páginas (dev: poucas redes).
      const pages: NavigationNetworkSummary[] = [];
      let offset = 0;
      for (;;) {
        const page = await fetchNavigationNetworks(offset, new AbortController().signal);
        pages.push(...page.items);
        if (page.nextOffset == null) break;
        offset = page.nextOffset;
      }
      return pages;
    },
  });

  const [selected, setSelected] = useState<NavigationNetworkSummary | null>(null);
  const version = useQuery({
    queryKey: navigationKeys.version(
      selected ? { networkId: selected.networkId, version: selected.version } : { networkId: '', version: '' },
    ),
    enabled: selected !== null,
    queryFn: ({ signal }) =>
      fetchNavigationVersion(
        { networkId: selected!.networkId, version: selected!.version },
        signal,
      ),
  });

  // ── Gerador de rascunho ──────────────────────────────────────────────
  const [networkId, setNetworkId] = useState('campus-lev');
  const [versionName, setVersionName] = useState('lev-v1');
  const [pickedAnchors, setPickedAnchors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anchorsWithCoords = (anchors.data ?? []).filter(
    (anchor) => anchor.latitude != null && anchor.longitude != null,
  );

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: navigationKeys.all });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operação falhou.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="gap-6">
      {/* ── Gerar malha em rascunho ── */}
      <View className="gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-base font-semibold text-slate-900">
          Gerar malha em rascunho
        </Text>
        <Text className="text-sm text-slate-600">
          A geometria sai automática da grade caminhável (A* sobre os prédios)
          conectando os pontos AR escolhidos. Os trechos nascem com atributos
          DESCONHECIDOS — complete as medições na lista abaixo antes de publicar.
        </Text>
        <View className="flex-row flex-wrap gap-3">
          <TextInput
            value={networkId}
            onChangeText={setNetworkId}
            placeholder="id da rede (ex.: campus-lev)"
            className="min-h-[40px] w-56 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
          />
          <TextInput
            value={versionName}
            onChangeText={setVersionName}
            placeholder="versão (ex.: lev-v1)"
            className="min-h-[40px] w-44 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
          />
        </View>
        {anchors.isPending ? <ActivityIndicator /> : null}
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-xs font-semibold text-slate-500">
              Pontos AR a conectar — toque para selecionar ({pickedAnchors.length}{' '}
              de {anchorsWithCoords.length} selecionados
              {pickedAnchors.length < 2 ? ' · mínimo 2' : ''})
            </Text>
            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setPickedAnchors(anchorsWithCoords.map((anchor) => anchor.id))
                }
                className="min-h-[32px] justify-center rounded-md border border-slate-300 bg-slate-50 px-2">
                <Text className="text-xs text-slate-700">Selecionar todos</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={pickedAnchors.length === 0}
                onPress={() => setPickedAnchors([])}
                className="min-h-[32px] justify-center rounded-md border border-slate-300 bg-slate-50 px-2 disabled:opacity-50">
                <Text className="text-xs text-slate-700">Limpar</Text>
              </Pressable>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {anchorsWithCoords.map((anchor) => {
              const picked = pickedAnchors.includes(anchor.id);
              return (
                <Pressable
                  key={anchor.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: picked }}
                  onPress={() =>
                    setPickedAnchors((current) =>
                      picked
                        ? current.filter((id) => id !== anchor.id)
                        : [...current, anchor.id],
                    )
                  }
                  className={`min-h-[36px] flex-row items-center gap-1 rounded-full border px-3 ${
                    picked
                      ? 'border-sky-600 bg-sky-100'
                      : 'border-slate-300 bg-slate-50'
                  }`}>
                  <Text className="text-xs">{picked ? '✓' : '＋'}</Text>
                  <Text className="text-sm text-slate-800">{anchor.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <AdminButton
          primary
          label="Gerar rascunho"
          disabled={busy !== null || pickedAnchors.length < 2}
          onPress={() =>
            void run('draft', async () => {
              await generateNavigationDraft({
                networkId,
                version: versionName,
                anchorIds: pickedAnchors,
              });
              setPickedAnchors([]);
            })
          }>
          {busy === 'draft' ? 'Gerando…' : 'Gerar rascunho'}
        </AdminButton>
      </View>

      {error ? <AdminError message={error} /> : null}

      {/* ── Redes / versões ── */}
      <View className="gap-3">
        <Text className="text-base font-semibold text-slate-900">
          Redes de percursos
        </Text>
        {networks.isPending ? <ActivityIndicator /> : null}
        {networks.data?.length === 0 ? (
          <Text className="text-sm text-slate-600">
            Nenhuma rede importada — gere um rascunho acima.
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {networks.data?.map((summary) => {
            const active =
              selected?.networkId === summary.networkId &&
              selected?.version === summary.version;
            return (
              <Pressable
                key={`${summary.networkId}/${summary.version}`}
                onPress={() => setSelected(summary)}
                className={`min-h-[40px] justify-center rounded-lg border px-3 ${
                  active
                    ? 'border-sky-500 bg-sky-100'
                    : 'border-slate-300 bg-white'
                }`}>
                <Text className="text-sm font-medium text-slate-900">
                  {summary.networkId}/{summary.version}{' '}
                  <Text
                    className={
                      summary.status === 'published'
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }>
                    ({summary.status === 'published' ? 'publicada' : 'rascunho'})
                  </Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Editor de levantamento ── */}
      {selected ? (
        <VersionEditor
          key={`${selected.networkId}/${selected.version}`}
          networkId={selected.networkId}
          version={selected.version}
          versionStatus={selected.status}
          onBusy={(label, action) => void run(label, action)}
          error={error}
          busy={busy}
        />
      ) : null}
      {version.isPending && selected ? <ActivityIndicator /> : null}
    </View>
  );
}

function VersionEditor({
  networkId,
  version,
  versionStatus,
  onBusy,
  busy,
}: {
  networkId: string;
  version: string;
  versionStatus: string;
  onBusy: (label: string, action: () => Promise<unknown>) => void;
  busy: string | null;
  error: string | null;
}) {
  const query = useQuery({
    queryKey: navigationKeys.version({ networkId, version }),
    queryFn: ({ signal }) =>
      fetchNavigationVersion({ networkId, version }, signal),
  });
  const [edges, setEdges] = useState<EdgeDraft[] | null>(null);
  const [nextVersion, setNextVersion] = useState(`${version}-editada`);
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const [evidence, setEvidence] = useState('levantamento-campo');

  const graph = query.data?.graph;
  const working = edges ?? graph?.edges ?? null;

  const stats = useMemo(() => {
    if (!working) return null;
    const verified = working.filter(
      (edge) => edge.verification.status === 'verified',
    ).length;
    const missing = working.reduce(
      (sum, edge) => sum + missingAttributes(edge).length,
      0,
    );
    return { total: working.length, verified, missing };
  }, [working]);

  function updateEdge(edgeId: string, patch: Partial<EdgeDraft>) {
    setEdges(
      (working ?? []).map((edge) =>
        edge.id === edgeId ? { ...edge, ...patch } : edge,
      ),
    );
  }

  if (query.isError) return <AdminError message={query.error.message} />;
  if (!graph || !working || !stats) return <ActivityIndicator />;

  return (
    <View className="gap-4">
      <View className="gap-1 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-base font-semibold text-slate-900">
          Levantamento — {networkId}/{version}
        </Text>
        <Text className="text-sm text-slate-600">
          {stats.verified} de {stats.total} trechos conferidos ·{' '}
          {stats.missing === 0
            ? 'atributos completos ✓'
            : `${stats.missing} atributos por medir`}
        </Text>
        <Text className="text-xs text-slate-500">
          Salvar cria uma NOVA versão rascunho (nada é sobrescrito). Publicar
          exige revisão com validade e evidências.
        </Text>
      </View>

      <ScrollView horizontal={false}>
        <View className="gap-3">
          {working.map((edge, index) => {
            const from = graph.nodes.find((n) => n.id === edge.fromNodeId);
            const to = graph.nodes.find((n) => n.id === edge.toNodeId);
            return (
              <View
                key={edge.id}
                className="gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-sm font-semibold text-slate-900">
                    {index + 1}. {from?.name ?? edge.fromNodeId} →{' '}
                    {to?.name ?? edge.toNodeId}
                  </Text>
                  <Text
                    className={`text-xs font-semibold ${
                      edge.verification.status === 'verified'
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}>
                    {edge.verification.status === 'verified'
                      ? 'conferido'
                      : 'não conferido'}
                  </Text>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <Field label="Tipo">
                    <Select
                      value={edge.kind}
                      options={KIND_OPTIONS}
                      onChange={(value) =>
                        updateEdge(edge.id, { kind: value as EdgeDraft['kind'] })
                      }
                    />
                  </Field>
                  <Field label="Comprimento (m)">
                    <NumberInput
                      value={edge.lengthMeters}
                      onChange={(value) =>
                        updateEdge(edge.id, { lengthMeters: value ?? edge.lengthMeters })
                      }
                    />
                  </Field>
                  <Field label="Largura (m)">
                    <NumberInput
                      value={edge.widthMeters}
                      nullable
                      onChange={(value) => updateEdge(edge.id, { widthMeters: value })}
                    />
                  </Field>
                  <Field label="Degraus">
                    <NumberInput
                      value={edge.stepCount}
                      nullable
                      integer
                      onChange={(value) => updateEdge(edge.id, { stepCount: value })}
                    />
                  </Field>
                  <Field label="Inclinação (%)">
                    <NumberInput
                      value={edge.longitudinalSlopePercent}
                      nullable
                      onChange={(value) =>
                        updateEdge(edge.id, { longitudinalSlopePercent: value })
                      }
                    />
                  </Field>
                  <Field label="Corrimão">
                    <Select
                      value={
                        edge.hasHandrail == null ? '' : String(edge.hasHandrail)
                      }
                      options={TRI_OPTIONS}
                      onChange={(value) =>
                        updateEdge(edge.id, {
                          hasHandrail: value === '' ? null : value === 'true',
                        })
                      }
                    />
                  </Field>
                  <Field label="Piso tátil">
                    <Select
                      value={
                        edge.hasTactilePaving == null
                          ? ''
                          : String(edge.hasTactilePaving)
                      }
                      options={TRI_OPTIONS}
                      onChange={(value) =>
                        updateEdge(edge.id, {
                          hasTactilePaving: value === '' ? null : value === 'true',
                        })
                      }
                    />
                  </Field>
                  <Field label="Piso">
                    <Select
                      value={edge.surface ?? ''}
                      options={SURFACE_OPTIONS}
                      onChange={(value) =>
                        updateEdge(edge.id, {
                          surface: (value === '' ? null : value) as EdgeDraft['surface'],
                        })
                      }
                    />
                  </Field>
                  <Field label="Disponibilidade">
                    <Select
                      value={edge.availability.status}
                      options={[
                        ['unknown', 'Desconhecida'],
                        ['open', 'Aberto'],
                        ['closed', 'Interditado'],
                      ] as const}
                      onChange={(value) =>
                        updateEdge(edge.id, {
                          availability:
                            value === 'open'
                              ? {
                                  status: 'open',
                                  checkedAt: new Date().toISOString(),
                                  validUntil: new Date(
                                    Date.now() + 90 * 24 * 3600 * 1000,
                                  ).toISOString(),
                                }
                              : value === 'closed'
                                ? { status: 'closed' }
                                : { status: 'unknown' },
                        })
                      }
                    />
                  </Field>
                  <Field label="Conferido neste levantamento">
                    <Select
                      value={
                        edge.verification.status === 'verified' ? 'yes' : 'no'
                      }
                      options={[
                        ['no', 'Não'],
                        ['yes', 'Sim (com evidência)'],
                      ] as const}
                      onChange={(value) =>
                        updateEdge(edge.id, {
                          verification:
                            value === 'yes'
                              ? {
                                  status: 'verified',
                                  verifiedAt: new Date().toISOString(),
                                  validUntil: new Date(
                                    Date.now() + 90 * 24 * 3600 * 1000,
                                  ).toISOString(),
                                  evidenceIds: [evidence || 'levantamento'],
                                }
                              : { status: 'unverified' },
                        })
                      }
                    />
                  </Field>
                </View>
                {missingAttributes(edge).length > 0 ? (
                  <Text className="text-xs text-amber-700">
                    Falta medir: {missingAttributes(edge).join(', ')}.
                  </Text>
                ) : (
                  <Text className="text-xs text-emerald-700">
                    Atributos completos.
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Salvar nova versão + publicar */}
      <View className="gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-sm font-semibold text-slate-900">
          Salvar e publicar
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <TextInput
            value={nextVersion}
            onChangeText={setNextVersion}
            placeholder="nova versão"
            className="min-h-[40px] w-44 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
          />
          <AdminButton
            disabled={busy !== null}
            onPress={() =>
              onBusy('save', () =>
                importNavigationVersion({
                  ...graph,
                  version: nextVersion,
                  edges: working,
                }),
              )
            }>
            {busy === 'save' ? 'Salvando…' : 'Salvar nova versão'}
          </AdminButton>
        </View>
        {versionStatus !== 'published' ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <TextInput
              value={validUntil}
              onChangeText={setValidUntil}
              placeholder="validade (AAAA-MM-DD)"
              className="min-h-[40px] w-40 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
            />
            <TextInput
              value={evidence}
              onChangeText={setEvidence}
              placeholder="evidências (id)"
              className="min-h-[40px] w-48 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
            />
            <AdminButton
              primary
              disabled={busy !== null}
              onPress={() =>
                onBusy('publish', () =>
                  publishNavigationVersion(
                    { networkId, version },
                    {
                      review: {
                        validUntil: new Date(`${validUntil}T12:00:00Z`).toISOString(),
                        evidenceIds: evidence
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      },
                    },
                  ),
                )
              }>
              {busy === 'publish' ? 'Publicando…' : 'Publicar com revisão'}
            </AdminButton>
          </View>
        ) : (
          <Text className="text-xs text-emerald-700">
            Versão publicada — importe uma nova revisão para alterar.
          </Text>
        )}
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold text-slate-500">{label}</Text>
      {children}
    </View>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-1">
      {options.map(([optionValue, label]) => (
        <Pressable
          key={optionValue}
          onPress={() => onChange(optionValue)}
          className={`min-h-[32px] justify-center rounded-md border px-2 ${
            value === optionValue
              ? 'border-sky-500 bg-sky-100'
              : 'border-slate-300 bg-slate-50'
          }`}>
          <Text className="text-xs text-slate-800">{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function NumberInput({
  value,
  onChange,
  nullable = false,
  integer = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  nullable?: boolean;
  integer?: boolean;
}) {
  return (
    <TextInput
      value={value == null ? '' : String(value)}
      onChangeText={(text) => {
        if (text === '') {
          onChange(nullable ? null : 0);
          return;
        }
        const parsed = integer ? Number.parseInt(text, 10) : Number.parseFloat(text);
        onChange(Number.isFinite(parsed) ? parsed : (nullable ? null : 0));
      }}
      keyboardType="numeric"
      className="min-h-[36px] w-24 rounded-md border border-slate-300 px-2 text-sm text-slate-900"
    />
  );
}
