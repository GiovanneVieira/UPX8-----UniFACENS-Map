import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAnchors,
  createAnchor,
  deleteAnchor,
} from '@/services/api';
import type { CreateAnchorDto } from 'shared';

export const anchorKeys = {
  all: ['anchors'] as const,
  lists: () => [...anchorKeys.all, 'list'] as const,
  detail: (id: string) => [...anchorKeys.all, 'detail', id] as const,
};

/**
 * Hook do TanStack Query para buscar todas as âncoras salvas.
 */
export function useAnchorsQuery() {
  return useQuery({
    queryKey: anchorKeys.lists(),
    queryFn: fetchAnchors,
  });
}

/**
 * Hook de mutação para criar uma âncora vinculada ao Cloud Anchor ID.
 */
export function useCreateAnchorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateAnchorDto) => createAnchor(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anchorKeys.all });
    },
  });
}

/**
 * Hook de mutação para excluir uma âncora com invalidação de cache.
 */
export function useDeleteAnchorMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAnchor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anchorKeys.all });
    },
  });
}
