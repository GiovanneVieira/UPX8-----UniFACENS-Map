import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { adminApi } from '../services/admin-api';
import type { AnchorDetail, CreateAnchorDto } from 'shared';

export type AdminSection =
  | 'points'
  | 'categories'
  | 'models'
  | 'orphans'
  | 'users';

const SECTIONS: AdminSection[] = [
  'points',
  'categories',
  'models',
  'orphans',
  'users',
];

/** Seção inicial vem da URL (?section=…) — F5 mantém a aba ativa. */
function sectionFromParams(param: string | string[] | undefined): AdminSection {
  const value = Array.isArray(param) ? param[0] : param;
  return SECTIONS.includes(value as AdminSection) ? (value as AdminSection) : 'points';
}

const SIDEBAR_PREF_KEY = 'admin-sidebar-collapsed';

/** Preferência de colapso da sidebar: localStorage > default por largura (<768px = rail). */
function initialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = window.localStorage.getItem(SIDEBAR_PREF_KEY);
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  return window.innerWidth < 768;
}

export function useAdminPanel() {
  const auth = useAuth();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<AdminSection>(() =>
    sectionFromParams(params.section),
  );
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AnchorDetail | null>(null);
  const [notice, setNotice] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const filters = { search, offset, limit: 20 };

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_PREF_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const points = useQuery({
    queryKey: ['admin', auth.user?.id, 'points', filters],
    queryFn: ({ signal }) => adminApi.points(filters, signal),
    enabled: auth.isAdmin && section === 'points',
    retry: false,
  });
  const users = useQuery({
    queryKey: ['admin', auth.user?.id, 'users', filters],
    queryFn: ({ signal }) => adminApi.users(filters, signal),
    enabled: auth.isAdmin && section === 'users',
    retry: false,
  });
  // Órfãs: roda sempre que admin (alimenta o badge da nav) — staleness 60s.
  const orphans = useQuery({
    queryKey: ['admin', auth.user?.id, 'orphans'],
    queryFn: ({ signal }) => adminApi.orphanAnchors(signal),
    enabled: auth.isAdmin,
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: false,
  });
  // Categorias (para o seletor do form de adoção de órfãs).
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => adminApi.categories.list(signal),
    enabled: auth.isAdmin && section === 'orphans',
    staleTime: 60_000,
    retry: false,
  });
  const adoptOrphan = useMutation({
    mutationFn: (dto: CreateAnchorDto) => adminApi.adoptOrphan(dto),
    onSuccess: async (anchor) => {
      setNotice(`Ponto "${anchor.name}" adotado — visível no AR na próxima sessão.`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin'] }),
        client.invalidateQueries({ queryKey: ['anchors'] }),
        client.invalidateQueries({ queryKey: ['categories'] }),
      ]);
    },
  });

  const query = section === 'users' ? users : points;
  function changeSection(value: AdminSection) {
    setSection(value);
    setSearch('');
    setDraft('');
    setOffset(0);
    setNotice('');
    // Aba na URL: F5/deep-link volta direto na seção ("points" limpa o param).
    router.replace(value === 'points' ? '/admin' : `/admin?section=${value}`);
  }
  function submitSearch() {
    setSearch(draft.trim());
    setOffset(0);
  }
  async function refresh(message: string, deleted = false) {
    setNotice(message);
    if (deleted) {
      setSelected(null);
      if (points.data?.items.length === 1 && offset > 0) setOffset(offset - 20);
    }
    await Promise.all([
      client.invalidateQueries({ queryKey: ['admin'] }),
      client.invalidateQueries({ queryKey: ['anchors'] }),
      client.invalidateQueries({ queryKey: ['categories'] }),
    ]);
  }
  const toggleSidebar = useCallback(() => setSidebarCollapsed((value) => !value), []);
  return {
    auth,
    section,
    changeSection,
    search,
    draft,
    setDraft,
    submitSearch,
    offset,
    setOffset,
    points,
    users,
    orphans,
    categories,
    adoptOrphan,
    query,
    selected,
    setSelected,
    notice,
    refresh,
    sidebarCollapsed,
    toggleSidebar,
  };
}
