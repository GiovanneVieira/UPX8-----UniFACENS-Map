import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createPlace,
  fetchPlace,
  fetchPlaces,
  updatePlace,
  type PlaceFilters,
} from "../services/places-api";
import type { CreatePlaceDto } from "shared";

export const placeKeys = {
  all: ["places"] as const,
  list: (filters: PlaceFilters) => [...placeKeys.all, "list", filters] as const,
  detail: (id: string | null) => [...placeKeys.all, "detail", id] as const,
};

export function usePlaceQuery(id: string | null) {
  return useQuery({
    queryKey: placeKeys.detail(id),
    queryFn: ({ signal }) => fetchPlace(id!, signal),
    enabled: id !== null,
  });
}

export function usePlacesQuery(filters: PlaceFilters) {
  return useInfiniteQuery({
    queryKey: placeKeys.list(filters),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchPlaces(filters, pageParam, signal),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
  });
}

export function useSavePlaceMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id?: string; dto: CreatePlaceDto }) =>
      id ? updatePlace(id, dto) : createPlace(dto),
    onSuccess: async (place) => {
      await client.invalidateQueries({ queryKey: placeKeys.all });
      client.setQueryData(placeKeys.detail(place.id), place);
    },
  });
}
