import {
  createPlaceSchema,
  updatePlaceSchema,
  placeSchema,
  placesPageSchema,
  type CreatePlaceDto,
  type PlacesPage,
  type PlaceCategory,
  type UpdatePlaceDto,
} from "shared";
import { getApiBaseUrl } from "@/services/api";

export interface PlaceFilters {
  search: string;
  category?: PlaceCategory;
}

export async function fetchPlace(id: string, signal: AbortSignal) {
  const response = await fetch(`${getApiBaseUrl()}/places/${id}`, { signal });
  if (!response.ok)
    throw new Error("Não foi possível carregar os detalhes do local.");
  return placeSchema.parse(await response.json());
}

export async function fetchPlaces(
  filters: PlaceFilters,
  offset: number,
  signal: AbortSignal,
): Promise<PlacesPage> {
  const params = new URLSearchParams({ limit: "50", offset: String(offset) });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.category) params.set("category", filters.category);
  const response = await fetch(`${getApiBaseUrl()}/places?${params}`, {
    signal,
  });
  if (!response.ok)
    throw new Error("Não foi possível carregar os locais. Tente novamente.");
  return placesPageSchema.parse(await response.json());
}

export async function createPlace(dto: CreatePlaceDto) {
  const response = await fetch(`${getApiBaseUrl()}/places`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createPlaceSchema.parse(dto)),
  }).catch(() => {
    throw new Error(
      "Não foi possível salvar o local. Confira a conexão e tente novamente.",
    );
  });
  if (!response.ok)
    throw new Error(
      "Não foi possível salvar o local. Confira os dados e tente novamente.",
    );
  return placeSchema.parse(await response.json());
}

export async function updatePlace(id: string, dto: UpdatePlaceDto) {
  const response = await fetch(`${getApiBaseUrl()}/places/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatePlaceSchema.parse(dto)),
  }).catch(() => {
    throw new Error(
      "Não foi possível atualizar o local. Confira a conexão e tente novamente.",
    );
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "Este local não está mais disponível. Feche a edição e atualize a lista."
        : "Não foi possível atualizar o local. Confira a conexão e tente novamente.",
    );
  return placeSchema.parse(await response.json());
}
