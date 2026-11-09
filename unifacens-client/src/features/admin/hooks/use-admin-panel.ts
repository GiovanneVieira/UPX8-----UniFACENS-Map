import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { adminApi } from '../services/admin-api';
import type { AnchorDetail } from 'shared';

export function useAdminPanel() {
  const auth = useAuth();
  const client = useQueryClient();
  const [section, setSection] = useState<'points' | 'users'>('points');
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
  const query = section === 'points' ? points : users;
  function changeSection(value: 'points' | 'users') {
    setSection(value);
    setSearch('');
    setDraft('');
    setOffset(0);
    setNotice('');
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
