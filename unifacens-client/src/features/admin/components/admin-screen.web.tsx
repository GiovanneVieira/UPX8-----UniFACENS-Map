import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import Head from 'expo-router/head';
import { Ionicons } from '@expo/vector-icons';
import { useAdminPanel, type AdminSection } from '../hooks/use-admin-panel';
import { AdminButton, AdminError, Pagination } from './admin-ui';
import { PointEditor } from './point-editor.web';
import { CategoryManager } from './category-manager.web';
import { ModelManager } from './model-manager.web';

const SECTIONS: Array<{
  key: AdminSection;
  label: string;
  icon: keyof typeof ICONS;
}> = [
  { key: 'points', label: 'Pontos do campus', icon: 'location-outline' },
  { key: 'categories', label: 'Categorias', icon: 'pricetags-outline' },
  { key: 'models', label: 'Modelos 3D', icon: 'cube-outline' },
  { key: 'users', label: 'Usuários', icon: 'people-outline' },
];

const ICONS = {
  'location-outline': 'location-outline',
  'pricetags-outline': 'pricetags-outline',
  'cube-outline': 'cube-outline',
  'people-outline': 'people-outline',
} as const;

const SECTION_HEADINGS: Record<AdminSection, { title: string; subtitle: string }> = {
  points: {
    title: 'Pontos do campus',
    subtitle: 'Mantenha as informações, categorias e imagens dos pontos sempre atualizadas.',
  },
  categories: {
    title: 'Categorias',
    subtitle: 'Organize locais e pontos AR — cada categoria pode renderizar um modelo 3D próprio.',
  },
  models: {
    title: 'Modelos 3D',
    subtitle: 'Envie GLB, glTF, OBJ ou FBX (convertido para GLB) e vincule às categorias.',
  },
  users: {
    title: 'Usuários cadastrados',
    subtitle: 'Consulte as contas e os perfis de acesso à plataforma.',
  },
};

export function AdminScreen() {
  const panel = useAdminPanel();
  const { auth, section, query, points, users } = panel;
  if (!auth.isAdmin)
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-slate-50 p-8">
        <Text
          accessibilityRole="header"
          className="text-2xl font-bold text-slate-900"
        >
          Acesso restrito
        </Text>
        <Text className="text-center text-slate-600">
          Este painel é exclusivo dos administradores do campus.
        </Text>
        <Link href="/campus" className="p-4 font-semibold text-blue-700">
          Voltar ao mapa
        </Link>
      </View>
    );
  return (
    <>
      <Head>
        <title>Administração — UniFACENS Map</title>
      </Head>
      <View className="flex-1 bg-slate-50 md:flex-row">
        <View className="gap-5 bg-slate-950 px-5 py-6 md:w-64 md:py-9">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-blue-600">
              <Ionicons name="map-outline" size={24} color="white" />
            </View>
            <View>
              <Text className="text-lg font-bold text-white">UniFACENS</Text>
              <Text className="text-xs tracking-widest text-slate-400">
                MAP · ADMINISTRAÇÃO
              </Text>
            </View>
          </View>
          <Text className="mt-3 hidden text-xs font-semibold uppercase tracking-widest text-slate-400 md:flex">
            Área de gestão
          </Text>
          <View className="flex-row gap-2 md:flex-col">
            {SECTIONS.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: section === item.key }}
                onPress={() => panel.changeSection(item.key)}
                className={`min-h-[48px] flex-1 flex-row items-center gap-3 rounded-xl px-4 py-3 md:flex-none ${section === item.key ? 'bg-blue-600' : 'bg-slate-900'}`}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color="white"
                />
                <Text className="font-semibold text-white">{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <View className="hidden flex-1 md:flex" />
          <Link
            href="/campus"
            className="py-3 text-sm font-semibold text-sky-300"
          >
            ← Voltar ao mapa
          </Link>
          <View className="gap-2 border-t border-slate-800 pt-4">
            <Text className="font-semibold text-white" numberOfLines={1}>
              {auth.user?.name}
            </Text>
            <Text className="text-xs text-slate-400">Administrador</Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
              onPress={() => void auth.signOut()}
            >
              <Text className="text-sm text-slate-300">Sair da conta</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mx-auto w-full max-w-6xl gap-7 px-4 py-7 md:px-10 md:py-10">
            <View className="flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <View className="flex-1">
                <Text className="text-xs font-bold uppercase tracking-widest text-blue-700">
                  Painel administrativo
                </Text>
                <Text
                  accessibilityRole="header"
                  className="mt-2 text-3xl font-bold text-slate-900"
                >
                  {SECTION_HEADINGS[section].title}
                </Text>
                <Text className="mt-2 text-base text-slate-600">
                  {SECTION_HEADINGS[section].subtitle}
                </Text>
              </View>
              {(section === 'points' || section === 'users') && (
                <AdminButton
                  disabled={query.isFetching}
                  onPress={() => void query.refetch()}
                >
                  {query.isFetching ? 'Atualizando…' : 'Atualizar lista'}
                </AdminButton>
              )}
            </View>
            {(section === 'points' || section === 'users') && (
              <View className="flex-row items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5">
                <View className="h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                  <Ionicons
                    name={
                      section === 'points'
                        ? 'location-outline'
                        : 'people-outline'
                    }
                    size={24}
                    color="#1d4ed8"
                  />
                </View>
                <View>
                  <Text className="text-3xl font-bold text-slate-900">
                    {query.data?.total ?? '—'}
                  </Text>
                  <Text className="text-sm text-slate-500">
                    {panel.search
                      ? 'Resultados da consulta'
                      : section === 'points'
                        ? 'Pontos cadastrados'
                        : 'Contas cadastradas'}
                  </Text>
                </View>
              </View>
            )}
            {!!panel.notice && (
              <Text
                accessibilityLiveRegion="polite"
                className="rounded-xl bg-emerald-50 p-4 text-emerald-800"
              >
                {panel.notice}
              </Text>
            )}
            {section === 'categories' && (
              <View className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
                <CategoryManager
                  notice={(message) => panel.refresh(message)}
                />
              </View>
            )}
            {section === 'models' && (
              <View className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
                <ModelManager notice={(message) => panel.refresh(message)} />
              </View>
            )}
            {(section === 'points' || section === 'users') && (
              <View className="gap-5 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
              <View className="gap-2">
                <Text className="text-sm font-semibold text-slate-700">
                  {section === 'points' ? 'Buscar ponto' : 'Buscar usuário'}
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    accessibilityLabel={
                      section === 'points' ? 'Buscar ponto' : 'Buscar usuário'
                    }
                    placeholder={
                      section === 'points'
                        ? 'Nome ou descrição do ponto'
                        : 'Nome ou e-mail'
                    }
                    placeholderTextColor="#64748b"
                    value={panel.draft}
                    onChangeText={panel.setDraft}
                    onSubmitEditing={panel.submitSearch}
                    maxLength={100}
                    className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-slate-900"
                  />
                  <AdminButton primary onPress={panel.submitSearch}>
                    Buscar
                  </AdminButton>
                </View>
              </View>
              {query.isPending ? (
                <View className="items-center gap-3 py-16">
                  <ActivityIndicator color="#1d4ed8" />
                  <Text
                    accessibilityLiveRegion="polite"
                    className="text-slate-600"
                  >
                    Carregando dados…
                  </Text>
                </View>
              ) : query.isError ? (
                <AdminError
                  message={query.error.message}
                  retry={() => void query.refetch()}
                />
              ) : (
                <>
                  {query.data?.items.length === 0 && (
                    <View className="items-center gap-2 py-16">
                      <Ionicons
                        name="search-outline"
                        size={32}
                        color="#64748b"
                      />
                      <Text className="text-lg font-semibold text-slate-800">
                        Nenhum resultado encontrado
                      </Text>
                      <Text className="text-center text-slate-500">
                        Tente outro nome ou limpe a busca para ver todos os
                        registros.
                      </Text>
                    </View>
                  )}
                  {section === 'points' &&
                    points.data?.items.map((point) => (
                      <View
                        key={point.id}
                        className="flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center"
                      >
                        <View className="flex-1 gap-2">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-base font-bold text-slate-900">
                              {point.name}
                            </Text>
                          </View>
                          <Text
                            numberOfLines={2}
                            className="text-sm leading-5 text-slate-600"
                          >
                            {point.description || 'Sem descrição cadastrada.'}
                          </Text>
                          <Text className="text-xs text-slate-500">
                            {point.images.length}{' '}
                            {point.images.length === 1 ? 'imagem' : 'imagens'} ·{' '}
                            {point.latitude != null && point.longitude != null
                              ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
                              : 'Coordenadas não informadas'}
                          </Text>
                        </View>
                        <AdminButton
                          label={`Editar ${point.name}`}
                          onPress={() => panel.setSelected(point)}
                        >
                          Editar ponto
                        </AdminButton>
                      </View>
                    ))}
                  {section === 'users' &&
                    users.data?.items.map((user) => (
                      <View
                        key={user.id}
                        className="flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-center"
                      >
                        <View className="h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                          <Text className="font-bold text-slate-600">
                            {user.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View className="flex-1 gap-1">
                          <Text className="font-bold text-slate-900">
                            {user.name}
                          </Text>
                          <Text className="text-sm text-slate-600">
                            {user.email}
                          </Text>
                          <Text className="text-xs text-slate-500">
                            Desde{' '}
                            {new Date(user.createdAt).toLocaleDateString(
                              'pt-BR',
                            )}{' '}
                            ·{' '}
                            {user.emailVerified
                              ? 'E-mail verificado'
                              : 'E-mail não verificado'}
                          </Text>
                        </View>
                        <View className="flex-row gap-2">
                          <Text className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                            {user.role === 'admin'
                              ? 'Administrador'
                              : 'Usuário'}
                          </Text>
                          {user.banned && (
                            <Text className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                              Bloqueado
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  <Pagination
                    offset={panel.offset}
                    total={query.data?.total ?? 0}
                    busy={query.isFetching}
                    onChange={panel.setOffset}
                  />
                </>
              )}
              </View>
            )}
            <Text className="text-xs text-slate-500">
              UniFACENS Map · Gestão do campus
            </Text>
          </View>
        </ScrollView>
      </View>
      {panel.selected && (
        <PointEditor
          key={panel.selected.id}
          point={panel.selected}
          close={() => panel.setSelected(null)}
          refresh={panel.refresh}
        />
      )}
    </>
  );
}
export default AdminScreen;
