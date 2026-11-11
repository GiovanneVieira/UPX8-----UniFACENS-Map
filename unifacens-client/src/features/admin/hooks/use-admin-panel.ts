import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { adminApi } from '../services/admin-api';
import type { AnchorDetail } from 'shared';

export type AdminSection = 'points' | 'categories' | 'models' | 'users';

const SECTIONS: AdminSection[] = ['points', 'categories', 'models', 'users'];

/** Seção inicial vem da URL (?section=…) — F5 mantém a aba ativa. */
function sectionFromParams(param: string | string[] | undefined): AdminSection {
  const value = Array.isArray(param) ? param[0] : param;
  return SECTIONS.includes(value as AdminSection) ? (value as AdminSection) : 'points';
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
  const filters = { search, offset, limit: 20 };
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
    query,
    selected,
    setSelected,
    notice,
    refresh,
  };
}
