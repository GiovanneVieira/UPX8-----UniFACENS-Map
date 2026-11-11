import { useQuery } from '@tanstack/react-query';
import { fetchCategories } from '../services/categories-api';

export const categoryKeys = {
  all: ['categories'] as const,
};

/**
 * Hook do TanStack Query para as categorias — mudanças no painel admin
 * invalidam esta chave e todas as UIs (filtros, forms, seletor do pin AR)
 * reagem sem deploy.
 */
export function useCategoriesQuery() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: ({ signal }) => fetchCategories(signal),
    staleTime: 5 * 60 * 1000,
  });
}
